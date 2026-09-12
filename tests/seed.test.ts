import { describe, expect, it } from 'vitest';
import { createDatabase, importStamps } from '../lib/database';
import { seedEmbeddings } from '../lib/seed-embeddings';
import catalog from '../data/catalog.json';
import { DIMENSIONS, type EmbeddingKind } from '../lib/types';
describe('Vecteurs précalculés', () => {
  it('initialise chaque notice avec ses deux représentations valides', () => {
    const db = createDatabase(':memory:'); importStamps(db, catalog); seedEmbeddings(db);
    const rows = db.prepare('SELECT kind,vector_json FROM embeddings').all() as { kind: EmbeddingKind; vector_json: string }[];
    expect(rows).toHaveLength(catalog.length * 2);
    for (const row of rows) {
      const vector = JSON.parse(row.vector_json);
      expect(vector).toHaveLength(DIMENSIONS[row.kind]);
      expect(vector.every(Number.isFinite)).toBe(true);
    }
    seedEmbeddings(db); expect(db.prepare('SELECT count(*) AS n FROM embeddings').get()).toEqual({ n:catalog.length * 2 }); db.close();
  });
  it('refuse un vecteur dont le contenu source a changé', () => {
    const db = createDatabase(':memory:');
    importStamps(db, [{ ...catalog[0], image_url:'https://exemple.invalid/image.jpg', description:'Notice révisée' }]);
    seedEmbeddings(db); expect(db.prepare('SELECT count(*) AS n FROM embeddings').get()).toEqual({ n:0 }); db.close();
  });
});
