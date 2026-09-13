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
  it('n’insère rien lorsque le fichier livré ne contient aucun vecteur', () => {
    const db = createDatabase(':memory:');
    importStamps(db, catalog);
    seedEmbeddings(db);
    expect(db.prepare('SELECT count(*) AS n FROM embeddings').get()).toEqual({ n: 0 });
    db.close();
  });

  it('accepte un vecteur local valide dont l’empreinte correspond à sa notice', () => {
    const db = createDatabase(':memory:');
    importStamps(db, [stamp]);
    const rows = (['visual', 'semantic'] as const).map(kind => ({
      stamp_id: stamp.id, kind, model: MODELS[kind],
      content_hash: contentHash(stamp, kind), vector: vector(kind),
    }));
    seedEmbeddings(db, rows);
    const stored = db.prepare('SELECT kind, vector_json FROM embeddings ORDER BY kind').all() as { kind: EmbeddingKind; vector_json: string }[];
    expect(stored).toHaveLength(2);
    for (const row of stored) {
      const parsed = JSON.parse(row.vector_json);
      expect(parsed).toHaveLength(DIMENSIONS[row.kind]);
      expect(parsed.every(Number.isFinite)).toBe(true);
    }
    seedEmbeddings(db, rows);
    expect(db.prepare('SELECT count(*) AS n FROM embeddings').get()).toEqual({ n: 2 });
    db.close();
  });

  it('refuse un vecteur dont le contenu source a changé', () => {
    const db = createDatabase(':memory:');
    const rows = [{
      stamp_id: stamp.id, kind: 'visual' as const, model: MODELS.visual,
      content_hash: contentHash(stamp, 'visual'), vector: vector('visual'),
    }];
    importStamps(db, [{ ...stamp, image_url: 'https://exemple.invalid/image.jpg', description: 'Notice révisée' }]);
    seedEmbeddings(db, rows);
    expect(db.prepare('SELECT count(*) AS n FROM embeddings').get()).toEqual({ n: 0 });
    db.close();
  });
});
