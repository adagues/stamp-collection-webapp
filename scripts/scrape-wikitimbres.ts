/**
 * Personal/research cataloging only. Check the site's terms before running at scale.
 * Image assets are NOT scraped or redistributed for copyright reasons.
 * Only labeled factual metadata is exported; HTML caches stay local and untracked.
 */
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { catalogPage, PageCache } from './wikitimbres/fetch';
import { parseStamp } from './wikitimbres/parse';
import { ORIGIN, RequestGate, SitePolicy } from './wikitimbres/policy';
import { CatalogStore, lockRun } from './wikitimbres/store';

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    start: { type: 'string', default: '1' }, end: { type: 'string' },
    limit: { type: 'string', default: '50' }, force: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  } });
  if (values.help) {
    console.log('Usage : npm run scrape:wikitimbres -- --start 1 --end 3 [--limit 3] [--force]');
    console.log('Maximum : 50 identifiants par plage. Délai : WIKITIMBRES_DELAY_MS, minimum 3000 ms.');
    return;
  }
  const integer = (text: string) => /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : NaN;
  const start = integer(values.start), end = values.end === undefined ? start + 2 : integer(values.end);
  const limit = integer(values.limit);
  if (![start, end, limit].every(Number.isSafeInteger) || start < 1 || end < start || end - start >= 50 || limit < 1 || limit > 50) {
    throw new Error('Plage invalide : entiers positifs, début ≤ fin, maximum 50 identifiants et limite de 1 à 50.');
  }
  const directory = join(process.cwd(), 'data/cache/wikitimbres');
  const output = join(process.cwd(), 'data/import/wikitimbres.csv');
  const gate = new RequestGate();
  const release = await lockRun(directory);
  try {
    const cache = new PageCache(directory, gate, values.force);
    // Always refresh robots.txt; --force never bypasses access rules or rate limits.
    const policy = await SitePolicy.load(url => cache.load(url, true), gate);
    const store = new CatalogStore(join(directory, 'manifest.json'), output);
    await store.load();
    let saved = 0;
    for (let id = start; id <= end && id - start < limit; id++) {
      console.log(`Notice ${id} (${id - start + 1}/${Math.min(end - start + 1, limit)})`);
      if (store.has(id) && !values.force) { console.log('Déjà exportée : ignorée.'); continue; }
      const response = await catalogPage(`${ORIGIN}/timbres/${id}`, policy, cache);
      if (!response) continue;
      const row = parseStamp(response.body, id, response.url);
      if (!row) { console.log('Ignorée : métadonnées obligatoires absentes ou format HTML non reconnu.'); continue; }
      await store.save(id, row);
      saved++;
    }
    console.log(`Terminé : ${saved} notice(s) enregistrée(s). CSV : data/import/wikitimbres.csv`);
  } finally { await release(); }
}

main().catch(error => {
  console.error(`Collecte arrêtée : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
  process.exitCode = 1;
});
