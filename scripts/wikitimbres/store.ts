import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { atomicWrite } from './fetch';
import { type CatalogRow, FIELDS } from './parse';
import { ORIGIN } from './policy';
import type { NoticeState } from './discovery-plan';

/** Minimal view of the discovery plan needed for a backfill pass (keeps the modules decoupled). */
type PlanLike = {
  noticeState(id: number): NoticeState | null | undefined;
  completeListing(url: string, ids: number[], announced?: number | null): Promise<number>;
  reopenNotice(id: number): Promise<void>;
};
// Backfilled notices come from the local manifest, not from a listing; record them under
// the site's own year index so the plan schema (and its URL check) stays unchanged.
const BACKFILL_YEAR = new Date().getUTCFullYear();
const BACKFILL_LISTING = `${ORIGIN}/timbres/annee/${BACKFILL_YEAR}/${BACKFILL_YEAR}`;

type Manifest = { version: 1; rows: Record<string, CatalogRow>; processed: Record<string, string> };
export const csv = (rows: CatalogRow[]) => [FIELDS, ...rows.map(row => FIELDS.map(field => row[field]))]
  .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';

export async function lockRun(directory: string): Promise<() => Promise<void>> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'run.lock');
  let handle;
  try { handle = await open(path, 'wx'); }
  catch { throw new Error('Verrou de collecte présent ou inaccessible : vérifier data/cache/wikitimbres/run.lock.'); }
  await handle.writeFile(String(process.pid));
  await handle.close();
  return () => unlink(path);
}

export class CatalogStore {
  private manifest: Manifest = { version: 1, rows: {}, processed: {} };
  constructor(private path: string, private output: string) {}
  async load(): Promise<void> {
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8')) as Manifest;
      if (data.version !== 1 || !data.rows || !data.processed ||
          Object.entries(data.rows).some(([id, row]) => row.id !== id || FIELDS.some(field => typeof row[field] !== 'string')) ||
          Object.values(data.processed).some(id => !Object.hasOwn(data.rows, id))) {
        throw new Error('Manifeste invalide : reprise arrêtée pour protéger le catalogue.');
      }
      this.manifest = data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await mkdir(dirname(this.output), { recursive: true });
    // The manifest is authoritative; recover CSV after an interruption between writes.
    await this.export();
  }
  has(id: number): boolean { return Object.hasOwn(this.manifest.processed, String(id)); }
  /** Notice ids exported so far whose row carries no illustration yet. */
  idsWithoutImage(): number[] {
    return Object.entries(this.manifest.processed)
      .filter(([, stableId]) => !this.manifest.rows[stableId]?.image_url)
      .map(([id]) => Number(id)).filter(Number.isSafeInteger).sort((a, b) => a - b);
  }
  /** Queue already-exported notices lacking an illustration; returns the ids to revisit. */
  async reopenWithoutImage(plan: PlanLike, limit: number): Promise<number[]> {
    const reopened: number[] = [];
    for (const id of this.idsWithoutImage()) {
      if (reopened.length >= limit) break;
      // Register the notice if the plan never saw it (rows exported by a range run), then
      // put it back in the pending queue unless it is already waiting there.
      if (plan.noticeState(id) === undefined) await plan.completeListing(BACKFILL_LISTING, [id], null);
      else if (plan.noticeState(id) !== null) await plan.reopenNotice(id);
      reopened.push(id);
    }
    return reopened;
  }
  async save(id: number, row: CatalogRow): Promise<void> {
    const existing = Object.values(this.manifest.rows).find(item => item.source_url === row.source_url);
    const stableId = existing?.id ?? row.id;
    // A run without --images produces empty image fields because it never looked for an
    // illustration — not because the notice has none. Keep the one already recorded instead
    // of silently erasing work done by an earlier --images or --backfill-images pass.
    const kept = !row.image_url && existing?.image_url
      ? { image_url: existing.image_url, image_credit: existing.image_credit }
      : {};
    this.manifest.rows[stableId] = { ...row, ...kept, id: stableId };
    this.manifest.processed[String(id)] = stableId;
    await atomicWrite(this.path, JSON.stringify(this.manifest, null, 2) + '\n');
    await this.export();
  }
  private async export(): Promise<void> {
    const rows = Object.values(this.manifest.rows).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    await atomicWrite(this.output, csv(rows));
  }
}
