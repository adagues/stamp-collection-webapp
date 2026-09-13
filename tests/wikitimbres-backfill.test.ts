import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'csv-parse/sync';
import { parseSiteTotal } from '../scripts/wikitimbres/discover';
import { PageCache } from '../scripts/wikitimbres/fetch';
import { IMAGE_CREDIT, parseStamp } from '../scripts/wikitimbres/parse';
import { RequestGate } from '../scripts/wikitimbres/policy';
import { CatalogStore } from '../scripts/wikitimbres/store';
import { DiscoveryPlan } from '../scripts/wikitimbres/discovery-plan';

const directories: string[] = [];
// Fixture synthétique : structure représentative, contenu inventé, aucune page tierce publiée.
const notice = () => readFile(new URL('./fixtures/wikitimbres-synthetic.html', import.meta.url), 'utf8');
async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), 'stamp-vault-backfill-'));
  directories.push(directory);
  return directory;
}
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('complément d’illustrations et garde-fou hors ligne', () => {
  it('lit le total annoncé par la bannière d’un listing', async () => {
    const listing = await readFile(new URL('./fixtures/wikitimbres-annee-2020.html', import.meta.url), 'utf8');
    expect(parseSiteTotal(listing)).toBe(4242);
    expect(parseSiteTotal('<div>rien à annoncer</div>')).toBeNull();
  });

  it('rouvre seulement les notices exportées sans illustration, dans la limite demandée', async () => {
    const directory = await workspace();
    const store = new CatalogStore(join(directory, 'manifest.json'), join(directory, 'catalog.csv'));
    await store.load();
    const plan = new DiscoveryPlan(join(directory, 'discovery.json'));
    await plan.load();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const html = await notice();
    const withoutImage = parseStamp(html, 1, 'https://www.wikitimbres.fr/timbres/1')!;
    const withImage = parseStamp(html, 2, 'https://www.wikitimbres.fr/timbres/2', { images: true })!;
    await store.save(1, withoutImage);
    await store.save(2, withImage);
    await plan.completeListing('https://www.wikitimbres.fr/timbres/annee/1850/1850', [1, 2], 2);
    await plan.completeNotice(1, 'exported');
    await plan.completeNotice(2, 'exported');

    expect(await store.reopenWithoutImage(plan, 10)).toEqual([1]);
    expect(plan.pendingNotices()).toEqual([1]);
    expect(plan.noticeState(2)).toBe('exported');
    // Idempotent: the same notice stays the target until it actually gets an illustration.
    expect(await store.reopenWithoutImage(plan, 10)).toEqual([1]);
    expect(plan.pendingNotices()).toEqual([1]);
    // Once the row carries an illustration, it is no longer a backfill target.
    await store.save(1, withImage);
    expect(store.idsWithoutImage()).toEqual([]);
  });

  it('respecte la limite quand plusieurs notices manquent d’illustration', async () => {
    const directory = await workspace();
    const store = new CatalogStore(join(directory, 'manifest.json'), join(directory, 'catalog.csv'));
    await store.load();
    const plan = new DiscoveryPlan(join(directory, 'discovery.json'));
    await plan.load();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const html = await notice();
    for (const id of [1, 2, 3]) {
      await store.save(id, parseStamp(html, id, `https://www.wikitimbres.fr/timbres/${id}`)!);
      await plan.completeNotice(id, 'exported');
    }
    expect(await store.reopenWithoutImage(plan, 2)).toEqual([1, 2]);
    expect(plan.pendingNotices()).toEqual([1, 2]);
  });

  it('complète l’illustration d’une notice déjà exportée sans changer son identifiant', async () => {
    const directory = await workspace();
    const output = join(directory, 'catalog.csv');
    const store = new CatalogStore(join(directory, 'manifest.json'), output);
    await store.load();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const html = await notice();
    await store.save(1, parseStamp(html, 1, 'https://www.wikitimbres.fr/timbres/1')!);
    await store.save(1, parseStamp(html, 1, 'https://www.wikitimbres.fr/timbres/1', { images: true })!);
    const rows = parse(await readFile(output, 'utf8'), { columns: true }) as Record<string, string>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('wikitimbres-1');
    expect(rows[0].image_url).toBe('https://www.wikitimbres.fr/public/stamps/800/ESSAI-1902-7.jpg');
    expect(rows[0].image_credit).toBe(IMAGE_CREDIT);
  });

  it('interdit toute requête réseau quand WIKITIMBRES_OFFLINE est demandé', async () => {
    const directory = await workspace();
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    vi.stubEnv('WIKITIMBRES_OFFLINE', '1');
    const cache = new PageCache(directory, new RequestGate(0));
    await expect(cache.load('https://www.wikitimbres.fr/timbres/1')).rejects.toThrow(/hors ligne/i);
    expect(network).not.toHaveBeenCalled();
  });
});
