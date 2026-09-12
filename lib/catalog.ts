import { lexicalQuery } from './search';
import { getDb } from './database';
import type { StampView } from './types';
export const SELECT_STAMPS = `SELECT s.*, COALESCE(c.owned,0) AS owned, COALESCE(c.quantity,0) AS quantity,
  COALESCE(c.personal_reference,'') AS personal_reference FROM stamps s LEFT JOIN collection_entries c ON c.stamp_id=s.id`;
export function asStamp(row: unknown): StampView {
  const stamp = row as StampView;
  return { ...stamp, owned: Boolean(stamp.owned) };
}
export function getStamp(id: string) {
  const row = getDb().prepare(`${SELECT_STAMPS} WHERE s.id = ?`).get(id);
  return row ? asStamp(row) : null;
}
export function listStamps(params: URLSearchParams) {
  const where: string[] = []; const args: (string | number)[] = [];
  const query = params.get('q')?.trim().slice(0, 200);
  if (query) {
    const tokens = lexicalQuery(query);
    where.push(tokens ? 's.rowid IN (SELECT rowid FROM stamps_fts WHERE stamps_fts MATCH ?)' : '0');
    if (tokens) args.push(tokens);
  }
  for (const field of ['year', 'series', 'country']) if (params.get(field)) { where.push(`s.${field} = ?`); args.push(params.get(field)!); }
  if (params.get('owned') === '1') where.push('c.owned = 1');
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const db = getDb();
  const total = (db.prepare(`SELECT count(*) AS n FROM stamps s LEFT JOIN collection_entries c ON c.stamp_id=s.id${clause}`).get(...args) as { n: number }).n;
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 24));
  const page = Math.min(Math.max(1, Math.ceil(total / limit)), Math.max(1, Math.floor(Number(params.get('page')) || 1)));
  const order = params.get('sort') === 'recent' ? 's.year DESC, s.id' : params.get('sort') === 'title' ? 's.title, s.id' : 's.year, s.id';
  const items = db.prepare(`${SELECT_STAMPS}${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, (page-1)*limit).map(asStamp);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}
export function collectionStats() {
  const db = getDb();
  return db.prepare(`SELECT count(*) AS count, COALESCE(sum(c.quantity),0) AS quantity,
    count(s.estimated_value) AS valued_count,
    sum(CASE WHEN s.currency='EUR' THEN s.estimated_value*c.quantity END) AS total_value
    FROM collection_entries c JOIN stamps s ON s.id=c.stamp_id WHERE c.owned=1`).get() as { count: number; quantity: number; valued_count: number; total_value: number | null };
}
export function catalogFilters() {
  const db = getDb();
  return { years: (db.prepare('SELECT DISTINCT year FROM stamps ORDER BY year').all() as { year: number }[]).map(r => r.year),
    series: (db.prepare('SELECT DISTINCT series FROM stamps ORDER BY series').all() as { series: string }[]).map(r => r.series),
    total: (db.prepare('SELECT count(*) AS n FROM stamps').get() as { n: number }).n };
}
