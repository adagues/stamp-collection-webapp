import { createClient, type Client, type Config, type InStatement } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import catalog from '../data/catalog.json';
import { seedEmbeddings } from './seed-embeddings';
import type { Stamp } from './types';

const SCHEMA: InStatement[] = [
  `CREATE TABLE IF NOT EXISTS stamps (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, country TEXT NOT NULL, year INTEGER NOT NULL,
    series TEXT NOT NULL, denomination TEXT NOT NULL, description TEXT NOT NULL,
    image_url TEXT NOT NULL, image_credit TEXT NOT NULL, source_url TEXT NOT NULL,
    catalog_number TEXT, estimated_value REAL, currency TEXT NOT NULL DEFAULT 'EUR'
  )`,
  `CREATE TABLE IF NOT EXISTS collection_entries (
    stamp_id TEXT PRIMARY KEY REFERENCES stamps(id) ON DELETE CASCADE,
    owned INTEGER NOT NULL CHECK(owned IN (0,1)), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 0 AND 9999),
    personal_reference TEXT NOT NULL DEFAULT '' CHECK(length(personal_reference) <= 500),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK((owned = 0 AND quantity = 0) OR (owned = 1 AND quantity > 0))
  )`,
  `CREATE TABLE IF NOT EXISTS embeddings (
    stamp_id TEXT REFERENCES stamps(id) ON DELETE CASCADE, kind TEXT NOT NULL,
    model TEXT NOT NULL, vector_json TEXT NOT NULL, PRIMARY KEY(stamp_id, kind, model)
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS stamps_fts USING fts5(
    title, series, description, country, content='stamps', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER IF NOT EXISTS stamps_ai AFTER INSERT ON stamps BEGIN
    INSERT INTO stamps_fts(rowid,title,series,description,country) VALUES(new.rowid,new.title,new.series,new.description,new.country);
  END`,
  `CREATE TRIGGER IF NOT EXISTS stamps_ad AFTER DELETE ON stamps BEGIN
    INSERT INTO stamps_fts(stamps_fts,rowid,title,series,description,country) VALUES('delete',old.rowid,old.title,old.series,old.description,old.country);
  END`,
  `CREATE TRIGGER IF NOT EXISTS stamps_au AFTER UPDATE ON stamps BEGIN
    INSERT INTO stamps_fts(stamps_fts,rowid,title,series,description,country) VALUES('delete',old.rowid,old.title,old.series,old.description,old.country);
    INSERT INTO stamps_fts(rowid,title,series,description,country) VALUES(new.rowid,new.title,new.series,new.description,new.country);
  END`,
  `CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `INSERT INTO app_metadata(key, value) VALUES('schema_version', '1')
    ON CONFLICT(key) DO NOTHING`,
];

function normalizeLocation(location: string) {
  if (location === ':memory:') return 'file::memory:';
  if (location.startsWith('file:')) {
    const filename = location.slice(5);
    if (filename && filename !== ':memory:') {
      const localPath = filename.startsWith('//') ? decodeURIComponent(new URL(location).pathname) : filename;
      mkdirSync(dirname(isAbsolute(localPath) ? localPath : resolve(localPath)), { recursive: true });
    }
    return location;
  }
  if (/^(?:libsql|https|wss):\/\//.test(location)) return location;
  const filename = resolve(location);
  mkdirSync(dirname(filename), { recursive: true });
  return `file:${filename}`;
}

export async function createDatabase(location: string, authToken?: string): Promise<Client> {
  const url = normalizeLocation(location);
  const config: Config = authToken ? { url, authToken } : { url };
  const db = createClient(config);
  try {
    if (url.startsWith('file:')) await db.execute('PRAGMA busy_timeout = 5000');
    await db.batch(SCHEMA, 'write');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

const STAMP_FIELDS = ['id','title','country','year','series','denomination','description','image_url','image_credit','source_url','catalog_number','estimated_value','currency'] as const;
const UPSERT_STAMP = `INSERT INTO stamps (${STAMP_FIELDS.join(',')}) VALUES (${STAMP_FIELDS.map(() => '?').join(',')})
  ON CONFLICT(id) DO UPDATE SET ${STAMP_FIELDS.slice(1).map(field => `${field}=excluded.${field}`).join(',')}`;

export async function importStamps(db: Client, stamps: Stamp[]): Promise<void> {
  if (!stamps.length) return;
  const statements: InStatement[] = [];
  for (const stamp of stamps) {
    statements.push({ sql: UPSERT_STAMP, args: STAMP_FIELDS.map(field => stamp[field]) });
    statements.push({ sql: 'DELETE FROM embeddings WHERE stamp_id = ?', args: [stamp.id] });
  }
  await db.batch(statements, 'write');
}

const CATALOG_BOOTSTRAP_KEY = 'catalog_bootstrap_v1';
async function bootstrapCatalog(db: Client): Promise<boolean> {
  const conditionalUpsert = `INSERT INTO stamps (${STAMP_FIELDS.join(',')})
    SELECT ${STAMP_FIELDS.map(() => '?').join(',')} WHERE NOT EXISTS
      (SELECT 1 FROM app_metadata WHERE key = ?)
    ON CONFLICT(id) DO UPDATE SET ${STAMP_FIELDS.slice(1).map(field => `${field}=excluded.${field}`).join(',')}`;
  const statements: InStatement[] = [{
    sql: `INSERT INTO app_metadata(key, value) SELECT ?, 'existing'
      WHERE EXISTS (SELECT 1 FROM stamps) ON CONFLICT(key) DO NOTHING`,
    args: [CATALOG_BOOTSTRAP_KEY],
  }];
  for (const stamp of catalog) {
    statements.push({
      sql: conditionalUpsert,
      args: [...STAMP_FIELDS.map(field => stamp[field]), CATALOG_BOOTSTRAP_KEY],
    });
    statements.push({
      sql: `DELETE FROM embeddings WHERE stamp_id = ? AND NOT EXISTS
        (SELECT 1 FROM app_metadata WHERE key = ?)`,
      args: [stamp.id, CATALOG_BOOTSTRAP_KEY],
    });
  }
  statements.push({
    sql: `INSERT INTO app_metadata(key, value) VALUES(?, 'completed') ON CONFLICT(key) DO NOTHING`,
    args: [CATALOG_BOOTSTRAP_KEY],
  });
  const results = await db.batch(statements, 'write');
  return results[results.length - 1].rowsAffected === 1;
}

function databaseCredentials() {
  const configuredUrl = process.env.TURSO_DATABASE_URL?.trim();
  if (!configuredUrl) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('TURSO_DATABASE_URL est obligatoire en production ; aucun fichier local éphémère ne sera créé.');
    }
    return { url: 'file:data/vault.sqlite', token: undefined };
  }
  const token = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;
  if (configuredUrl.startsWith('libsql://') && !token) {
    throw new Error('TURSO_AUTH_TOKEN est obligatoire avec une base Turso distante.');
  }
  return { url: configuredUrl, token };
}

const globalDb = globalThis as unknown as { stampDatabase?: Promise<Client> };
export function getDb(): Promise<Client> {
  if (!globalDb.stampDatabase) {
    globalDb.stampDatabase = (async () => {
      const { url, token } = databaseCredentials();
      const db = await createDatabase(url, token);
      try {
        if (await bootstrapCatalog(db)) await seedEmbeddings(db);
        return db;
      } catch (error) {
        db.close();
        throw error;
      }
    })().catch(error => {
      delete globalDb.stampDatabase;
      throw error;
    });
  }
  return globalDb.stampDatabase;
}
