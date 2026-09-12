import { getDb } from '../lib/database';
const db = getDb();
const { n } = db.prepare('SELECT count(*) AS n FROM stamps').get() as { n: number };
console.log(`${n} timbres disponibles. La collection existante est conservée.`);
db.close();
