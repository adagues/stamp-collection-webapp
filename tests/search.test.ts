import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, importStamps } from '../lib/database';
import { cosine, lexicalQuery, reciprocalRank, searchStamps, validateVector } from '../lib/search';
import { MODELS } from '../lib/types';
import catalog from '../data/catalog.json';
const db = createDatabase(':memory:');
importStamps(db, catalog.slice(0, 3));
afterEach(() => db.prepare('DELETE FROM embeddings').run());
describe('Classement et recherche', () => {
  it('compare les directions sans dépendre de la longueur des vecteurs', () => {
    expect(cosine([1,2],[2,4])).toBeCloseTo(1);
    expect(cosine([1,0],[0,1])).toBe(0);
    expect(cosine([1,0],[-1,0])).toBe(-1);
    expect(cosine([0,0],[1,2])).toBe(0);
    expect(cosine([1],[1,2])).toBe(0);
  });
  it('neutralise la syntaxe FTS fournie par une saisie libre', () => {
    expect(lexicalQuery('" OR (cérès*) -bleu')).toBe('"OR"* OR "cérès"* OR "bleu"*');
    expect(() => searchStamps(db, '" OR (cérès*) -bleu')).not.toThrow();
    expect(searchStamps(db, 'ceres')).toHaveLength(3);
    expect(searchStamps(db, '!!!')).toEqual([]);
  });
  it('fusionne les rangs plutôt que des scores incomparables', () => {
    const result = reciprocalRank([[{ id:'a',score:100 },{ id:'b',score:5 }],[{ id:'b',score:.9 },{ id:'c',score:.8 }]]);
    expect(result[0].id).toBe('b'); expect(result).toHaveLength(3);
  });
  it('refuse les vecteurs vides, nuls, non finis ou de mauvaise dimension', () => {
    for (const vector of [[], [1], Array(384).fill(0), Array(384).fill(NaN), Array(384).fill(Infinity)]) expect(() => validateVector(vector, 'semantic')).toThrow();
    expect(() => validateVector(Array(384).fill(.1), 'semantic')).not.toThrow();
  });
  it('classe le bon candidat et ignore les versions de modèles incompatibles', () => {
    const vector = Array(1280).fill(0); vector[0] = 1;
    const insert = db.prepare('INSERT INTO embeddings VALUES(?,?,?,?)');
    insert.run(catalog[0].id, 'visual', MODELS.visual, JSON.stringify(vector));
    insert.run(catalog[1].id, 'visual', MODELS.visual, JSON.stringify(vector.map(n => -n)));
    insert.run(catalog[2].id, 'visual', 'ancien-modele', JSON.stringify(vector));
    const results = searchStamps(db, '', 'visual', vector);
    expect(results.map(r => r.id)).toEqual([catalog[0].id, catalog[1].id]);
  });
  it('met à jour l’index lexical lors d’un nouvel import', () => {
    importStamps(db, [{ ...catalog[0], title: 'Architecture aqueduc', description: 'Un pont monumental', series: 'Monuments' }]);
    expect(searchStamps(db, 'aqueduc')[0].id).toBe(catalog[0].id);
    importStamps(db, [catalog[0]]);
    expect(searchStamps(db, 'aqueduc')).toEqual([]);
  });
});
