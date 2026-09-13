import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { atomicWrite } from '../scripts/wikitimbres/fetch';
import { DiscoveryPlan } from '../scripts/wikitimbres/discovery-plan';
import { ORIGIN } from '../scripts/wikitimbres/policy';

const directories: string[] = [];
async function plan() {
  const directory = await mkdtemp(join(tmpdir(), 'stamp-vault-plan-'));
  directories.push(directory);
  const path = join(directory, 'discovery.json');
  return { directory, path, plan: new DiscoveryPlan(path) };
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('plan de découverte reprenable', () => {
  it('mémorise les listings à visiter et les rend une seule fois', async () => {
    const first = await plan();
    await first.plan.load();
    await first.plan.addListings([`${ORIGIN}/timbres/annee/1849/1849`, `${ORIGIN}/timbres/annee/1850/1850`]);
    expect(first.plan.nextListing()).toBe(`${ORIGIN}/timbres/annee/1849/1849`);
    await first.plan.completeListing(`${ORIGIN}/timbres/annee/1849/1849`, [1564, 2458], 8);
    expect(first.plan.nextListing()).toBe(`${ORIGIN}/timbres/annee/1850/1850`);

    const resumed = new DiscoveryPlan(first.path);
    await resumed.load();
    expect(resumed.nextListing()).toBe(`${ORIGIN}/timbres/annee/1850/1850`);
    expect(resumed.pendingNotices()).toEqual([1564, 2458]);
  });

  it('ignore les doublons de listings et de notices, y compris après reprise', async () => {
    const { path, plan: first } = await plan();
    await first.load();
    await first.addListings([`${ORIGIN}/timbres/annee/1849/1849`, `${ORIGIN}/timbres/annee/1849/1849`]);
    await first.completeListing(`${ORIGIN}/timbres/annee/1849/1849`, [1564, 1564, 2458], 8);
    await first.addListings([`${ORIGIN}/timbres/annee/1849/1849`]);
    expect(first.nextListing()).toBeUndefined();
    await first.completeNotice(1564, 'exported');

    const resumed = new DiscoveryPlan(path);
    await resumed.load();
    expect(resumed.pendingNotices()).toEqual([2458]);
    const report = resumed.coverage();
    expect(report.noticesDiscovered).toBe(2);
    expect(report.noticesExported).toBe(1);
    expect(report.listingsDone).toBe(1);
    expect(report.listingsPending).toBe(0);
  });

  it('traite l’index d’une année et sa forme canonique comme un seul listing', async () => {
    const { plan: only } = await plan();
    await only.load();
    await only.addListings([`${ORIGIN}/timbres/annee/2026`]);
    await only.addListings([`${ORIGIN}/timbres/annee/2026/2026`, `${ORIGIN}/timbres/annee/2026/2026/`]);
    expect(only.coverage().listingsPending).toBe(1);
    await only.completeListing(`${ORIGIN}/timbres/annee/2026/2026`, [1], 1);
    expect(only.nextListing()).toBeUndefined();
  });

  it('ne compte le total annoncé qu’une fois par année, malgré la pagination', async () => {
    const { plan: only } = await plan();
    await only.load();
    // The site repeats « (363 Timbres) » on every page of the same year.
    await only.completeListing(`${ORIGIN}/timbres/annee/2026/2026`, [1, 2], 363);
    await only.completeListing(`${ORIGIN}/timbres/annee/2026/2026/48`, [3, 4], 363);
    await only.completeListing(`${ORIGIN}/timbres/annee/2025/2025`, [5], 400);
    expect(only.coverage().announcedTotal).toBe(763);
  });

  it('regroupe identifiants, liens découverts et fin de listing en une seule écriture', async () => {
    const { path } = await plan();
    let writes = 0;
    const failAfterFirst = async (target: string, content: string) => {
      if (++writes > 1) throw new Error('interruption simulée après la première écriture');
      await atomicWrite(target, content);
    };
    const only = new DiscoveryPlan(path, failAfterFirst);
    await only.load();
    await only.addListings([`${ORIGIN}/timbres/annee/2020/2020`]);
    writes = 0;
    // A crash between « listing traité » and « liens enregistrés » used to lose the pagination
    // and the years: the whole result of a listing must land in one atomic save.
    await only.recordListing(`${ORIGIN}/timbres/annee/2020/2020`, {
      ids: [11, 12], announced: 399,
      discovered: [`${ORIGIN}/timbres/annee/2020/2020/48`, `${ORIGIN}/timbres/annee/1849/1849`],
    });
    expect(writes).toBe(1);

    const resumed = new DiscoveryPlan(path);
    await resumed.load();
    expect(resumed.pendingNotices()).toEqual([11, 12]);
    expect(resumed.nextListing()).toBe(`${ORIGIN}/timbres/annee/2020/2020/48`);
    expect(resumed.coverage()).toMatchObject({ listingsDone: 1, listingsPending: 2, announcedTotal: 399 });
  });

  it('ne marque pas un listing traité quand l’écriture du plan échoue', async () => {
    const { path } = await plan();
    const only = new DiscoveryPlan(path, async () => { throw new Error('disque plein simulé'); });
    await only.load();
    await expect(only.recordListing(`${ORIGIN}/timbres/annee/2020/2020`, {
      ids: [11], announced: 399, discovered: [`${ORIGIN}/timbres/annee/2020/2020/48`],
    })).rejects.toThrow();

    const resumed = new DiscoveryPlan(path);
    await resumed.load();
    // Nothing was persisted, so the listing is simply unknown: it will be read again.
    expect(resumed.coverage()).toMatchObject({ listingsDone: 0, noticesDiscovered: 0 });
  });

  it('rouvre les notices rejetées et absentes, dans la limite demandée, sans toucher aux exportées', async () => {
    const { path, plan: only } = await plan();
    await only.load();
    await only.completeListing(`${ORIGIN}/timbres/annee/1849/1849`, [1, 2, 3, 4, 5], 5);
    await only.completeNotice(1, 'exported');
    await only.completeNotice(2, 'rejected');
    await only.completeNotice(3, 'missing');
    await only.completeNotice(4, 'rejected');
    // 5 stays pending: it is not a rejection and must not consume the retry budget.
    expect(await only.reopenRejected(2)).toEqual([2, 3]);
    expect(only.noticeState(1)).toBe('exported');
    expect(only.noticeState(4)).toBe('rejected');
    expect(only.pendingNotices()).toEqual([2, 3, 5]);

    const resumed = new DiscoveryPlan(path);
    await resumed.load();
    expect(resumed.pendingNotices()).toEqual([2, 3, 5]);
    // A second pass finishes the remaining rejection and then has nothing left to reopen.
    expect(await resumed.reopenRejected(10)).toEqual([4]);
    expect(await resumed.reopenRejected(10)).toEqual([]);
  });

  it('n’écrit pas le plan quand il n’y a aucun rejet à rouvrir', async () => {
    const { path } = await plan();
    let writes = 0;
    const only = new DiscoveryPlan(path, async (target, content) => {
      writes++;
      const { writeFile } = await import('node:fs/promises');
      await writeFile(target, content, 'utf8');
    });
    await only.load();
    await only.completeListing(`${ORIGIN}/timbres/annee/1849/1849`, [1], 1);
    writes = 0;
    expect(await only.reopenRejected(5)).toEqual([]);
    expect(writes).toBe(0);
  });

  it('refuse une adresse de listing hors du catalogue du site', async () => {
    const { plan: only } = await plan();
    await only.load();
    await expect(only.addListings(['https://exemple.invalid/timbres/annee/1849/1849'])).rejects.toThrow();
    await expect(only.addListings([`${ORIGIN}/administration`])).rejects.toThrow();
  });

  it('distingue notices exportées, rejetées et absentes dans la couverture', async () => {
    const { plan: only } = await plan();
    await only.load();
    await only.addListings([`${ORIGIN}/timbres/annee/1849/1849`]);
    await only.completeListing(`${ORIGIN}/timbres/annee/1849/1849`, [1, 2, 3, 4], 8);
    await only.completeNotice(1, 'exported');
    await only.completeNotice(2, 'rejected');
    await only.completeNotice(3, 'missing');
    const report = only.coverage();
    expect(report).toMatchObject({
      noticesDiscovered: 4, noticesExported: 1, noticesRejected: 1,
      noticesMissing: 1, noticesPending: 1, announcedTotal: 8, complete: false,
    });
  });

  it('signale un plan corrompu au lieu de repartir de zéro silencieusement', async () => {
    const { path } = await plan();
    await writeFile(path, '{"version":1,"listings":"cassé"}');
    await expect(new DiscoveryPlan(path).load()).rejects.toThrow();
    await writeFile(path, 'pas du json');
    await expect(new DiscoveryPlan(path).load()).rejects.toThrow();
  });

  it('refuse un plan dont les sections sont des tableaux au lieu d’objets', async () => {
    const { path } = await plan();
    // JSON.stringify drops named properties of an array: accepting one loses the whole plan.
    await writeFile(path, JSON.stringify({ version: 1, listings: [], notices: [], announced: [] }));
    await expect(new DiscoveryPlan(path).load()).rejects.toThrow(/invalide/i);
  });

  it('refuse une clé de listing qui n’est pas une adresse canonique du catalogue', async () => {
    const { path } = await plan();
    for (const key of ['https://exemple.invalid/timbres/annee/1849/1849', `${ORIGIN}/administration`,
      `${ORIGIN}/timbres/annee/1849`, `${ORIGIN}/timbres/annee/1849/1849/`]) {
      await writeFile(path, JSON.stringify({ version: 1, listings: { [key]: false }, notices: {}, announced: {} }));
      await expect(new DiscoveryPlan(path).load(), key).rejects.toThrow(/invalide/i);
    }
  });

  it('refuse un identifiant de notice nul ou hors des entiers sûrs', async () => {
    const { path } = await plan();
    for (const id of ['0', '99999999999999999999', '-3', '1.5', '01']) {
      await writeFile(path, JSON.stringify({ version: 1, listings: {}, notices: { [id]: null }, announced: {} }));
      await expect(new DiscoveryPlan(path).load(), id).rejects.toThrow(/invalide/i);
    }
  });

  it('refuse une clé de total annoncé qui n’est pas une année du catalogue', async () => {
    const { path } = await plan();
    for (const year of ['1839', '2101', 'toutes', '20260']) {
      await writeFile(path, JSON.stringify({ version: 1, listings: {}, notices: {}, announced: { [year]: 3 } }));
      await expect(new DiscoveryPlan(path).load(), year).rejects.toThrow(/invalide/i);
    }
  });

  it('refuse une année hors des bornes du catalogue, à l’ajout comme à la relecture', async () => {
    const { path, plan: only } = await plan();
    await only.load();
    // completeListing dérive la clé « announced » de l’année du listing : une année absurde
    // écrirait un plan que load() refuserait ensuite, donc elle est refusée dès l’ajout.
    await expect(only.addListings([`${ORIGIN}/timbres/annee/1839/1839`])).rejects.toThrow();
    await expect(only.addListings([`${ORIGIN}/timbres/annee/2101/2101`])).rejects.toThrow();
    await writeFile(path, JSON.stringify({
      version: 1, listings: { [`${ORIGIN}/timbres/annee/1839/1839`]: false }, notices: {}, announced: {},
    }));
    await expect(new DiscoveryPlan(path).load()).rejects.toThrow(/invalide/i);
  });

  it('écrit le plan de façon atomique, sans laisser de fichier temporaire', async () => {
    const { directory, path, plan: only } = await plan();
    await only.load();
    await only.addListings([`${ORIGIN}/timbres/annee/1849/1849`]);
    const saved = JSON.parse(await readFile(path, 'utf8'));
    expect(saved.version).toBe(1);
    const { readdir } = await import('node:fs/promises');
    expect((await readdir(directory)).filter(name => name.endsWith('.tmp'))).toEqual([]);
  });
});
