/**
 * Personal/research cataloging only. Read docs/05-scraping.md before running at scale.
 * `--images` only records the URL of the illustration already published by the site and an
 * attribution string; it downloads no asset and grants no permission. Permissions and remaining questions are documented in DATA-LICENSE.md.
 * Exhaustive collection should await written clarification; the script grants no rights.
 * Only labeled factual metadata plus an optional image URL are exported; HTML caches stay local.
 */
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { catalogPage, PageCache } from './wikitimbres/fetch';
import { readListing, visitNotice } from './wikitimbres/crawl';
import { parseStamp } from './wikitimbres/parse';
import { ORIGIN, RequestGate, SitePolicy } from './wikitimbres/policy';
import { CatalogStore, lockRun } from './wikitimbres/store';
import { DiscoveryPlan } from './wikitimbres/discovery-plan';

const HELP = [
  'Usage :',
  '  npm run scrape:wikitimbres -- --start 1 --end 3 [--limit 3] [--images] [--force]',
  '  npm run scrape:wikitimbres -- --all --limit 20 [--listings 3] [--images]',
  '  npm run scrape:wikitimbres -- --all --limit 5 --dry-run',
  '  npm run scrape:wikitimbres -- --all --retry-rejets --limit 20',
  '  npm run scrape:wikitimbres -- --backfill-images --limit 20',
  '',
  'Prudence : ne pas lancer --all avant confirmation écrite sur la collecte exhaustive.',
  'Voir DATA-LICENSE.md : permissions non commerciales, exception HD PNG, droits tiers.',
  '',
  'Modes :',
  '  (par défaut)        plage d’identifiants, 50 au maximum, pour un essai borné.',
  '  --all               découverte reprenable depuis les listings publics du site',
  '                      (index des années, puis pages d’année et leur pagination).',
  '                      Aucune plage arbitraire : seules les notices réellement liées',
  '                      sont visitées. Incompatible avec --start/--end et avec --force.',
  '  --backfill-images   complète les illustrations des notices déjà exportées, en',
  '                      réutilisant le cache local ; implique --images, sans --force.',
  '  --dry-run           n’effectue aucune requête : affiche le plan et la couverture.',
  '',
  'Options :',
  '  --limit N           budget de notices examinées pour cette exécution.',
  '                      Obligatoire avec --all et --backfill-images, de 1 à 20000.',
  '                      Mode plage : 1 à 50 (50 par défaut).',
  '  --listings N        budget de pages de listing par exécution avec --all (défaut 5, max 500).',
  '  --images            extrait aussi l’adresse de l’illustration principale et son crédit.',
  '                      Sans cette option, image_url et image_credit restent vides.',
  '  --retry-rejets      avec --all seulement : remet en attente au plus --limit notices',
  '                      déjà notées « rejetée » ou « absente », puis les revisite.',
  '                      Les notices déjà exportées ne sont pas rouvertes et les listings',
  '                      déjà lus ne sont pas relus : ce n’est pas un rafraîchissement global.',
  '  --force             mode plage (--start/--end) uniquement : renouvelle les réponses en',
  '                      cache et retraite les identifiants déjà exportés de la plage.',
  '                      Refusé avec --all et --backfill-images.',
  '',
  'Réseau : délai WIKITIMBRES_DELAY_MS, minimum 3000 ms, une requête à la fois.',
  'WIKITIMBRES_OFFLINE=1 interdit toute requête et n’utilise que le cache local.',
  'Chemins : WIKITIMBRES_CACHE_DIR (défaut data/cache/wikitimbres), WIKITIMBRES_OUTPUT',
  '(défaut data/import/wikitimbres.csv). Reprise : discovery.json et manifest.json du cache.',
].join('\n');

const integer = (text: string) => /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : NaN;

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    start: { type: 'string' }, end: { type: 'string' },
    limit: { type: 'string' }, listings: { type: 'string' },
    force: { type: 'boolean', default: false }, images: { type: 'boolean', default: false },
    all: { type: 'boolean', default: false }, 'dry-run': { type: 'boolean', default: false },
    'retry-rejets': { type: 'boolean', default: false },
    'backfill-images': { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  } });
  if (values.help) { console.log(HELP); return; }

  const backfill = values['backfill-images'];
  const discover = values.all || backfill;
  const images = values.images || backfill;
  const dryRun = values['dry-run'];
  const retryRejected = values['retry-rejets'];
  if (discover && (values.start !== undefined || values.end !== undefined)) {
    throw new Error('--all et --backfill-images ne se combinent pas avec --start/--end : choisir un seul mode.');
  }
  if (values.all && backfill) throw new Error('--all et --backfill-images ne se lancent pas ensemble.');
  if (backfill && values.force) throw new Error('--backfill-images travaille sans --force, pour ne pas redemander toutes les pages.');
  // --force only means something for an explicit id range. With --all it would suggest a global
  // refresh of the discovery, which does not exist: the plan is not re-read and exported notices
  // are not revisited. Refuse it instead of promising a behaviour the code does not implement.
  if (values.all && values.force) {
    throw new Error('--all refuse --force : il n’existe aucun rafraîchissement global de la découverte. ' +
      'Utiliser --all --retry-rejets --limit N pour reprendre les notices rejetées ou absentes, ' +
      '--backfill-images pour compléter les illustrations, ou le mode plage --start/--end avec --force.');
  }
  if (retryRejected && !values.all) throw new Error('--retry-rejets ne fonctionne qu’avec --all.');

  let limit: number;
  if (discover) {
    if (values.limit === undefined) throw new Error('Limite obligatoire : préciser --limit (1 à 20000) pour borner cette exécution.');
    limit = integer(values.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20_000) throw new Error('Limite invalide : entier de 1 à 20000.');
  } else {
    limit = values.limit === undefined ? 50 : integer(values.limit);
  }
  let listingBudget = values.listings === undefined ? 5 : integer(values.listings);
  if (!Number.isSafeInteger(listingBudget) || listingBudget < 1 || listingBudget > 500) {
    throw new Error('Budget de listings invalide : entier de 1 à 500.');
  }

  const directory = process.env.WIKITIMBRES_CACHE_DIR || join(process.cwd(), 'data/cache/wikitimbres');
  const output = process.env.WIKITIMBRES_OUTPUT || join(process.cwd(), 'data/import/wikitimbres.csv');
  const release = await lockRun(directory);
  try {
    const gate = new RequestGate();
    const cache = new PageCache(directory, gate, values.force);
    const store = new CatalogStore(join(directory, 'manifest.json'), output);
    await store.load();
    if (images) console.log('Illustrations : adresses extraites avec un crédit indiquant que les droits restent réservés. Aucun fichier image n’est téléchargé, et cette option ne vaut pas autorisation : vérifier les conditions du site avant tout usage ou publication.');
    else console.log('Illustrations : option --images absente, image_url et image_credit restent vides.');

    if (!discover) {
      const start = values.start === undefined ? 1 : integer(values.start);
      const end = values.end === undefined ? start + 2 : integer(values.end);
      if (![start, end, limit].every(Number.isSafeInteger) || start < 1 || end < start || end - start >= 50 || limit < 1 || limit > 50) {
        throw new Error('Plage invalide : entiers positifs, début ≤ fin, maximum 50 identifiants et limite de 1 à 50.');
      }
      if (dryRun) {
        console.log(`Simulation : identifiants ${start} à ${Math.min(end, start + limit - 1)}, aucune requête effectuée.`);
        return;
      }
      const policy = await SitePolicy.load(url => cache.load(url, true), gate);
      let saved = 0;
      for (let id = start; id <= end && id - start < limit; id++) {
        console.log(`Notice ${id} (${id - start + 1}/${Math.min(end - start + 1, limit)})`);
        if (store.has(id) && !values.force) { console.log('Déjà exportée : ignorée.'); continue; }
        const response = await catalogPage(`${ORIGIN}/timbres/${id}`, policy, cache);
        if (!response) continue;
        const row = parseStamp(response.body, id, response.url, { images });
        if (!row) { console.log('Ignorée : métadonnées obligatoires absentes ou format HTML non reconnu.'); continue; }
        await store.save(id, row);
        saved++;
      }
      console.log(`Terminé : ${saved} notice(s) enregistrée(s). CSV : ${output}`);
      return;
    }

    const plan = new DiscoveryPlan(join(directory, 'discovery.json'));
    await plan.load();
    // The year listing is the site's own public entry point (see /plan-du-site).
    const seedYear = new Date().getUTCFullYear();
    const seed = `${ORIGIN}/timbres/annee/${seedYear}/${seedYear}`;
    // A backfill pass only revisits notices already exported without an illustration: it
    // reads no listing and never spends its budget on notices discovered by an earlier --all.
    let targets: number[] = [];
    if (backfill) {
      targets = await store.reopenWithoutImage(plan, limit);
      console.log(`Complément d’illustrations : ${targets.length} notice(s) à revoir depuis le cache local ; aucun listing n’est lu.`);
      console.log(`Notices à compléter : ${targets.length ? targets.join(', ') : 'aucune'}.`);
      listingBudget = 0;
    } else if (!plan.nextListing() && !plan.pendingNotices().length) {
      const added = await plan.addListings([seed]);
      if (added) console.log(`Point de départ ajouté au plan : ${seed}`);
    }
    // Bounded, explicit retry: only notices already recorded as rejected or missing come back,
    // at most --limit of them. Exported notices stay exported and read listings stay read.
    if (retryRejected) {
      const reopened = await plan.reopenRejected(limit);
      console.log(`Reprise demandée : ${reopened.length} notice(s) rejetée(s) ou absente(s) remise(s) en attente` +
        `${reopened.length ? ` (${reopened.slice(0, 10).join(', ')}${reopened.length > 10 ? '…' : ''})` : ''}.`);
      console.log('Les notices déjà exportées ne sont pas rouvertes et les listings déjà lus ne sont pas relus.');
    }

    const report = () => {
      const coverage = plan.coverage();
      console.log(`Couverture : ${coverage.noticesExported} notice(s) exportée(s), ${coverage.noticesRejected} rejetée(s), ` +
        `${coverage.noticesMissing} absente(s), ${coverage.noticesPending} en attente ; ` +
        `${coverage.listingsDone} listing(s) traité(s), ${coverage.listingsPending} en attente.`);
      if (coverage.announcedTotal !== null) {
        console.log(`Totaux annoncés par les listings déjà lus : ${coverage.announcedTotal} timbre(s) ; ` +
          `${coverage.noticesDiscovered} notice(s) découverte(s) à ce stade.`);
      }
      console.log(coverage.complete
        ? 'État : plan épuisé pour les listings déjà connus. Ce n’est « complet » que pour ces listings, pas une garantie d’exhaustivité du site.'
        : 'État : interrompu par la limite ou une erreur ; relancer la même commande reprend là où elle s’est arrêtée.');
      return coverage;
    };

    if (dryRun) {
      console.log('Simulation : aucune requête réseau, ni notice, ni listing, ni robots.txt.');
      const nextListing = backfill ? undefined : plan.nextListing();
      console.log(nextListing ? `Prochain listing : ${nextListing}` : 'Aucun listing en attente.');
      const pending = backfill ? targets : plan.pendingNotices();
      console.log(`Notices en attente : ${pending.length}${pending.length ? ` (prochaines : ${pending.slice(0, 5).join(', ')})` : ''}.`);
      console.log(`Budgets prévus : ${listingBudget} listing(s) et ${limit} notice(s) par exécution.`);
      report();
      return;
    }

    const policy = await SitePolicy.load(url => cache.load(url, true), gate);
    let visitedListings = 0, examined = 0, saved = 0, interrupted = false;
    while (visitedListings < listingBudget) {
      const url = plan.nextListing();
      if (!url) break;
      visitedListings++;
      console.log(`Listing ${visitedListings}/${listingBudget} : ${url}`);
      // One atomic checkpoint per listing: ids, announced total, pagination and years land
      // together, so an interruption here never loses the links the page published.
      const outcome = await readListing(url, plan, target => catalogPage(target, policy, cache));
      console.log(`  ${outcome.ids} notice(s) liée(s), ${outcome.newNotices} nouvelle(s)` +
        `${outcome.announced === null ? '' : `, total annoncé ${outcome.announced}`}` +
        `${outcome.siteTotal === null ? '' : ` ; le site annonce ${outcome.siteTotal} timbre(s) au total`}.`);
      if (outcome.addedListings) console.log(`  ${outcome.addedListings} listing(s) (pagination et années) ajoutés au plan.`);
    }
    if (!backfill && plan.nextListing()) {
      interrupted = true;
      console.log(`Budget de listings atteint : ${plan.coverage().listingsPending} listing(s) restent à lire.`);
    }

    for (const id of backfill ? targets : plan.pendingNotices()) {
      if (examined >= limit) { interrupted = true; break; }
      examined++;
      console.log(`Notice ${id} (${examined}/${limit})`);
      // The store is the authority on what was already exported: a notice known to the manifest
      // is not re-parsed without --force, so a run without --images cannot blank an illustration.
      // A backfill target is an explicit revisit, so it is read (from the cache) all the same.
      const outcome = await visitNotice(id, plan, store, target => catalogPage(target, policy, cache),
        { images, force: values.force, revisit: backfill });
      if (outcome.saved) saved++;
    }

    console.log(`${saved} notice(s) enregistrée(s) sur ${examined} examinée(s) pendant cette exécution. CSV : ${output}`);
    if (interrupted) console.log('Exécution interrompue par les budgets : relancer la même commande pour continuer.');
    report();
  } finally { await release(); }
}

main().catch(error => {
  console.error(`Collecte arrêtée : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
  process.exitCode = 1;
});
