import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { atomicWrite } from './fetch';
import { type CatalogRow, FIELDS } from './parse';

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
  async save(id: number, row: CatalogRow): Promise<void> {
    const existing = Object.values(this.manifest.rows).find(item => item.source_url === row.source_url);
    const stableId = existing?.id ?? row.id;
    this.manifest.rows[stableId] = { ...row, id: stableId };
    this.manifest.processed[String(id)] = stableId;
    await atomicWrite(this.path, JSON.stringify(this.manifest, null, 2) + '\n');
    await this.export();
  }
  private async export(): Promise<void> {
    const rows = Object.values(this.manifest.rows).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    await atomicWrite(this.output, csv(rows));
  }
}
