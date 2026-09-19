import type { Client, Row, Value } from '@libsql/client';
import { lexicalPredicate, lexicalTokens } from './lexical';
import { getDb } from './database';
import type { StampView } from './types';

export const SELECT_STAMPS = `SELECT s.*, COALESCE(c.owned,0) AS owned, COALESCE(c.quantity,0) AS quantity,
  COALESCE(c.personal_reference,'') AS personal_reference FROM stamps s LEFT JOIN collection_entries c ON c.stamp_id=s.id`;

function text(value: Value | undefined) { return value == null ? '' : String(value); }
export function asStamp(row: Row): StampView {
  return {
    id: text(row.id), title: text(row.title), country: text(row.country), year: Number(row.year),
    series: text(row.series), denomination: text(row.denomination), description: text(row.description),
    image_url: text(row.image_url), image_credit: text(row.image_credit), source_url: text(row.source_url),
    catalog_number: row.catalog_number == null ? null : String(row.catalog_number),
    estimated_value: row.estimated_value == null ? null : Number(row.estimated_value),
    currency: text(row.currency), owned: Boolean(Number(row.owned)), quantity: Number(row.quantity),
    personal_reference: text(row.personal_reference),
  };
}

export async function getStamp(id: string) {
  const db = await getDb();
  const result = await db.execute({ sql: `${SELECT_STAMPS} WHERE s.id = ?`, args: [id] });
  return result.rows[0] ? asStamp(result.rows[0]) : null;
}

export async function getStamps(ids: string[], client?: Client) {
  if (!ids.length) return [];
  const db = client || await getDb();
  const uniqueIds = [...new Set(ids)];
  const result = await db.execute({
    sql: `${SELECT_STAMPS} WHERE s.id IN (${uniqueIds.map(() => '?').join(',')})`,
    args: uniqueIds,
  });
  const byId = new Map(result.rows.map(row => [String(row.id), asStamp(row)]));
  return ids.map(id => byId.get(id)).filter((stamp): stamp is StampView => Boolean(stamp));
}

export async function listStamps(params: URLSearchParams) {
  const where: string[] = []; const args: (string | number)[] = [];
  const query = params.get('q')?.trim().slice(0, 200);
  if (query) {
    const tokens = lexicalTokens(query);
    const predicate = lexicalPredicate('search_text', tokens);
    where.push(tokens.length ? `s.id IN (SELECT stamp_id FROM stamp_search WHERE ${predicate.sql})` : '0');
    args.push(...predicate.args);
  }
  for (const field of ['year', 'series', 'country']) if (params.get(field)) { where.push(`s.${field} = ?`); args.push(params.get(field)!); }
  if (params.get('owned') === '1') where.push('c.owned = 1');
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const db = await getDb();
  const count = await db.execute({ sql: `SELECT count(*) AS n FROM stamps s LEFT JOIN collection_entries c ON c.stamp_id=s.id${clause}`, args });
  const total = Number(count.rows[0]?.n);
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 24));
  const page = Math.min(Math.max(1, Math.ceil(total / limit)), Math.max(1, Math.floor(Number(params.get('page')) || 1)));
  const order = params.get('sort') === 'recent' ? 's.year DESC, s.id' : params.get('sort') === 'title' ? 's.title, s.id' : 's.year, s.id';
  const result = await db.execute({ sql: `${SELECT_STAMPS}${clause} ORDER BY ${order} LIMIT ? OFFSET ?`, args: [...args, limit, (page-1)*limit] });
  return { items: result.rows.map(asStamp), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function collectionStats() {
  const db = await getDb();
  const result = await db.execute(`SELECT count(*) AS count, COALESCE(sum(c.quantity),0) AS quantity,
    count(s.estimated_value) AS valued_count,
    sum(CASE WHEN s.currency='EUR' THEN s.estimated_value*c.quantity END) AS total_value
    FROM collection_entries c JOIN stamps s ON s.id=c.stamp_id WHERE c.owned=1`);
  const row = result.rows[0];
  return { count: Number(row?.count), quantity: Number(row?.quantity), valued_count: Number(row?.valued_count), total_value: row?.total_value == null ? null : Number(row.total_value) };
}

export async function catalogFilters() {
  const db = await getDb();
  const [years, series, total] = await db.batch([
    'SELECT DISTINCT year FROM stamps ORDER BY year',
    'SELECT DISTINCT series FROM stamps ORDER BY series',
    'SELECT count(*) AS n FROM stamps',
  ], 'read');
  return {
    years: years.rows.map(row => Number(row.year)),
    series: series.rows.map(row => String(row.series)),
    total: Number(total.rows[0]?.n),
  };
}
