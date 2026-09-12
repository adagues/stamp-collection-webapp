import { writeFileSync } from 'node:fs';
import { getDb } from '../lib/database';
import { contentHash } from '../lib/seed-embeddings';
import { MODELS, type EmbeddingKind } from '../lib/types';
import catalog from '../data/catalog.json';
const db = getDb();
const rows: { stamp_id: string; kind: EmbeddingKind; model: string; content_hash: string; vector: number[] }[] = [];
for (const stamp of catalog) {
  for (const kind of ['visual','semantic'] as const) {
    const row = db.prepare('SELECT vector_json FROM embeddings WHERE stamp_id=? AND kind=? AND model=?').get(stamp.id, kind, MODELS[kind]) as { vector_json: string } | undefined;
    if (row) rows.push({ stamp_id: stamp.id, kind, model: MODELS[kind], content_hash: contentHash(stamp, kind), vector: JSON.parse(row.vector_json) });
  }
}
if (rows.length !== catalog.length * 2) throw new Error('Préparez toutes les images et tous les textes avant l’export.');
writeFileSync('data/embeddings.json', `[\n${rows.map(row => JSON.stringify(row)).join(',\n')}\n]\n`);
console.log(`${rows.length} vecteurs exportés pour le catalogue initial, sans les références de collection.`);
db.close();
