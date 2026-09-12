import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { parse } from 'csv-parse/sync';
import { parseStamp } from '../scripts/wikitimbres/parse';
import { CatalogStore, lockRun } from '../scripts/wikitimbres/store';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
it('reprend sans doublons, reconstruit le CSV et accepte l’import existant', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stamp-vault-store-'));
  directories.push(directory);
  const manifest = join(directory, 'manifest.json'), output = join(directory, 'catalog.csv');
  const fixture = await readFile(new URL('./fixtures/wikitimbres.html', import.meta.url), 'utf8');
  const row = parseStamp(fixture, 1, 'https://www.wikitimbres.fr/timbres/1')!;
  const first = new CatalogStore(manifest, output);
  await first.load();
  await first.save(1, row);
  await first.save(2, { ...row, id: 'wikitimbres-2' });
  const next = new CatalogStore(manifest, output);
  await writeFile(output, 'interruption');
  await next.load();
  expect(next.has(1)).toBe(true);
  expect(next.has(2)).toBe(true);
  expect(next.has(3)).toBe(false);
  expect(parse(await readFile(output, 'utf8'), { columns: true })).toEqual([row]);
  await next.save(1, { ...row, denomination: '20 F' });
  expect(parse(await readFile(output, 'utf8'), { columns: true })).toEqual([{ ...row, denomination: '20 F' }]);
  const imported = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/import-catalog.ts', output], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_PATH: join(directory, 'catalog.sqlite') }, encoding: 'utf8',
  });
  expect(imported.stderr).toBe('');
  expect(imported.status, imported.stdout).toBe(0);
});
it('empêche deux collectes locales simultanées et libère le verrou', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stamp-vault-lock-'));
  directories.push(directory);
  const release = await lockRun(directory);
  await expect(lockRun(directory)).rejects.toThrow('Verrou');
  await release();
  await (await lockRun(directory))();
});
