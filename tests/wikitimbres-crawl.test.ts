import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readListing, visitNotice } from '../scripts/wikitimbres/crawl';
import { DiscoveryPlan } from '../scripts/wikitimbres/discovery-plan';
import { CatalogStore } from '../scripts/wikitimbres/store';
import { parseStamp } from '../scripts/wikitimbres/parse';

const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const year1849 = read('wikitimbres-annee-1849.html');
const year2020 = read('wikitimbres-annee-2020.html');
// Structural notice HTML written here on purpose: the shared real-page fixture belongs to
// another workstream, and these tests only need labelled facts plus one thumbnail.
const STAMP_IMAGE = 'https://www.wikitimbres.fr/public/stamps/800/ESSAI-1900-1.jpg';
const noticePage = (id: number, image = STAMP_IMAGE) => `<!doctype html><html><body>
  <h1>Timbre : Essai structurel ${id}</h1>
  <div class="thumbnail"><img src="${image}" alt=""></div>
  <table>
    <tr><td class="timInfoLabel">Pays :</td><td class="timInfo">France</td></tr>
    <tr><td class="timInfoLabel">Émission :</td><td class="timInfo">12 janvier 1900</td></tr>
    <tr><td class="timInfoLabel">Groupe :</td><td class="timInfo">Essai</td></tr>
    <tr><td class="timInfoLabel">Valeur :</td><td class="timInfo">10 c</td></tr>
  </table>
</body></html>`;

const workspaces: string[] = [];
const workspace = () => {
  const directory = mkdtempSync(join(tmpdir(), 'stamp-vault-crawl-'));
  workspaces.push(directory);
  return directory;
};
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of workspaces.splice(0)) rmSync(directory, { recursive: true, force: true });
});
const page = (url: string, body: string) => ({
  url, status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body,
});

describe('lecture d’un listing : un seul point de reprise, aucune perte de liens', () => {
  it('enregistre identifiants, total, pagination et années en une écriture', async () => {
    const directory = workspace();
    const path = join(directory, 'discovery.json');
    let writes = 0;
    const plan = new DiscoveryPlan(path, async (target, content) => {
      writes++;
      const { writeFile } = await import('node:fs/promises');
      await writeFile(target, content, 'utf8');
    });
    await plan.load();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const url = 'https://www.wikitimbres.fr/timbres/annee/2020/2020';
    writes = 0;
    const outcome = await readListing(url, plan, async () => page(url, year2020));
    expect(writes).toBe(1);
    // La fixture synthétique publie 3 liens de notices, un total annoncé de « (120 Timbres) »,
    // la bannière du listing et 3 liens de pagination : toutes ces valeurs sont inventées.
    expect(outcome).toMatchObject({ ids: 3, announced: 120, siteTotal: 4242, newNotices: 3 });

    const resumed = new DiscoveryPlan(path);
    await resumed.load();
    expect(resumed.pendingNotices()).toEqual([7201, 7202, 7203]);
    expect(resumed.nextListing()).toBe('https://www.wikitimbres.fr/timbres/annee/2020/2020/40');
    expect(resumed.coverage()).toMatchObject({ listingsDone: 1, listingsPending: 3, announcedTotal: 120 });
  });

  it('ne perd ni les années ni les notices quand l’exécution s’arrête juste après le listing', async () => {
    const directory = workspace();
    const path = join(directory, 'discovery.json');
    const plan = new DiscoveryPlan(path);
    await plan.load();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const url = 'https://www.wikitimbres.fr/timbres/annee/1849/1849';
    await readListing(url, plan, async () => page(url, year1849));
    // Simulate the crash window: the process dies right after the listing was recorded, then a
    // fresh plan is loaded from disk. The 157 other years and the 8 notices must still be there.
    const resumed = new DiscoveryPlan(path);
    await resumed.load();
    expect(resumed.coverage()).toMatchObject({ listingsDone: 1, listingsPending: 157, announcedTotal: 8 });
    expect(resumed.pendingNotices()).toEqual([7101, 7102, 7103, 7104, 7105, 7106, 7107, 7108]);
    expect(resumed.nextListing()).toMatch(/^https:\/\/www\.wikitimbres\.fr\/timbres\/annee\/\d{4}\/\d{4}$/);
  });

  it('marque un listing absent comme traité sans inventer de liens', async () => {
    const directory = workspace();
    const plan = new DiscoveryPlan(join(directory, 'discovery.json'));
    await plan.load();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const url = 'https://www.wikitimbres.fr/timbres/annee/1851/1851';
    const outcome = await readListing(url, plan, async () => null);
    expect(outcome).toMatchObject({ ids: 0, announced: null });
    expect(plan.coverage()).toMatchObject({ listingsDone: 1, listingsPending: 0, noticesDiscovered: 0 });
  });
});

describe('visite d’une notice : ne jamais écraser une illustration déjà exportée', () => {
  async function state() {
    const directory = workspace();
    const store = new CatalogStore(join(directory, 'manifest.json'), join(directory, 'catalog.csv'));
    await store.load();
    const plan = new DiscoveryPlan(join(directory, 'discovery.json'));
    await plan.load();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    return { directory, store, plan };
  }
  const source = (id: number) => `https://www.wikitimbres.fr/timbres/${id}`;

  it('ignore sans requête une notice déjà exportée par une plage précédente', async () => {
    const { store, plan } = await state();
    // The row comes from an earlier range run: it is in the manifest but unknown to the plan.
    await store.save(7, parseStamp(noticePage(7), 7, source(7), { images: true })!);
    await plan.completeListing('https://www.wikitimbres.fr/timbres/annee/1850/1850', [7], 1);
    const load = vi.fn(async () => page(source(7), noticePage(7)));

    const outcome = await visitNotice(7, plan, store, load, { images: false, force: false });
    expect(load).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ state: 'exported', fetched: false, saved: false });
    // The plan is synchronised from the manifest, so the notice leaves the pending queue.
    expect(plan.noticeState(7)).toBe('exported');
    expect(plan.pendingNotices()).toEqual([]);
    expect(store.idsWithoutImage()).toEqual([]);
  });

  it('conserve l’illustration existante quand la notice est revue sans --images', async () => {
    const { store, plan } = await state();
    const withImage = parseStamp(noticePage(8), 8, source(8), { images: true })!;
    await store.save(8, withImage);
    await plan.completeListing('https://www.wikitimbres.fr/timbres/annee/1850/1850', [8], 1);
    // --force asks for a real revisit; without --images the parse yields no illustration.
    const outcome = await visitNotice(8, plan, store, async () => page(source(8), noticePage(8)), { images: false, force: true });
    expect(outcome).toMatchObject({ state: 'exported', fetched: true, saved: true });
    expect(store.idsWithoutImage()).toEqual([]);
  });

  it('n’écrase jamais une illustration connue par une ligne sans illustration', async () => {
    const { directory, store } = await state();
    const withImage = parseStamp(noticePage(20), 20, source(20), { images: true })!;
    expect(withImage.image_url).toBe(STAMP_IMAGE);
    await store.save(20, withImage);
    // Same notice parsed by a run that never looked for an illustration: empty means "unknown",
    // not "none", so the stored URL and credit must survive.
    const withoutImage = parseStamp(noticePage(20), 20, source(20))!;
    expect(withoutImage.image_url).toBe('');
    await store.save(20, withoutImage);
    const { parse } = await import('csv-parse/sync');
    const { readFile } = await import('node:fs/promises');
    const rows = parse(await readFile(join(directory, 'catalog.csv'), 'utf8'), { columns: true }) as Record<string, string>[];
    expect(rows[0].image_url).toBe(withImage.image_url);
    expect(rows[0].image_credit).toBe(withImage.image_credit);
    expect(store.idsWithoutImage()).toEqual([]);
  });

  it('enregistre une notice inconnue et note son état dans le plan', async () => {
    const { store, plan } = await state();
    await plan.completeListing('https://www.wikitimbres.fr/timbres/annee/1850/1850', [9], 1);
    const outcome = await visitNotice(9, plan, store, async () => page(source(9), noticePage(9)), { images: true, force: false });
    expect(outcome).toMatchObject({ state: 'exported', fetched: true, saved: true });
    expect(plan.noticeState(9)).toBe('exported');
    expect(store.has(9)).toBe(true);
    expect(store.idsWithoutImage()).toEqual([]);
  });

  it('revisite quand même une notice exportée si le complément d’illustration le demande', async () => {
    const { store, plan } = await state();
    const withoutImage = parseStamp(noticePage(12), 12, source(12))!;
    await store.save(12, withoutImage);
    await plan.completeListing('https://www.wikitimbres.fr/timbres/annee/1850/1850', [12], 1);
    expect(store.idsWithoutImage()).toEqual([12]);
    const load = vi.fn(async () => page(source(12), noticePage(12)));
    // A backfill pass works without --force but must still read the page (from the cache) to
    // extract the illustration: `revisit` says the notice is deliberately being re-examined.
    const outcome = await visitNotice(12, plan, store, load, { images: true, force: false, revisit: true });
    expect(load).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ state: 'exported', fetched: true, saved: true });
    expect(store.idsWithoutImage()).toEqual([]);
  });

  it('distingue une notice absente d’une notice au format non reconnu', async () => {
    const { store, plan } = await state();
    await plan.completeListing('https://www.wikitimbres.fr/timbres/annee/1850/1850', [10, 11], 2);
    expect(await visitNotice(10, plan, store, async () => null, { images: false, force: false }))
      .toMatchObject({ state: 'missing', saved: false });
    expect(await visitNotice(11, plan, store, async () => page(source(11), '<h1>Page inexistante</h1>'), { images: false, force: false }))
      .toMatchObject({ state: 'rejected', saved: false });
    expect(plan.noticeState(10)).toBe('missing');
    expect(plan.noticeState(11)).toBe('rejected');
  });
});
