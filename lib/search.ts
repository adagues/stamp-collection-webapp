import type { Client } from '@libsql/client';
import { InputError } from './collection';
import { lexicalPattern, lexicalPredicate, lexicalTokens } from './lexical';
import { DIMENSIONS, MODELS, type EmbeddingKind } from './types';

export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; aa += a[i]*a[i]; bb += b[i]*b[i]; }
  return aa && bb ? Math.max(-1, Math.min(1, dot / Math.sqrt(aa*bb))) : 0;
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

export async function searchStamps(db: Client, text: string, kind?: EmbeddingKind, vector?: number[]) {
  const tokens = lexicalTokens(text);
  const predicate = lexicalPredicate('search_text', tokens);
  if (kind && vector) validateVector(vector, kind);
  const score = tokens.map(() => `CASE WHEN (' ' || search_text) LIKE ? THEN 1 ELSE 0 END`).join(' + ');
  const lexicalPromise = tokens.length
    ? db.execute({
        sql: `SELECT stamp_id AS id, (${score}) AS score FROM stamp_search
          WHERE ${predicate.sql} ORDER BY score DESC, stamp_id LIMIT 100`,
        args: [...tokens.map(lexicalPattern), ...predicate.args],
      })
    : Promise.resolve(null);
  const embeddingsPromise = kind && vector
    ? db.execute({
        sql: `SELECT stamp_id AS id,
          1.0 - vector_distance_cos(vector32(vector_json), vector32(?)) AS score
          FROM embeddings WHERE kind=? AND model=?
          ORDER BY score DESC, stamp_id LIMIT 100`,
        args: [JSON.stringify(vector), kind, MODELS[kind]],
      })
    : Promise.resolve(null);
  const [lexicalResult, embeddingsResult] = await Promise.all([lexicalPromise, embeddingsPromise]);
  const lexical = lexicalResult?.rows.map(row => ({ id: String(row.id), score: Number(row.score) })) || [];
  if (!kind || !vector || !embeddingsResult) return lexical.slice(0, 24);
  const similar = embeddingsResult.rows.map(row => ({ id: String(row.id), score: Number(row.score) }));
  return (kind === 'semantic' && tokens.length ? reciprocalRank([lexical, similar]) : similar).slice(0, 24);
}
