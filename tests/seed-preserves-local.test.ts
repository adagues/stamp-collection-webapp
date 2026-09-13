import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, importStamps } from '../lib/database';
import { contentHash, seedEmbeddings, type SeedRow } from '../lib/seed-embeddings';
import { DIMENSIONS, MODELS, type EmbeddingKind } from '../lib/types';

// L'amorçage des vecteurs livrés est un ajout, jamais une reprise en main de la base : il ne
// doit ni écraser un vecteur déjà calculé localement, ni toucher la collection de
// l'utilisateur. La preuve se fait sur une base temporaire, jamais sur la base personnelle.
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function database() {
  const directory = mkdtempSync(join(tmpdir(), 'coffre-seed-preserve-'));
  directories.push(directory);
  return createDatabase(join(directory, 'vault.sqlite'));
}
const stamp = {
  id: 'perso-7001', title: 'Notice locale', country: 'France', year: 1928,
  series: 'Album personnel', denomination: '30 c', description: 'Notice conservée localement.',
  image_url: 'https://exemple.invalid/illustration.jpg', image_credit: '',
  source_url: 'https://exemple.invalid/notice/7001', catalog_number: null,
  estimated_value: null, currency: 'EUR',
};
const filled = (kind: EmbeddingKind, value: number) => Array(DIMENSIONS[kind]).fill(value);
const seedRow = (kind: EmbeddingKind, value: number): SeedRow => ({
  stamp_id: stamp.id, kind, model: MODELS[kind],
  content_hash: contentHash(stamp, kind), vector: filled(kind, value),
});

describe('amorçage non destructif sur une base existante', () => {
  it('conserve un vecteur déjà calculé localement au lieu de le remplacer par celui livré', () => {
    const db = database();
    importStamps(db, [stamp]);
    const mine = filled('semantic', 0.25);
    db.prepare('INSERT INTO embeddings(stamp_id,kind,model,vector_json) VALUES(?,?,?,?)')
      .run(stamp.id, 'semantic', MODELS.semantic, JSON.stringify(mine));

    seedEmbeddings(db, [seedRow('semantic', 0.75)]);

    const kept = db.prepare('SELECT vector_json FROM embeddings WHERE stamp_id=? AND kind=?')
      .get(stamp.id, 'semantic') as { vector_json: string };
    expect(JSON.parse(kept.vector_json)).toEqual(mine);
    expect(db.prepare('SELECT count(*) AS n FROM embeddings').get()).toEqual({ n: 1 });
    db.close();
  });

  it('ne modifie ni la collection de l’utilisateur ni ses notices en amorçant les vecteurs', () => {
    const db = database();
    importStamps(db, [stamp]);
    db.prepare('INSERT INTO collection_entries(stamp_id,owned,quantity,personal_reference) VALUES(?,1,4,?)')
      .run(stamp.id, 'Classeur bleu · page 7');
    const collectionBefore = db.prepare('SELECT * FROM collection_entries').all();
    const stampsBefore = db.prepare('SELECT * FROM stamps ORDER BY id').all();

    seedEmbeddings(db, [seedRow('visual', 0.5), seedRow('semantic', 0.5)]);

    expect(db.prepare('SELECT * FROM collection_entries').all()).toEqual(collectionBefore);
    expect(db.prepare('SELECT * FROM stamps ORDER BY id').all()).toEqual(stampsBefore);
    expect(db.prepare('SELECT count(*) AS n FROM embeddings').get()).toEqual({ n: 2 });
    db.close();
  });

  it('n’ajoute aucun vecteur pour une notice absente de la base locale', () => {
    const db = database();
    importStamps(db, [stamp]);
    const foreign: SeedRow = { ...seedRow('visual', 0.5), stamp_id: 'notice-absente' };

    seedEmbeddings(db, [foreign]);

    expect(db.prepare('SELECT count(*) AS n FROM embeddings').get()).toEqual({ n: 0 });
    db.close();
  });
});
