import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, importStamps } from '../lib/database';
import { saveCollection, validateCollection } from '../lib/collection';
import catalog from '../data/catalog.json';
let db: Client, directory: string;
beforeEach(async () => { directory = mkdtempSync(join(tmpdir(), 'coffre-')); db = await createDatabase(join(directory,'test.sqlite')); await importStamps(db, catalog.slice(0,2)); });
afterEach(() => { if (!db.closed) db.close(); rmSync(directory, { recursive: true, force: true }); });
describe('Collection libSQL', () => {
  it('crée, relit, modifie et retire une possession sans perdre sa référence', async () => {
    const id = catalog[0].id;
    await saveCollection(db, id, { owned:true, quantity:2, personal_reference:'Album A · page 4' });
    expect(Number((await db.execute({ sql:'SELECT quantity FROM collection_entries WHERE stamp_id=?', args:[id] })).rows[0]?.quantity)).toBe(2);
    await saveCollection(db, id, { owned:true, quantity:5, personal_reference:'Album B' });
    const result = await saveCollection(db, id, { owned:false, quantity:5, personal_reference:'Album B' });
    expect(result).toEqual({ owned:false, quantity:0, personal_reference:'Album B' });
    expect(Number((await db.execute('SELECT count(*) AS n FROM collection_entries')).rows[0]?.n)).toBe(1);
  });
  it('conserve les données après fermeture et réouverture du serveur', async () => {
    await saveCollection(db, catalog[0].id, { owned:true, quantity:3, personal_reference:'Classeur' });
    db.close(); db = await createDatabase(join(directory,'test.sqlite'));
    const row = (await db.execute('SELECT quantity, personal_reference FROM collection_entries')).rows[0];
    expect({ quantity:Number(row?.quantity), personal_reference:String(row?.personal_reference) }).toEqual({ quantity:3, personal_reference:'Classeur' });
  });
  it('refuse une quantité invalide, une référence trop longue et un timbre absent', async () => {
    const entry = { owned:true, quantity:1, personal_reference:'' };
    for (const quantity of [-1,1.2,10000,'2',null]) expect(() => validateCollection({ ...entry,quantity })).toThrow();
    expect(() => validateCollection({ ...entry, personal_reference:'x'.repeat(501) })).toThrow();
    await expect(saveCollection(db, 'inconnu', entry)).rejects.toThrow('Timbre introuvable.');
    expect(Number((await db.execute('SELECT count(*) AS n FROM collection_entries')).rows[0]?.n)).toBe(0);
  });
  it('normalise la possession cochée à au moins un exemplaire', () => {
    expect(validateCollection({ owned:true, quantity:0, personal_reference:'  A  ' })).toEqual({ owned:true, quantity:1, personal_reference:'A' });
  });
  it('préserve la collection et invalide les vecteurs lors d’un import', async () => {
    await saveCollection(db, catalog[0].id, { owned:true, quantity:2, personal_reference:'A' });
    await db.execute({ sql:'INSERT INTO embeddings VALUES(?,?,?,?)', args:[catalog[0].id,'visual','modele','[1]'] });
    await importStamps(db,[{ ...catalog[0], description:'Notice actualisée' }]);
    expect(Number((await db.execute('SELECT quantity FROM collection_entries')).rows[0]?.quantity)).toBe(2);
    expect(Number((await db.execute('SELECT count(*) AS n FROM embeddings')).rows[0]?.n)).toBe(0);
  });
});
