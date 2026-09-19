import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, importStamps } from '../lib/database';
import { contentHash, type SeedRow } from '../lib/seed-embeddings';
import { DIMENSIONS, MODELS, type EmbeddingKind } from '../lib/types';

// L'export doit décrire la base LOCALE réellement ouverte, pas le catalogue de démonstration
// livré : une notice importée par l'utilisateur doit sortir, et l'empreinte publiée doit être
// celle de la notice telle qu'elle est stockée. Sans cela l'export prétend documenter des
// vecteurs qu'il n'a pas lus. Le fichier produit reste un artefact local et jetable.
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function workspace() {
  const directory = mkdtempSync(join(tmpdir(), 'coffre-export-source-'));
  directories.push(directory);
  return directory;
}
const local = {
  id: 'perso-9001', title: 'Notice importée localement', country: 'France', year: 1930,
  series: 'Album personnel', denomination: '50 c', description: 'Notice locale, hors catalogue livré.',
  image_url: 'https://exemple.invalid/illustration.jpg', image_credit: '',
  source_url: 'https://exemple.invalid/notice/9001', catalog_number: null,
  estimated_value: null, currency: 'EUR',
};
const vector = (kind: EmbeddingKind) => Array.from({ length: DIMENSIONS[kind] }, (_, index) => (index % 7 + 1) / 10);

function exported(directory: string, database: string) {
  const output = join(directory, 'embeddings-local.json');
  const result = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/export-embeddings.ts'], {
    cwd: process.cwd(), encoding: 'utf8',
    env: { ...process.env, TURSO_DATABASE_URL: `file:${database}`, EMBEDDINGS_OUTPUT: output },
  });
  return { output, result };
}

describe('export des empreintes depuis la base locale', () => {
  it('exporte les vecteurs des notices présentes en base, même absentes du catalogue livré', async () => {
    const directory = workspace();
    const database = join(directory, 'export.sqlite');
    const db = await createDatabase(database);
    await importStamps(db, [local]);
    await db.batch((['visual', 'semantic'] as const).map(kind => ({
      sql:'INSERT INTO embeddings(stamp_id,kind,model,vector_json) VALUES(?,?,?,?)',
      args:[local.id, kind, MODELS[kind], JSON.stringify(vector(kind))],
    })), 'write');
    db.close();

    const { output, result } = exported(directory, database);
    const rows = JSON.parse(readFileSync(output, 'utf8')) as SeedRow[];
    expect(rows.map(row => row.stamp_id)).toEqual([local.id, local.id]);
    expect(rows.map(row => row.kind).sort()).toEqual(['semantic', 'visual']);
    for (const row of rows) {
      expect(row.model).toBe(MODELS[row.kind]);
      expect(row.vector).toEqual(vector(row.kind));
      // L'empreinte doit décrire la notice telle qu'elle est stockée en base.
      expect(row.content_hash).toBe(contentHash(local, row.kind));
    }
    expect(result).toMatch(/embeddings-local\.json/);
  });

  it('n’exporte rien et ne prétend rien quand la base locale ne contient aucun vecteur', async () => {
    const directory = workspace();
    const database = join(directory, 'vide.sqlite');
    const db = await createDatabase(database);
    await importStamps(db, [local]);
    db.close();

    const { output } = exported(directory, database);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual([]);
  });
});
