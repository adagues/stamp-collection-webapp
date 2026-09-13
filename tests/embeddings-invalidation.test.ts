import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, importStamps } from '../lib/database';
import { contentHash } from '../lib/seed-embeddings';
import { MODELS } from '../lib/types';

const directory = mkdtempSync(join(tmpdir(), 'coffre-invalidate-'));
const db = createDatabase(join(directory, 'invalidate.sqlite'));
afterAll(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });

const stamp = {
  id: 'test-invalidation', title: 'Notice de test', country: 'France', year: 1900,
  series: 'Essai', denomination: '10 c', description: 'Notice de test.',
  image_url: 'https://www.phil-ouest.com/Timbres/a.jpg', image_credit: '',
  source_url: 'https://exemple.test/notice', catalog_number: null,
  estimated_value: null, currency: 'EUR',
};
const vectors = () => db.prepare('SELECT kind FROM embeddings WHERE stamp_id=? ORDER BY kind').all(stamp.id) as { kind: string }[];
function seedVectors() {
  const insert = db.prepare('INSERT OR REPLACE INTO embeddings(stamp_id,kind,model,vector_json) VALUES(?,?,?,?)');
  insert.run(stamp.id, 'visual', MODELS.visual, JSON.stringify(Array(1280).fill(0.1)));
  insert.run(stamp.id, 'semantic', MODELS.semantic, JSON.stringify(Array(384).fill(0.1)));
}

describe('invalidation des vecteurs quand la source change', () => {
  it('supprime les vecteurs lorsque l’adresse de l’illustration change', () => {
    importStamps(db, [stamp]);
    seedVectors();
    expect(vectors()).toHaveLength(2);
    importStamps(db, [{ ...stamp, image_url: 'https://www.phil-ouest.com/Timbres/b.jpg' }]);
    expect(vectors()).toEqual([]);
  });

  it('distingue l’empreinte visuelle selon l’adresse de l’illustration', () => {
    const first = contentHash(stamp, 'visual');
    const second = contentHash({ ...stamp, image_url: 'https://www.phil-ouest.com/Timbres/b.jpg' }, 'visual');
    expect(first).not.toBe(second);
    expect(contentHash({ ...stamp, title: 'Autre titre' }, 'visual')).toBe(first);
    expect(contentHash({ ...stamp, title: 'Autre titre' }, 'semantic')).not.toBe(contentHash(stamp, 'semantic'));
  });

  it('n’oublie pas la collection de l’utilisateur en mettant la notice à jour', () => {
    importStamps(db, [stamp]);
    db.prepare('INSERT OR REPLACE INTO collection_entries(stamp_id,owned,quantity,personal_reference) VALUES(?,1,2,?)')
      .run(stamp.id, 'Album vert');
    importStamps(db, [{ ...stamp, image_url: 'https://www.phil-ouest.com/Timbres/c.jpg' }]);
    const entry = db.prepare('SELECT owned, quantity, personal_reference FROM collection_entries WHERE stamp_id=?').get(stamp.id);
    expect(entry).toEqual({ owned: 1, quantity: 2, personal_reference: 'Album vert' });
  });
});
