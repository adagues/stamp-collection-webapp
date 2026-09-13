import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
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
export function seedEmbeddings(db: Database.Database, rows: SeedRow[] = seed as SeedRow[]) {
  const insert = db.prepare('INSERT OR IGNORE INTO embeddings(stamp_id,kind,model,vector_json) VALUES(?,?,?,?)');
  const stamps = new Map((db.prepare('SELECT * FROM stamps').all() as Stamp[]).map(stamp => [stamp.id, stamp]));
  db.transaction(() => {
    for (const row of rows) {
      const stamp = stamps.get(row.stamp_id);
      if (!stamp || row.model !== MODELS[row.kind] || contentHash(stamp, row.kind) !== row.content_hash) continue;
      validateVector(row.vector, row.kind);
      insert.run(row.stamp_id, row.kind, row.model, JSON.stringify(row.vector));
    }
  })();
}
