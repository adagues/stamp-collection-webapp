import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getDb } from '../lib/database';
import { contentHash, type SeedRow } from '../lib/seed-embeddings';
import { MODELS, type EmbeddingKind, type Stamp } from '../lib/types';
// Local artefact only: never overwrite the tracked demonstration file. Vectors computed from
// third-party illustrations must not be republished by accident (see DATA-LICENSE.md).
//
// The export describes the configured database actually opened, not the demonstration catalogue
// shipped with the repository: a notice imported by the user must be exported, and each
// published fingerprint is computed from the stamp as stored, so the file never claims to
// document a vector it did not read.
const target = process.env.EMBEDDINGS_OUTPUT || join(process.cwd(), 'data', 'exports', 'embeddings.json');

async function main() {
  const db = await getDb();
  try {
    const [stampResult, storedResult] = await db.batch([
      'SELECT * FROM stamps ORDER BY id',
      `SELECT stamp_id, kind, model, vector_json FROM embeddings ORDER BY stamp_id, kind`,
    ], 'read');
    const stamps: Stamp[] = stampResult.rows.map(row => ({
      id: String(row.id), title: String(row.title), country: String(row.country), year: Number(row.year),
      series: String(row.series), denomination: String(row.denomination), description: String(row.description),
      image_url: String(row.image_url), image_credit: String(row.image_credit), source_url: String(row.source_url),
      catalog_number: row.catalog_number == null ? null : String(row.catalog_number),
      estimated_value: row.estimated_value == null ? null : Number(row.estimated_value), currency: String(row.currency),
    }));
    const byId = new Map(stamps.map(stamp => [stamp.id, stamp]));
    const rows: SeedRow[] = [];
    for (const stored of storedResult.rows) {
      const stampId = String(stored.stamp_id), kind = String(stored.kind) as EmbeddingKind;
      const stamp = byId.get(stampId), model = String(stored.model);
      // A vector whose model no longer matches the application cannot be replayed by the seed.
      if (!stamp || model !== MODELS[kind]) continue;
      rows.push({ stamp_id: stampId, kind, model,
        content_hash: contentHash(stamp, kind), vector: JSON.parse(String(stored.vector_json)) });
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `[\n${rows.map(row => JSON.stringify(row)).join(',\n')}\n]\n`);
    const missing = stamps.length * 2 - rows.length;
    console.log(`${rows.length} vecteurs exportés vers ${target.replace(`${process.cwd()}/`, '')}, pour ${stamps.length} notice(s) de la base configurée, sans les références de collection.`);
    if (missing > 0) console.log(`${missing} vecteur(s) encore à préparer depuis la page de recherche avant un export complet.`);
    console.log('Export local : ce fichier est exclu de Git et ne remplace pas le jeu de démonstration livré. Sa diffusion demande une vérification distincte des droits.');
  } finally { db.close(); }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Impossible d’exporter les vecteurs.');
  process.exitCode = 1;
});
