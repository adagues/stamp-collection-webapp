import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDatabase, importStamps } from '../lib/database';
import { searchStamps } from '../lib/search';
import { seedEmbeddings } from '../lib/seed-embeddings';
import catalog from '../data/catalog.json';

// Choix de prudence assumé, pas une obligation juridique démontrée (voir DATA-LICENSE.md) :
// le dépôt ne publie aucun vecteur calculé à partir d'images tierces. L'application doit
// rester utilisable avec un fichier de vecteurs vide, sans aucun accès réseau au démarrage.
const seedFile = JSON.parse(readFileSync(new URL('../data/embeddings.json', import.meta.url), 'utf8'));

describe('démonstration sans vecteurs publiés ni réseau implicite', () => {
  it('livre un fichier de vecteurs vide plutôt que des vecteurs issus d’images tierces', () => {
    expect(Array.isArray(seedFile)).toBe(true);
    expect(seedFile).toEqual([]);
  });

  it('initialise une base complète et interrogeable malgré l’absence de vecteurs', async () => {
    const db = await createDatabase(':memory:');
    await importStamps(db, catalog);
    await seedEmbeddings(db);
    expect(Number((await db.execute('SELECT count(*) AS n FROM stamps')).rows[0]?.n)).toBe(catalog.length);
    expect(Number((await db.execute('SELECT count(*) AS n FROM embeddings')).rows[0]?.n)).toBe(0);
    const found = await searchStamps(db, 'phare');
    expect(found.length).toBeGreaterThan(0);
    db.close();
  });

  it('n’émet aucune requête réseau en initialisant la base de démonstration', async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error('Aucune requête réseau ne doit partir du démarrage.');
    }) as typeof fetch;
    try {
      const db = await createDatabase(':memory:');
      await importStamps(db, catalog);
      await seedEmbeddings(db);
      db.close();
    } finally { globalThis.fetch = original; }
    expect(calls).toEqual([]);
  });
});
