import { describe, expect, it } from 'vitest';
import { createDatabase, importStamps } from '../lib/database';
import { contentHash, seedEmbeddings } from '../lib/seed-embeddings';
import catalog from '../data/catalog.json';
import { DIMENSIONS, MODELS, type EmbeddingKind } from '../lib/types';

// Le dépôt ne distribue plus de vecteurs précalculés : le fichier de démonstration est vide
// (choix de prudence documenté dans DATA-LICENSE.md). Le mécanisme d'amorçage doit
// rester correct pour les vecteurs qu'un utilisateur produit ou importe localement.
const stamp = catalog[0];
const vector = (kind: EmbeddingKind) => Array(DIMENSIONS[kind]).fill(0.1);

describe('amorçage des vecteurs fournis avec le catalogue', () => {
  it('n’insère rien lorsque le fichier livré ne contient aucun vecteur', async () => {
    const db = await createDatabase(':memory:');
    await importStamps(db, catalog);
    await seedEmbeddings(db);
    expect(Number((await db.execute('SELECT count(*) AS n FROM embeddings')).rows[0]?.n)).toBe(0);
    db.close();
  });

  it('accepte un vecteur local valide dont l’empreinte correspond à sa notice', async () => {
    const db = await createDatabase(':memory:');
    await importStamps(db, [stamp]);
    const rows = (['visual', 'semantic'] as const).map(kind => ({
      stamp_id: stamp.id, kind, model: MODELS[kind],
      content_hash: contentHash(stamp, kind), vector: vector(kind),
    }));
    await seedEmbeddings(db, rows);
    const stored = (await db.execute('SELECT kind, vector_json FROM embeddings ORDER BY kind')).rows;
    expect(stored).toHaveLength(2);
    for (const row of stored) {
      const kind = String(row.kind) as EmbeddingKind;
      const parsed = JSON.parse(String(row.vector_json));
      expect(parsed).toHaveLength(DIMENSIONS[kind]);
      expect(parsed.every(Number.isFinite)).toBe(true);
    }
    await seedEmbeddings(db, rows);
    expect(Number((await db.execute('SELECT count(*) AS n FROM embeddings')).rows[0]?.n)).toBe(2);
    db.close();
  });

  it('refuse un vecteur dont le contenu source a changé', async () => {
    const db = await createDatabase(':memory:');
    const rows = [{
      stamp_id: stamp.id, kind: 'visual' as const, model: MODELS.visual,
      content_hash: contentHash(stamp, 'visual'), vector: vector('visual'),
    }];
    await importStamps(db, [{ ...stamp, image_url: 'https://exemple.invalid/image.jpg', description: 'Notice révisée' }]);
    await seedEmbeddings(db, rows);
    expect(Number((await db.execute('SELECT count(*) AS n FROM embeddings')).rows[0]?.n)).toBe(0);
    db.close();
  });
});
