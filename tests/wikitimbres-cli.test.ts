import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/scrape-wikitimbres.ts', ...args], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, ...env },
  });
}

describe('interface en ligne de commande de la collecte', () => {
  it('documente --all, --images et --limit dans l’aide, sans réseau', () => {
    const help = run(['--help']);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('--all');
    expect(help.stdout).toContain('--limit');
    expect(help.stdout).toContain('--images');
    expect(help.stdout).toContain('--dry-run');
    expect(help.stdout).toContain('--backfill-images');
  });

  it('refuse de combiner --all avec une plage d’identifiants', () => {
    const conflict = run(['--all', '--start', '5', '--end', '7']);
    expect(conflict.status).toBe(1);
    expect(conflict.stderr).toContain('--all');
  });

  it('exige une limite explicite et bornée avec --all', () => {
    for (const args of [['--all'], ['--all', '--limit', '0'], ['--all', '--limit', '20001'], ['--all', '--limit', 'beaucoup']]) {
      const result = run(args);
      expect(result.status, args.join(' ')).toBe(1);
      expect(result.stderr, args.join(' ')).toMatch(/limite/i);
    }
  });

  it('n’ouvre aucune connexion en --dry-run et écrit le plan dans le dossier choisi', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stamp-vault-cli-'));
    directories.push(directory);
    const result = run(['--all', '--limit', '3', '--dry-run'], {
      WIKITIMBRES_CACHE_DIR: join(directory, 'cache'),
      WIKITIMBRES_OUTPUT: join(directory, 'wikitimbres.csv'),
      WIKITIMBRES_OFFLINE: '1',
    });
    expect(result.stderr).toBe('');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('Simulation');
    expect(result.stdout).toMatch(/aucune requête/i);
    const plan = JSON.parse(await readFile(join(directory, 'cache', 'discovery.json'), 'utf8'));
    expect(plan.version).toBe(1);
    expect(Object.keys(plan.listings).length).toBeGreaterThan(0);
    expect(Object.keys(plan.listings)[0]).toMatch(/^https:\/\/www\.wikitimbres\.fr\/timbres\/annee\//);
  });

  it('cible les notices sans illustration en --backfill-images, sans lire de listing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stamp-vault-cli-bf-'));
    directories.push(directory);
    const cache = join(directory, 'cache');
    const output = join(directory, 'wikitimbres.csv');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(cache, { recursive: true });
    const row = (id: string, image: string) => ({
      id, title: 'Notice de test', country: 'France', year: '1900', series: 'Essai',
      denomination: '10 c', description: 'Notice de test.', image_url: image, image_credit: '',
      source_url: `https://www.wikitimbres.fr/timbres/${id.split('-')[1]}`,
      catalog_number: '', estimated_value: '', currency: 'EUR',
    });
    await writeFile(join(cache, 'manifest.json'), JSON.stringify({
      version: 1,
      rows: { 'wikitimbres-11': row('wikitimbres-11', ''),
        'wikitimbres-12': row('wikitimbres-12', 'https://www.wikitimbres.fr/public/stamps/800/A.jpg') },
      processed: { 11: 'wikitimbres-11', 12: 'wikitimbres-12' },
    }));
    const result = run(['--backfill-images', '--limit', '5', '--dry-run'], {
      WIKITIMBRES_CACHE_DIR: cache, WIKITIMBRES_OUTPUT: output, WIKITIMBRES_OFFLINE: '1',
    });
    expect(result.stderr).toBe('');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(/aucun listing/i);
    expect(result.stdout).toContain('11');
    expect(result.stdout).not.toMatch(/Notices en attente : 0/);
    const plan = JSON.parse(await readFile(join(cache, 'discovery.json'), 'utf8'));
    expect(Object.keys(plan.notices)).toEqual(['11']);
    expect(Object.values(plan.listings).every(done => done === true)).toBe(true);
  });

  it('n’épuise pas son budget sur les listings restants d’une découverte précédente', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stamp-vault-cli-bf2-'));
    directories.push(directory);
    const cache = join(directory, 'cache');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(cache, { recursive: true });
    const row = {
      id: 'wikitimbres-11', title: 'Notice de test', country: 'France', year: '1900',
      series: 'Essai', denomination: '10 c', description: 'Notice de test.', image_url: '',
      image_credit: '', source_url: 'https://www.wikitimbres.fr/timbres/11',
      catalog_number: '', estimated_value: '', currency: 'EUR',
    };
    await writeFile(join(cache, 'manifest.json'), JSON.stringify({
      version: 1, rows: { 'wikitimbres-11': row }, processed: { 11: 'wikitimbres-11' },
    }));
    // A previous --all run left listings and other notices to visit.
    await writeFile(join(cache, 'discovery.json'), JSON.stringify({
      version: 1,
      listings: { 'https://www.wikitimbres.fr/timbres/annee/2026/2026': false },
      notices: { 11: 'exported', 900: null, 901: null },
      announced: { 2026: 363 },
    }));
    const result = run(['--backfill-images', '--limit', '1', '--dry-run'], {
      WIKITIMBRES_CACHE_DIR: cache, WIKITIMBRES_OUTPUT: join(directory, 'out.csv'), WIKITIMBRES_OFFLINE: '1',
    });
    expect(result.stderr).toBe('');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    // The backfill pass must not spend its budget reading listings or unrelated notices.
    expect(result.stdout).toMatch(/listings? (?:non lus?|ignorés?)|aucun listing n’est lu/i);
    expect(result.stdout).toMatch(/Notices à compléter : 11\b/);
  });

  it('refuse explicitement --all --force au lieu de promettre une reprise des rejets', () => {
    // Offline on purpose: the refusal must come from argument checking, before any request.
    const refusal = run(['--all', '--limit', '5', '--force'], { WIKITIMBRES_OFFLINE: '1' });
    expect(refusal.status).toBe(1);
    expect(refusal.stderr).toMatch(/--force/);
    // The message must name the real way to reprocess rejected/missing notices.
    expect(refusal.stderr).toMatch(/--retry-rejets/);
  });

  it('documente --retry-rejets et n’annonce pas de rafraîchissement inexistant pour --all', () => {
    const help = run(['--help']);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('--retry-rejets');
    // --force must not be advertised as reprocessing an --all discovery.
    const forceLine = help.stdout.split('\n').find(line => line.trimStart().startsWith('--force'));
    expect(forceLine).toBeDefined();
    expect(forceLine).toMatch(/plage|--start/i);
  });

  it('rouvre les notices rejetées ou absentes avec --retry-rejets, sans relire de listing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stamp-vault-cli-retry-'));
    directories.push(directory);
    const cache = join(directory, 'cache');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(cache, { recursive: true });
    await writeFile(join(cache, 'discovery.json'), JSON.stringify({
      version: 1,
      listings: { 'https://www.wikitimbres.fr/timbres/annee/2026/2026': false },
      notices: { 11: 'exported', 900: 'rejected', 901: 'missing', 902: null },
      announced: { 2026: 363 },
    }));
    const result = run(['--all', '--retry-rejets', '--limit', '10', '--dry-run'], {
      WIKITIMBRES_CACHE_DIR: cache, WIKITIMBRES_OUTPUT: join(directory, 'out.csv'), WIKITIMBRES_OFFLINE: '1',
    });
    expect(result.stderr).toBe('');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(/2 notice\(s\) rejetée\(s\) ou absente\(s\) remise\(s\) en attente/);
    const plan = JSON.parse(await readFile(join(cache, 'discovery.json'), 'utf8'));
    expect(plan.notices['900']).toBeNull();
    expect(plan.notices['901']).toBeNull();
    // Exported notices are untouched, and no listing was marked read.
    expect(plan.notices['11']).toBe('exported');
    expect(plan.listings['https://www.wikitimbres.fr/timbres/annee/2026/2026']).toBe(false);
  });

  it('borne la réouverture des rejets au budget de notices demandé', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stamp-vault-cli-retry2-'));
    directories.push(directory);
    const cache = join(directory, 'cache');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(cache, { recursive: true });
    await writeFile(join(cache, 'discovery.json'), JSON.stringify({
      version: 1, listings: {},
      notices: { 900: 'rejected', 901: 'rejected', 902: 'missing' }, announced: {},
    }));
    const result = run(['--all', '--retry-rejets', '--limit', '2', '--dry-run'], {
      WIKITIMBRES_CACHE_DIR: cache, WIKITIMBRES_OUTPUT: join(directory, 'out.csv'), WIKITIMBRES_OFFLINE: '1',
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const plan = JSON.parse(await readFile(join(cache, 'discovery.json'), 'utf8'));
    const reopened = Object.values(plan.notices).filter(state => state === null).length;
    expect(reopened).toBe(2);
  });

  it('refuse --retry-rejets sans --all', () => {
    const refusal = run(['--retry-rejets', '--start', '1', '--end', '3']);
    expect(refusal.status).toBe(1);
    expect(refusal.stderr).toMatch(/--retry-rejets/);
  });
});
