import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createDatabase, importStamps } from '../lib/database';
import { cosine, reciprocalRank, searchStamps, validateVector } from '../lib/search';
import { lexicalTokens } from '../lib/lexical';
import { MODELS } from '../lib/types';
import catalog from '../data/catalog.json';
const db = await createDatabase(':memory:');
await importStamps(db, catalog.slice(0, 3));
afterEach(async () => { await db.execute('DELETE FROM embeddings'); });
afterAll(() => db.close());
describe('Classement et recherche', () => {
  it('compare les directions sans dépendre de la longueur des vecteurs', () => {
    expect(cosine([1,2],[2,4])).toBeCloseTo(1);
    expect(cosine([1,0],[0,1])).toBe(0);
    expect(cosine([1,0],[-1,0])).toBe(-1);
    expect(cosine([0,0],[1,2])).toBe(0);
    expect(cosine([1],[1,2])).toBe(0);
  });
  it('normalise une saisie libre sans interpréter sa syntaxe', async () => {
    expect(lexicalTokens('" OR (cérès*) -bleu')).toEqual(['or', 'ceres', 'bleu']);
    await expect(searchStamps(db, '" OR (cérès*) -bleu')).resolves.toBeDefined();
    expect(await searchStamps(db, 'phares')).toHaveLength(3);
    expect(await searchStamps(db, '!!!')).toEqual([]);
    expect(lexicalTokens('des timbres de montagne')).toEqual(['timbres', 'montagne']);
  });
  it('fusionne les rangs plutôt que des scores incomparables', () => {
    const result = reciprocalRank([[{ id:'a',score:100 },{ id:'b',score:5 }],[{ id:'b',score:.9 },{ id:'c',score:.8 }]]);
    expect(result[0].id).toBe('b'); expect(result).toHaveLength(3);
  });
  it('refuse les vecteurs vides, nuls, non finis ou de mauvaise dimension', () => {
    for (const vector of [[], [1], Array(384).fill(0), Array(384).fill(NaN), Array(384).fill(Infinity)]) expect(() => validateVector(vector, 'semantic')).toThrow();
    expect(() => validateVector(Array(384).fill(.1), 'semantic')).not.toThrow();
  });
  it('classe le bon candidat et ignore les versions de modèles incompatibles', async () => {
    const vector = Array(1280).fill(0); vector[0] = 1;
    await db.batch([
      { sql:'INSERT INTO embeddings VALUES(?,?,?,?)', args:[catalog[0].id, 'visual', MODELS.visual, JSON.stringify(vector)] },
      { sql:'INSERT INTO embeddings VALUES(?,?,?,?)', args:[catalog[1].id, 'visual', MODELS.visual, JSON.stringify(vector.map(n => -n))] },
      { sql:'INSERT INTO embeddings VALUES(?,?,?,?)', args:[catalog[2].id, 'visual', 'ancien-modele', JSON.stringify(vector)] },
    ], 'write');
    const results = await searchStamps(db, '', 'visual', vector);
    expect(results.map(r => r.id)).toEqual([catalog[0].id, catalog[1].id]);
  });
  it('met à jour l’index lexical lors d’un nouvel import', async () => {
    await importStamps(db, [{ ...catalog[0], title: 'Architecture aqueduc', description: 'Un pont monumental', series: 'Monuments' }]);
    expect((await searchStamps(db, 'aqueduc'))[0].id).toBe(catalog[0].id);
    await importStamps(db, [catalog[0]]);
    expect(await searchStamps(db, 'aqueduc')).toEqual([]);
  });
});
