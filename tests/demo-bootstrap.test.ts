import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, getDb, importStamps } from '../lib/database';
import catalog from '../data/catalog.json';

// Le passage à un catalogue de démonstration ne doit rien effacer : une base personnelle déjà
// remplie garde ses notices importées et sa collection, y compris ses timbres inconnus du
// nouveau jeu livré. Le bootstrap n'amorce que les bases réellement vides.
const directories: string[] = [];
const cache = globalThis as unknown as { stampDatabase?: { open: boolean; close(): void } };
afterEach(() => {
  if (cache.stampDatabase?.open) cache.stampDatabase.close();
  delete cache.stampDatabase;
  delete process.env.DATABASE_PATH;
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function workspace() {
  const directory = mkdtempSync(join(tmpdir(), 'coffre-bootstrap-'));
  directories.push(directory);
  return join(directory, 'vault.sqlite');
}
const personal = {
  id: 'perso-0001', title: 'Notice importée par l’utilisateur', country: 'France', year: 1927,
  series: 'Album personnel', denomination: '50 c', description: 'Notice importée localement.',
  image_url: '', image_credit: '', source_url: 'https://exemple.invalid/notice',
  catalog_number: null, estimated_value: null, currency: 'EUR',
};

describe('bootstrap non destructif au changement de catalogue livré', () => {
  it('n’amorce pas le catalogue de démonstration dans une base déjà peuplée', () => {
    const path = workspace();
    const first = createDatabase(path);
    importStamps(first, [personal]);
    first.prepare('INSERT INTO collection_entries(stamp_id,owned,quantity,personal_reference) VALUES(?,1,3,?)')
      .run(personal.id, 'Classeur rouge · page 2');
    first.close();

    process.env.DATABASE_PATH = path;
    const db = getDb();
    const ids = (db.prepare('SELECT id FROM stamps ORDER BY id').all() as { id: string }[]).map(row => row.id);
    expect(ids).toEqual([personal.id]);
    expect(ids.some(id => id.startsWith('demo-'))).toBe(false);
    expect(db.prepare('SELECT quantity, personal_reference FROM collection_entries WHERE stamp_id=?').get(personal.id))
      .toEqual({ quantity: 3, personal_reference: 'Classeur rouge · page 2' });
  });

  it('amorce le catalogue de démonstration uniquement dans une base vide', () => {
    const path = workspace();
    process.env.DATABASE_PATH = path;
    const db = getDb();
    const rows = db.prepare('SELECT id FROM stamps').all() as { id: string }[];
    expect(rows).toHaveLength(catalog.length);
    expect(rows.every(row => row.id.startsWith('demo-'))).toBe(true);
  });

  it('conserve la collection d’un timbre absent du catalogue de démonstration après réimport', () => {
    const path = workspace();
    const db = createDatabase(path);
    importStamps(db, [personal]);
    db.prepare('INSERT INTO collection_entries(stamp_id,owned,quantity,personal_reference) VALUES(?,1,1,?)')
      .run(personal.id, 'Album vert');
    importStamps(db, catalog);
    expect(db.prepare('SELECT quantity, personal_reference FROM collection_entries WHERE stamp_id=?').get(personal.id))
      .toEqual({ quantity: 1, personal_reference: 'Album vert' });
    expect((db.prepare('SELECT count(*) AS n FROM stamps').get() as { n: number }).n).toBe(catalog.length + 1);
    db.close();
  });
});
