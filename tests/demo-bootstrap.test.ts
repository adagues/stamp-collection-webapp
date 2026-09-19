import type { Client } from '@libsql/client';
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
const cache = globalThis as unknown as { stampDatabase?: Promise<Client> };
afterEach(async () => {
  if (cache.stampDatabase) (await cache.stampDatabase).close();
  delete cache.stampDatabase;
  delete process.env.TURSO_DATABASE_URL;
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
  it('n’amorce pas le catalogue de démonstration dans une base déjà peuplée', async () => {
    const path = workspace();
    const first = await createDatabase(path);
    await importStamps(first, [personal]);
    await first.execute({ sql:'INSERT INTO collection_entries(stamp_id,owned,quantity,personal_reference) VALUES(?,1,3,?)', args:[personal.id, 'Classeur rouge · page 2'] });
    first.close();

    process.env.TURSO_DATABASE_URL = `file:${path}`;
    const db = await getDb();
    const ids = (await db.execute('SELECT id FROM stamps ORDER BY id')).rows.map(row => String(row.id));
    expect(ids).toEqual([personal.id]);
    expect(ids.some(id => id.startsWith('demo-'))).toBe(false);
    const row = (await db.execute({ sql:'SELECT quantity, personal_reference FROM collection_entries WHERE stamp_id=?', args:[personal.id] })).rows[0];
    expect({ quantity:Number(row?.quantity), personal_reference:String(row?.personal_reference) })
      .toEqual({ quantity: 3, personal_reference: 'Classeur rouge · page 2' });
  });

  it('amorce le catalogue de démonstration uniquement dans une base vide', async () => {
    const path = workspace();
    process.env.TURSO_DATABASE_URL = `file:${path}`;
    const db = await getDb();
    const rows = (await db.execute('SELECT id FROM stamps')).rows;
    expect(rows).toHaveLength(catalog.length);
    expect(rows.every(row => String(row.id).startsWith('demo-'))).toBe(true);
  });

  it('conserve la collection d’un timbre absent du catalogue de démonstration après réimport', async () => {
    const path = workspace();
    const db = await createDatabase(path);
    await importStamps(db, [personal]);
    await db.execute({ sql:'INSERT INTO collection_entries(stamp_id,owned,quantity,personal_reference) VALUES(?,1,1,?)', args:[personal.id, 'Album vert'] });
    await importStamps(db, catalog);
    const row = (await db.execute({ sql:'SELECT quantity, personal_reference FROM collection_entries WHERE stamp_id=?', args:[personal.id] })).rows[0];
    expect({ quantity:Number(row?.quantity), personal_reference:String(row?.personal_reference) }).toEqual({ quantity: 1, personal_reference: 'Album vert' });
    expect(Number((await db.execute('SELECT count(*) AS n FROM stamps')).rows[0]?.n)).toBe(catalog.length + 1);
    db.close();
  });
});
