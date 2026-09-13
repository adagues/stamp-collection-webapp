import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getDb } from '../lib/database';
import { contentHash, type SeedRow } from '../lib/seed-embeddings';
import { MODELS, type EmbeddingKind, type Stamp } from '../lib/types';
// Local artefact only: never overwrite the tracked demonstration file. Vectors computed from
// third-party illustrations must not be republished by accident (see DATA-LICENSE.md).
//
// The export describes the LOCAL database actually opened, not the demonstration catalogue
// shipped with the repository: a notice imported by the user must be exported, and each
// published fingerprint is computed from the stamp as stored, so the file never claims to
// document a vector it did not read.
const target = process.env.EMBEDDINGS_OUTPUT || join(process.cwd(), 'data', 'exports', 'embeddings.json');
const db = getDb();
const stamps = db.prepare('SELECT * FROM stamps ORDER BY id').all() as Stamp[];
const stored = db.prepare(`SELECT stamp_id, kind, model, vector_json FROM embeddings
  ORDER BY stamp_id, kind`).all() as { stamp_id: string; kind: EmbeddingKind; model: string; vector_json: string }[];
const byId = new Map(stamps.map(stamp => [stamp.id, stamp]));
const rows: SeedRow[] = [];
for (const row of stored) {
  const stamp = byId.get(row.stamp_id);
  // A vector whose model no longer matches the application cannot be replayed by the seed.
  if (!stamp || row.model !== MODELS[row.kind]) continue;
  rows.push({ stamp_id: row.stamp_id, kind: row.kind, model: row.model,
    content_hash: contentHash(stamp, row.kind), vector: JSON.parse(row.vector_json) });
}
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `[\n${rows.map(row => JSON.stringify(row)).join(',\n')}\n]\n`);
const missing = stamps.length * 2 - rows.length;
console.log(`${rows.length} vecteurs exportés vers ${target.replace(`${process.cwd()}/`, '')}, pour ${stamps.length} notice(s) de la base locale, sans les références de collection.`);
if (missing > 0) console.log(`${missing} vecteur(s) encore à préparer depuis la page de recherche avant un export complet.`);
console.log('Export local : ce fichier est exclu de Git et ne remplace pas le jeu de démonstration livré. Sa diffusion demande une vérification distincte des droits.');
db.close();
