import type { Client, InStatement } from '@libsql/client';
import { createHash } from 'node:crypto';
import seed from '../data/embeddings.json';
import { MODELS, type EmbeddingKind, type Stamp } from './types';
import { validateVector } from './search';
export function contentHash(stamp: Stamp, kind: EmbeddingKind) {
  const content = kind === 'visual' ? stamp.image_url : `${stamp.title}. ${stamp.description}`;
  return createHash('sha256').update(content).digest('hex');
}
export type SeedRow = { stamp_id: string; kind: EmbeddingKind; model: string; content_hash: string; vector: number[] };
// The published file is empty on purpose (see DATA-LICENSE.md); `rows` lets a caller
// seed vectors it produced or imported locally without going through the distributed file.
export async function seedEmbeddings(db: Client, rows: SeedRow[] = seed as SeedRow[]): Promise<void> {
  const result = await db.execute('SELECT * FROM stamps');
  const stamps = new Map(result.rows.map(row => {
    const stamp: Stamp = {
      id: String(row.id), title: String(row.title), country: String(row.country), year: Number(row.year),
      series: String(row.series), denomination: String(row.denomination), description: String(row.description),
      image_url: String(row.image_url), image_credit: String(row.image_credit), source_url: String(row.source_url),
      catalog_number: row.catalog_number == null ? null : String(row.catalog_number),
      estimated_value: row.estimated_value == null ? null : Number(row.estimated_value), currency: String(row.currency),
    };
    return [stamp.id, stamp] as const;
  }));
  const inserts: InStatement[] = [];
  for (const row of rows) {
    const stamp = stamps.get(row.stamp_id);
    if (!stamp || row.model !== MODELS[row.kind] || contentHash(stamp, row.kind) !== row.content_hash) continue;
    validateVector(row.vector, row.kind);
    inserts.push({
      sql: 'INSERT OR IGNORE INTO embeddings(stamp_id,kind,model,vector_json) VALUES(?,?,?,?)',
      args: [row.stamp_id, row.kind, row.model, JSON.stringify(row.vector)],
    });
  }
  if (inserts.length) await db.batch(inserts, 'write');
}
