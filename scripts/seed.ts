import { getDb } from '../lib/database';

async function main() {
  const db = await getDb();
  try {
    const result = await db.execute('SELECT count(*) AS n FROM stamps');
    console.log(`${Number(result.rows[0]?.n)} timbres disponibles. La collection existante est conservée.`);
  } finally { db.close(); }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Impossible d’initialiser la base.');
  process.exitCode = 1;
});
