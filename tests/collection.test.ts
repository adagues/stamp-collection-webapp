import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, importStamps } from '../lib/database';
import { saveCollection, validateCollection } from '../lib/collection';
import catalog from '../data/catalog.json';
let db: ReturnType<typeof createDatabase>, directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'coffre-')); db = createDatabase(join(directory,'test.sqlite')); importStamps(db, catalog.slice(0,2)); });
afterEach(() => { if (db.open) db.close(); rmSync(directory, { recursive: true, force: true }); });
describe('Collection SQLite', () => {
  it('crée, relit, modifie et retire une possession sans perdre sa référence', () => {
    const id = catalog[0].id;
    saveCollection(db, id, { owned:true, quantity:2, personal_reference:'Album A · page 4' });
    expect(db.prepare('SELECT quantity FROM collection_entries WHERE stamp_id=?').get(id)).toEqual({ quantity:2 });
    saveCollection(db, id, { owned:true, quantity:5, personal_reference:'Album B' });
    const result = saveCollection(db, id, { owned:false, quantity:5, personal_reference:'Album B' });
    expect(result).toEqual({ owned:false, quantity:0, personal_reference:'Album B' });
    expect(db.prepare('SELECT count(*) AS n FROM collection_entries').get()).toEqual({ n:1 });
  });
  it('conserve les données après fermeture et réouverture du serveur', () => {
    saveCollection(db, catalog[0].id, { owned:true, quantity:3, personal_reference:'Classeur' });
    db.close(); db = createDatabase(join(directory,'test.sqlite'));
    expect(db.prepare('SELECT quantity, personal_reference FROM collection_entries').get()).toEqual({ quantity:3, personal_reference:'Classeur' });
  });
  it('refuse une quantité invalide, une référence trop longue et un timbre absent', () => {
    const entry = { owned:true, quantity:1, personal_reference:'' };
    for (const quantity of [-1,1.2,10000,'2',null]) expect(() => validateCollection({ ...entry,quantity })).toThrow();
    expect(() => validateCollection({ ...entry, personal_reference:'x'.repeat(501) })).toThrow();
    expect(() => saveCollection(db, 'inconnu', entry)).toThrow('Timbre introuvable.');
    expect(db.prepare('SELECT count(*) AS n FROM collection_entries').get()).toEqual({ n:0 });
  });
  it('normalise la possession cochée à au moins un exemplaire', () => {
    expect(validateCollection({ owned:true, quantity:0, personal_reference:'  A  ' })).toEqual({ owned:true, quantity:1, personal_reference:'A' });
  });
  it('préserve la collection et invalide les vecteurs lors d’un import', () => {
    saveCollection(db, catalog[0].id, { owned:true, quantity:2, personal_reference:'A' });
    db.prepare('INSERT INTO embeddings VALUES(?,?,?,?)').run(catalog[0].id,'visual','modele','[1]');
    importStamps(db,[{ ...catalog[0], description:'Notice actualisée' }]);
    expect(db.prepare('SELECT quantity FROM collection_entries').get()).toEqual({ quantity:2 });
    expect(db.prepare('SELECT count(*) AS n FROM embeddings').get()).toEqual({ n:0 });
  });
});
