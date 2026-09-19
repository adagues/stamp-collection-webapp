/**
 * Bounded smoke check of the path database -> /api/embeddings -> /api/image/<id>.
 *
 * Safety rules enforced here, because this script talks to a real database and can talk to a
 * real website:
 *   - SMOKE_DB is MANDATORY and must be an absolute path outside the repository: the personal
 *     vault is never opened, and a missing variable can no longer create a file named
 *     « undefined » or silently fall back to data/vault.sqlite.
 *   - No network request by default. The probe that actually downloads an illustration from
 *     www.wikitimbres.fr only runs with SMOKE_NETWORK=1, which also implies an explicit
 *     IMAGE_HOSTS: the default configuration must keep answering 403.
 *   - Every step is asserted. A failed expectation exits with a non-zero code instead of
 *     printing a line nobody reads.
 */
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

class SmokeError extends Error {}

// Anchored on this file, not on the current directory: the guard must hold wherever the script
// is invoked from.
const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const failures: string[] = [];
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) console.log(`  ok   ${label}${detail ? ` (${detail})` : ''}`);
  else { failures.push(label); console.log(`  ÉCHEC ${label}${detail ? ` (${detail})` : ''}`); }
}

function requestedDatabase(): string {
  const requested = process.env.SMOKE_DB;
  if (!requested || !requested.trim()) {
    throw new SmokeError('SMOKE_DB est obligatoire : indiquez le chemin absolu d’une base de test jetable, ' +
      'par exemple SMOKE_DB=/tmp/essai/test.sqlite. Aucune base par défaut n’est ouverte.');
  }
  if (!isAbsolute(requested) || /(^|[\\/])undefined$/.test(requested)) {
    throw new SmokeError(`SMOKE_DB doit être un chemin absolu vers une base de test : « ${requested} » refusé.`);
  }
  const target = resolve(requested);
  const data = resolve(join(REPOSITORY, 'data'));
  if (target === data || target.startsWith(data + '/')) {
    throw new SmokeError(`SMOKE_DB refuse le dossier data/ du dépôt (« ${target} ») : ` +
      'utilisez une base jetable hors du dépôt pour ne jamais toucher la base personnelle.');
  }
  return target;
}

async function main(): Promise<void> {
  const database = requestedDatabase();
  const network = process.env.SMOKE_NETWORK === '1';
  process.env.TURSO_DATABASE_URL = `file:${database}`;
  // The default host allow-list must stay untouched for the refusal check below.
  delete process.env.IMAGE_HOSTS;
  console.log(`Base de test : ${database}`);
  console.log(network
    ? 'Réseau : SMOKE_NETWORK=1, une seule requête d’image sera effectuée vers www.wikitimbres.fr.'
    : 'Réseau : aucune requête réseau (SMOKE_NETWORK non demandé) ; seul le refus par défaut est vérifié.');

  const { getDb, importStamps } = await import('../lib/database');
  const { GET: embeddings } = await import('../app/api/embeddings/route');
  const { GET: image } = await import('../app/api/image/[id]/route');

  const db = await getDb();
  try {
    // Deterministic rows, so the assertions do not depend on what a previous import left behind.
    const base = {
      country: 'France', year: 1900, series: 'Essai', denomination: '10 c',
      description: 'Notice de vérification.', image_credit: '', source_url: 'https://www.wikitimbres.fr/timbres/1',
      catalog_number: null, estimated_value: null, currency: 'EUR',
    };
    const hosted = 'smoke-wikitimbres-avec-image';
    const bare = 'smoke-wikitimbres-sans-image';
    await importStamps(db, [
      { ...base, id: hosted, title: 'Illustration hébergée par le site',
        image_url: 'https://www.wikitimbres.fr/public/stamps/800/POSTE-1850-4.jpg' },
      { ...base, id: bare, title: 'Notice sans illustration', image_url: '' },
    ]);

    const result = await db.execute("SELECT id, image_url FROM stamps WHERE id LIKE 'smoke-wikitimbres-%' ORDER BY id");
    const rows = result.rows.map(row => ({ id: String(row.id), image_url: String(row.image_url) }));
    console.log(`Notices de vérification en base : ${rows.length}`);
    check('les deux notices de vérification sont présentes', rows.length === 2, `${rows.length}`);
    if (rows.length !== 2) throw new SmokeError('Base de test inutilisable : notices de vérification absentes.');

    console.log('Comptage de la préparation des vecteurs :');
    for (const kind of ['visual', 'semantic'] as const) {
      const response = await embeddings(new Request(`http://localhost/api/embeddings?kind=${kind}`));
      const data = await response.json() as { ready: string[]; pending: { id: string }[]; unavailable: string[] };
      const pending = data.pending.map(row => row.id);
      console.log(`  ${kind} -> prêts ${data.ready.length}, en attente ${pending.length}, non indexables ${data.unavailable.length}`);
      check(`${kind} : la notice illustrée est en attente`, pending.includes(hosted));
      if (kind === 'visual') {
        check('visual : la notice sans illustration n’est pas comptée en attente', !pending.includes(bare));
        check('visual : la notice sans illustration est signalée non indexable', data.unavailable.includes(bare));
      } else {
        check('semantic : la notice sans illustration reste en attente', pending.includes(bare));
        check('semantic : aucune notice non indexable', data.unavailable.length === 0, `${data.unavailable.length}`);
      }
    }

    console.log('Relais /api/image/<id> :');
    const refused = await image(new Request('http://localhost/api/image/x'), { params: { id: hosted } });
    const refusedBody = await refused.json() as { error?: string };
    console.log(`  proxy sans IMAGE_HOSTS -> ${refused.status} ${refusedBody.error ?? ''}`);
    check('hôte non autorisé refusé par défaut', refused.status === 403, `${refused.status}`);

    const unknown = await image(new Request('http://localhost/api/image/x'), { params: { id: 'notice-inconnue' } });
    console.log(`  notice inconnue -> ${unknown.status}`);
    check('notice inconnue -> 404', unknown.status === 404, `${unknown.status}`);

    const withoutImage = await image(new Request('http://localhost/api/image/x'), { params: { id: bare } });
    console.log(`  notice sans illustration -> ${withoutImage.status}`);
    check('notice sans illustration -> 404', withoutImage.status === 404, `${withoutImage.status}`);

    if (network) {
      // Opt-in only: this is the single request that leaves the machine. IMAGE_HOSTS is widened
      // here on purpose and loudly, never as a side effect of running the script.
      process.env.IMAGE_HOSTS = 'www.wikitimbres.fr';
      const { GET: allowed } = await import(`../app/api/image/[id]/route?allow=${Date.now()}`);
      const served = await allowed(new Request('http://localhost/api/image/x'), { params: { id: hosted } });
      const type = served.headers.get('content-type') ?? '';
      console.log(`  proxy avec IMAGE_HOSTS -> ${served.status} ${type}`);
      check('hôte autorisé volontairement -> 200 et type image', served.status === 200 && type.startsWith('image/'),
        `${served.status} ${type}`);
      delete process.env.IMAGE_HOSTS;
    } else {
      console.log('  proxy avec IMAGE_HOSTS -> non exercé (SMOKE_NETWORK=1 requis, une vraie image serait téléchargée).');
    }
  } finally { db.close(); }

  if (failures.length) throw new SmokeError(`${failures.length} vérification(s) en échec : ${failures.join(' ; ')}.`);
  console.log(`Vérifications réussies : ${network ? 'relais réel inclus' : 'sans aucune requête réseau'}.`);
}

main().catch(error => {
  console.error(`Vérification arrêtée : ${error instanceof SmokeError ? error.message
    : error instanceof Error ? error.message : 'erreur inconnue'}`);
  process.exitCode = 1;
});
