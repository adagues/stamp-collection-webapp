import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const directory = mkdtempSync(join(tmpdir(), 'coffre-index-'));
process.env.TURSO_DATABASE_URL = `file:${join(directory, 'index.sqlite')}`;
const { getDb, importStamps } = await import('../lib/database');
const { GET } = await import('../app/api/embeddings/route');
const { GET: image } = await import('../app/api/image/[id]/route');

afterAll(async () => { (await getDb()).close(); delete process.env.TURSO_DATABASE_URL; rmSync(directory, { recursive: true, force: true }); });

const base = {
  country: 'France', year: 1900, series: 'Essai', denomination: '10 c',
  description: 'Notice de test.', image_credit: '', source_url: 'https://exemple.test/notice',
  catalog_number: null, estimated_value: null, currency: 'EUR',
};
async function seed() {
  await importStamps(await getDb(), [
    { ...base, id: 'test-avec-image', title: 'Avec illustration', image_url: 'https://www.phil-ouest.com/Timbres/x.jpg' },
    { ...base, id: 'test-sans-image', title: 'Sans illustration', image_url: '' },
  ]);
}

describe('comptage honnête de la préparation visuelle', () => {
  it('n’attend pas de vecteur visuel pour une notice sans illustration', async () => {
    await seed();
    const response = await GET(new Request('http://localhost/api/embeddings?kind=visual'));
    const { pending, unavailable } = await response.json() as { pending: { id: string }[]; unavailable: string[] };
    expect(pending.map(row => row.id)).toContain('test-avec-image');
    expect(pending.map(row => row.id)).not.toContain('test-sans-image');
    expect(unavailable).toContain('test-sans-image');
  });

  it('garde toutes les notices en attente pour la préparation textuelle', async () => {
    await seed();
    const response = await GET(new Request('http://localhost/api/embeddings?kind=semantic'));
    const { pending, unavailable } = await response.json() as { pending: { id: string }[]; unavailable: string[] };
    const ids = pending.map(row => row.id);
    expect(ids).toContain('test-avec-image');
    expect(ids).toContain('test-sans-image');
    expect(unavailable).toEqual([]);
  });

  it('refuse de relayer une illustration hébergée hors des hôtes autorisés', async () => {
    await importStamps(await getDb(), [{ ...base, id: 'test-hote-interdit', title: 'Hôte interdit',
      image_url: 'https://www.wikitimbres.fr/public/stamps/800/POSTE-1850-4.jpg' }]);
    const response = await image(new Request('http://localhost/api/image/test-hote-interdit'), { params: { id: 'test-hote-interdit' } });
    expect(response.status).toBe(403);
  });
});
