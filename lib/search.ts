import type Database from 'better-sqlite3';
import { InputError } from './collection';
import { DIMENSIONS, MODELS, type EmbeddingKind } from './types';
export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; aa += a[i]*a[i]; bb += b[i]*b[i]; }
  return aa && bb ? Math.max(-1, Math.min(1, dot / Math.sqrt(aa*bb))) : 0;
}
export function lexicalQuery(text: string) {
  return (text.match(/[\p{L}\p{N}]+/gu) || []).slice(0, 20).map(token => `"${token}"*`).join(' OR ');
}
export function validateVector(vector: unknown, kind: EmbeddingKind): asserts vector is number[] {
  if (!Array.isArray(vector) || vector.length !== DIMENSIONS[kind] || !vector.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e6) || !vector.some(n => n !== 0))
    throw new InputError('Vecteur de recherche invalide ou incompatible avec le modèle.');
}
export function reciprocalRank(lists: { id: string; score: number }[][]) {
  const scores = new Map<string, number>();
  for (const list of lists) list.forEach((row, index) => scores.set(row.id, (scores.get(row.id) || 0) + 1 / (60 + index + 1)));
  return [...scores].map(([id, score]) => ({ id, score })).sort((a,b) => b.score-a.score || a.id.localeCompare(b.id));
}
export function searchStamps(db: Database.Database, text: string, kind?: EmbeddingKind, vector?: number[]) {
  const query = lexicalQuery(text);
  const lexical = query ? db.prepare(`SELECT s.id, -bm25(stamps_fts) AS score FROM stamps_fts
    JOIN stamps s ON s.rowid=stamps_fts.rowid WHERE stamps_fts MATCH ? ORDER BY bm25(stamps_fts), s.id LIMIT 100`).all(query) as { id: string; score: number }[] : [];
  if (!kind || !vector) return lexical.slice(0, 24);
  validateVector(vector, kind);
  const rows = db.prepare('SELECT stamp_id AS id, vector_json FROM embeddings WHERE kind=? AND model=?').all(kind, MODELS[kind]) as { id: string; vector_json: string }[];
  const similar = rows.map(row => ({ id: row.id, score: cosine(vector, JSON.parse(row.vector_json)) }))
    .sort((a,b) => b.score-a.score || a.id.localeCompare(b.id)).slice(0, 100);
  return (kind === 'semantic' && query ? reciprocalRank([lexical, similar]) : similar).slice(0, 24);
}
