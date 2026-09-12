import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sameOrigin } from '../lib/http';
import { getDb } from '../lib/database';
import { PUT } from '../app/api/collection/[id]/route';
import { POST as search } from '../app/api/search/route';
import { POST as embeddings } from '../app/api/embeddings/route';
import { MODELS } from '../lib/types';
const directory = mkdtempSync(join(tmpdir(), 'coffre-api-'));
process.env.DATABASE_PATH = join(directory,'api.sqlite');
afterAll(() => { getDb().close(); rmSync(directory,{ recursive:true, force:true }); });
function request(path: string, body: unknown, origin = 'http://localhost:3001') {
  return new Request(`http://0.0.0.0:3001/api/${path}`, { method:'POST', headers:{ host:'localhost:3001', origin, 'content-type':'application/json' }, body:JSON.stringify(body) });
}
describe('Routes API', () => {
  it('accepte le nom d’hôte public quand le serveur écoute toutes les interfaces', () => {
    expect(() => sameOrigin(request('collection',{}))).not.toThrow();
    expect(() => sameOrigin(request('collection',{},'http://exemple.invalid'))).toThrow();
  });
  it('enregistre la collection par la route publique et refuse les identifiants absents', async () => {
    const response = await PUT(request('collection',{ owned:true, quantity:4, personal_reference:'Album bleu' }), { params:{ id:'fr-1849-001' } });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ owned:true, quantity:4, personal_reference:'Album bleu' });
    const absent = await PUT(request('collection',{ owned:true, quantity:1, personal_reference:'' }), { params:{ id:'absent' } });
    expect(absent.status).toBe(404);
  });
  it('rejette une quantité incorrecte avec un message français', async () => {
    const response = await PUT(request('collection',{ owned:true, quantity:-2, personal_reference:'' }), { params:{ id:'fr-1849-001' } });
    expect(response.status).toBe(400); expect((await response.json()).error).toContain('quantité entière');
  });
  it('recherche avec les accents et renvoie l’état de possession', async () => {
    const response = await search(request('search',{ text:'Cérès' }));
    expect(response.status).toBe(200); expect((await response.json()).items.length).toBeGreaterThan(0);
  });
  it('valide un lot complet avant toute écriture de vecteurs', async () => {
    const before = getDb().prepare('SELECT count(*) AS n FROM embeddings').get();
    const vector = Array(384).fill(.1);
    const response = await embeddings(request('embeddings',{ kind:'semantic', model:MODELS.semantic, items:[{ id:'fr-1849-001', vector },{ id:'absent', vector }] }));
    expect(response.status).toBe(404);
    expect(getDb().prepare('SELECT count(*) AS n FROM embeddings').get()).toEqual(before);
  });
});
