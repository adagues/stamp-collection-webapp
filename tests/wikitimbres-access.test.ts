import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogPage, PageCache } from '../scripts/wikitimbres/fetch';
import { configuredDelay, ORIGIN, RequestGate, ROBOTS_URL, SitePolicy, USER_AGENT } from '../scripts/wikitimbres/policy';

vi.mock('node:timers/promises', () => ({ setTimeout: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)) }));
const directories: string[] = [];
const robots = (body = 'User-agent: *\nDisallow: /timbres/2') => ({
  url: ROBOTS_URL, status: 200, headers: { 'content-type': 'text/plain' }, body,
});
async function cache(force = false) {
  const directory = await mkdtemp(join(tmpdir(), 'stamp-vault-cache-'));
  directories.push(directory);
  return { directory, pages: new PageCache(directory, new RequestGate(0), force) };
}
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('accès respectueux sans réseau', () => {
  it('refuse les délais trop courts ou invalides', () => {
    expect(configuredDelay('3000')).toBe(3000);
    for (const value of ['0', '2999', 'NaN', 'Infinity']) expect(() => configuredDelay(value)).toThrow();
  });
  it('sérialise les appels et attend au moins trois secondes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const gate = new RequestGate(3000), times: number[] = [];
    const first = gate.run(async () => {
      times.push(Date.now());
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    const second = gate.run(async () => { times.push(Date.now()); });
    await vi.advanceTimersByTimeAsync(100);
    await first;
    expect(times).toEqual([10_000]);
    await vi.advanceTimersByTimeAsync(2999);
    expect(times).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(times).toEqual([10_000, 13_100]);
  });
  it('échoue si robots est indisponible, une erreur HTTP ou du HTML', async () => {
    const gate = new RequestGate(0);
    await expect(SitePolicy.load(async () => { throw new Error('hors ligne'); }, gate)).rejects.toThrow();
    for (const response of [{ ...robots(), status: 404 }, { ...robots(), body: '<html>Erreur</html>' },
      { ...robots(), headers: { 'content-type': 'image/png' }, body: '' }]) {
      await expect(SitePolicy.load(async () => response, gate)).rejects.toThrow();
    }
  });
  it('applique groupes, jokers, exceptions et Crawl-delay', async () => {
    const gate = new RequestGate(3000);
    const policy = await SitePolicy.load(async () => robots('User-agent: *\nDisallow: /\n\nUser-agent: StampVaultBot\nDisallow: /timbres/*\nAllow: /timbres/1$\nCrawl-delay: 8'), gate);
    expect(policy.allows(`${ORIGIN}/timbres/1`)).toBe(true);
    expect(policy.allows(`${ORIGIN}/timbres/2`)).toBe(false);
    expect(policy.allows(`${ORIGIN}/images/1.png`)).toBe(false);
    expect(gate.delay).toBe(8000);
  });
  it('ne demande aucun chemin interdit, y compris après redirection', async () => {
    const network = vi.fn().mockResolvedValue(new Response('', { status: 302, headers: { location: '/timbres/2' } }));
    vi.stubGlobal('fetch', network);
    const { pages } = await cache();
    const policy = await SitePolicy.load(async () => robots(), new RequestGate(0));
    expect(await catalogPage(`${ORIGIN}/timbres/2`, policy, pages)).toBeNull();
    expect(network).not.toHaveBeenCalled();
    expect(await catalogPage(`${ORIGIN}/timbres/1`, policy, pages)).toBeNull();
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('réutilise les réponses en cache et --force les renouvelle', async () => {
    const network = vi.fn().mockImplementation(async () => new Response('<h1>Test</h1>', { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', network);
    const { directory, pages } = await cache();
    const url = `${ORIGIN}/timbres/1`;
    await pages.load(url);
    await new PageCache(directory, new RequestGate(0)).load(url);
    expect(network).toHaveBeenCalledTimes(1);
    expect(network.mock.calls[0][1]).toMatchObject({ redirect: 'manual', headers: { 'User-Agent': USER_AGENT } });
    await new PageCache(directory, new RequestGate(0), true).load(url);
    expect(network).toHaveBeenCalledTimes(2);
  });
  it('arrête la collecte sur une limitation HTTP, sans réessayer', async () => {
    const network = vi.fn().mockResolvedValue(new Response('Patientez', { status: 429 }));
    vi.stubGlobal('fetch', network);
    const { pages } = await cache();
    const policy = await SitePolicy.load(async () => robots(), new RequestGate(0));
    await expect(catalogPage(`${ORIGIN}/timbres/1`, policy, pages)).rejects.toThrow('429');
    expect(network).toHaveBeenCalledTimes(1);
  });
});
