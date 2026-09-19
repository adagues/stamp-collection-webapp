import { createClient as createLibsqlClient, type Client, type Config, type InStatement, type Row } from '@libsql/client';
import { createClient as createTursoClient } from '@tursodatabase/serverless/compat';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import catalog from '../data/catalog.json';
import { stampSearchText } from './lexical';
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
  `CREATE TABLE IF NOT EXISTS stamp_search (
    stamp_id TEXT PRIMARY KEY REFERENCES stamps(id) ON DELETE CASCADE,
    search_text TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // Previous libSQL releases used FTS5 triggers. The Rust MVCC engine does not support
  // virtual tables, so remove the triggers and leave any legacy virtual table unused.
  'DROP TRIGGER IF EXISTS stamps_ai',
  'DROP TRIGGER IF EXISTS stamps_ad',
  'DROP TRIGGER IF EXISTS stamps_au',
];

const SEARCH_UPSERT = `INSERT INTO stamp_search(stamp_id, search_text) VALUES(?, ?)
  ON CONFLICT(stamp_id) DO UPDATE SET search_text=excluded.search_text`;

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
  if (/^(?:turso|libsql|https|wss):\/\//.test(location)) return location;
  const filename = resolve(location);
  mkdirSync(dirname(filename), { recursive: true });
  return `file:${filename}`;
}

function searchStatement(stamp: { id: string; title: string; series: string; description: string; country: string }): InStatement {
  return { sql: SEARCH_UPSERT, args: [stamp.id, stampSearchText(stamp)] };
}

function stampFromSearchRow(row: Row) {
  return {
    id: String(row.id), title: String(row.title), series: String(row.series),
    description: String(row.description), country: String(row.country),
  };
}

async function migrateSearchIndex(db: Client) {
  const transaction = await db.transaction('write');
  try {
    const version = await transaction.execute({ sql: 'SELECT value FROM app_metadata WHERE key = ?', args: ['schema_version'] });
    if (String(version.rows[0]?.value || '') !== '2') {
      const existing = await transaction.execute('SELECT id, title, series, description, country FROM stamps ORDER BY id');
      for (let offset = 0; offset < existing.rows.length; offset += 100) {
        await transaction.batch(existing.rows.slice(offset, offset + 100).map(row => searchStatement(stampFromSearchRow(row))));
      }
      await transaction.execute(`INSERT INTO app_metadata(key, value, updated_at) VALUES('schema_version', '2', CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`);
    }
    await transaction.commit();
  } catch (error) {
    try { await transaction.rollback(); } catch { /* the original migration error is more useful */ }
    throw error;
  }
}

export async function createDatabase(location: string, authToken?: string): Promise<Client> {
  const url = normalizeLocation(location);
  const config: Config = authToken ? { url, authToken } : { url };
  const db = url.startsWith('turso://')
    ? createTursoClient(config) as unknown as Client
    : createLibsqlClient(config);
  try {
    if (url.startsWith('file:')) await db.execute('PRAGMA busy_timeout = 5000');
    await db.batch(SCHEMA, 'write');
    await migrateSearchIndex(db);
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
    statements.push(searchStatement(stamp));
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
  const conditionalSearch = `INSERT INTO stamp_search(stamp_id, search_text)
    SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM app_metadata WHERE key = ?)
    ON CONFLICT(stamp_id) DO UPDATE SET search_text=excluded.search_text`;
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
      sql: conditionalSearch,
      args: [stamp.id, stampSearchText(stamp), CATALOG_BOOTSTRAP_KEY],
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
  if (/^(?:turso|libsql):\/\//.test(configuredUrl) && !token) {
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
