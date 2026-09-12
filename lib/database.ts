import Database from 'better-sqlite3';
import { seedEmbeddings } from './seed-embeddings';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import catalog from '../data/catalog.json';
import type { Stamp } from './types';
export function createDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS stamps (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, country TEXT NOT NULL, year INTEGER NOT NULL,
      series TEXT NOT NULL, denomination TEXT NOT NULL, description TEXT NOT NULL,
      image_url TEXT NOT NULL, image_credit TEXT NOT NULL, source_url TEXT NOT NULL,
      catalog_number TEXT, estimated_value REAL, currency TEXT NOT NULL DEFAULT 'EUR'
    );
    CREATE TABLE IF NOT EXISTS collection_entries (
      stamp_id TEXT PRIMARY KEY REFERENCES stamps(id) ON DELETE CASCADE,
      owned INTEGER NOT NULL CHECK(owned IN (0,1)), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 0 AND 9999),
      personal_reference TEXT NOT NULL DEFAULT '' CHECK(length(personal_reference) <= 500),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK((owned = 0 AND quantity = 0) OR (owned = 1 AND quantity > 0))
    );
    CREATE TABLE IF NOT EXISTS embeddings (
      stamp_id TEXT REFERENCES stamps(id) ON DELETE CASCADE, kind TEXT NOT NULL,
      model TEXT NOT NULL, vector_json TEXT NOT NULL, PRIMARY KEY(stamp_id, kind, model)
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS stamps_fts USING fts5(
      title, series, description, country, content='stamps', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER IF NOT EXISTS stamps_ai AFTER INSERT ON stamps BEGIN
      INSERT INTO stamps_fts(rowid,title,series,description,country) VALUES(new.rowid,new.title,new.series,new.description,new.country);
    END;
    CREATE TRIGGER IF NOT EXISTS stamps_ad AFTER DELETE ON stamps BEGIN
      INSERT INTO stamps_fts(stamps_fts,rowid,title,series,description,country) VALUES('delete',old.rowid,old.title,old.series,old.description,old.country);
    END;
    CREATE TRIGGER IF NOT EXISTS stamps_au AFTER UPDATE ON stamps BEGIN
      INSERT INTO stamps_fts(stamps_fts,rowid,title,series,description,country) VALUES('delete',old.rowid,old.title,old.series,old.description,old.country);
      INSERT INTO stamps_fts(rowid,title,series,description,country) VALUES(new.rowid,new.title,new.series,new.description,new.country);
    END;
    PRAGMA user_version = 1;
  `);
  return db;
}
export function importStamps(db: Database.Database, stamps: Stamp[]) {
  const fields = ['id','title','country','year','series','denomination','description','image_url','image_credit','source_url','catalog_number','estimated_value','currency'];
  const stmt = db.prepare(`INSERT INTO stamps (${fields.join(',')}) VALUES (${fields.map(f => '@'+f).join(',')})
    ON CONFLICT(id) DO UPDATE SET ${fields.slice(1).map(f => `${f}=excluded.${f}`).join(',')}`);
  const invalidate = db.prepare('DELETE FROM embeddings WHERE stamp_id = ?');
  db.transaction(() => { for (const stamp of stamps) { stmt.run(stamp); invalidate.run(stamp.id); } })();
}
const globalDb = globalThis as unknown as { stampDatabase?: Database.Database };
export function getDb() {
  if (!globalDb.stampDatabase) {
    const db = createDatabase(process.env.DATABASE_PATH || join(process.cwd(), 'data', 'vault.sqlite'));
    if (!(db.prepare('SELECT count(*) AS n FROM stamps').get() as { n: number }).n) {
      importStamps(db, catalog);
      seedEmbeddings(db);
    }
    globalDb.stampDatabase = db;
  }
  return globalDb.stampDatabase;
}
