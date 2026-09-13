import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
function smoke(env: Record<string, string | undefined> = {}) {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...env };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete environment[key];
  return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/smoke-image-pipeline.mts'], {
    cwd: process.cwd(), encoding: 'utf8', env: environment,
  });
}

describe('vérification bornée du parcours image', () => {
  it('refuse de tourner sans base de test explicite, sans jamais créer de fichier « undefined »', () => {
    const result = smoke({ SMOKE_DB: undefined, DATABASE_PATH: undefined });
    expect(result.status).toBe(1);
    expect(result.stderr + result.stdout).toMatch(/SMOKE_DB/);
  });

  it('refuse un chemin de base non absolu ou suspect, sans créer aucun fichier', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stamp-vault-smoke-'));
    directories.push(directory);
    // Each of these is rejected before any file is opened. The relative path is the one that
    // used to litter the repository, and the « undefined » suffix is the accident this guards.
    for (const path of ['relatif.sqlite', join(directory, 'undefined'), '   ']) {
      const result = smoke({ SMOKE_DB: path });
      expect(result.status, path).toBe(1);
      expect(result.stderr + result.stdout, path).toMatch(/SMOKE_DB/);
    }
    const { readdir } = await import('node:fs/promises');
    expect(await readdir(directory)).toEqual([]);
    // The relative candidate must not have appeared in the repository either.
    const { existsSync } = await import('node:fs');
    expect(existsSync(join(process.cwd(), 'relatif.sqlite'))).toBe(false);
  });

  it('refuse une base située dans le dossier data/ du dépôt', () => {
    const result = smoke({ SMOKE_DB: join(process.cwd(), 'data', 'vault.sqlite') });
    expect(result.status).toBe(1);
    expect(result.stderr + result.stdout).toMatch(/data\//);
  });

  it('n’effectue aucune requête réseau tant que SMOKE_NETWORK n’est pas demandé', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stamp-vault-smoke-net-'));
    directories.push(directory);
    const result = smoke({ SMOKE_DB: join(directory, 'test.sqlite') });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(/aucune requête réseau|hors ligne/i);
    // The allowed-host probe really downloads an image: it must stay opt-in.
    expect(result.stdout).not.toMatch(/proxy avec IMAGE_HOSTS -> 200/);
  });

  it('vérifie les états attendus du relais et échoue si une assertion tombe', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stamp-vault-smoke-assert-'));
    directories.push(directory);
    const result = smoke({ SMOKE_DB: join(directory, 'test.sqlite') });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(/notice inconnue -> 404/);
    expect(result.stdout).toMatch(/403/);
    expect(result.stdout).toMatch(/Vérifications réussies/);
  });
});
