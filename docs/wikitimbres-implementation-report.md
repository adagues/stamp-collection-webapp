# Rapport d’implémentation — chantier Wikitimbres

> **Rapport historique du chantier, antérieur à l'assainissement.** Les observations et résultats ci-dessous décrivent cet état antérieur, pas la distribution actuelle. Depuis l'assainissement, `wikitimbres-real.html` a été retiré de l'arbre courant et remplacé par `tests/fixtures/wikitimbres-synthetic.html` ; les fixtures annuelles contiennent désormais des identifiants, compteurs et noms d'illustrations inventés, et non des relevés du site. Le catalogue livré est fictif et les embeddings distribués sont vides. Voir [l'état courant et ses limites](06-assainissement.md) et [DATA-LICENSE.md](../DATA-LICENSE.md). L'historique Git n'a pas été réécrit.

Branche : `feature/wikitimbres-catalog-images` (aucun commit, aucun push, aucun déploiement).
Rédigé le 13 septembre 2026. Toutes les commandes ci-dessous ont été réellement exécutées ;
les sorties citées sont des extraits de logs produits pendant cette session.

## 1. Ce qui a été livré

| Sujet | État |
| --- | --- |
| Découverte `--all` depuis les listings publics réels | fait, testé hors ligne + essai réel borné |
| Reprise / checkpoints / dédup persistés | fait (`discovery.json`), testé, reprise réelle vérifiée |
| Checkpoint atomique par listing (ids + total + liens + « traité ») | fait, testé (revue) |
| Validation stricte du plan à la relecture | fait, testé (revue) |
| `--all --retry-rejets` borné, `--all --force` refusé | fait, testé (revue) |
| Protection de `image_url` contre l’écrasement par du vide | fait, testé (revue) |
| Runner de vérification image sécurisé (base explicite, réseau opt-in, assertions) | fait, testé (revue) |
| Compteur de couverture honnête (terminé / interrompu / rejets) | fait, testé |
| Images en option explicite `--images` | fait, testé, extraction validée sur page réelle |
| `--backfill-images` sans `--force` massif | fait, testé, essai réel depuis le cache |
| Correction du comptage d’indexation visuelle | fait, testé, vérifié en base temporaire |
| Garde-fous réseau / robots / anti-SSRF | conservés et étendus, testés |
| Vérification CGU / mentions légales / robots | constat archivé, **analyse juridique déléguée, non tranchée ici** |

## 1 bis. Correctifs de la revue (2e passe, TDD)

Sept points bloquants relevés à la lecture du code ont été corrigés en TDD (test rouge
observé, puis implémentation minimale). Aucune nouvelle fonctionnalité de collecte.

| # | Problème constaté à la revue | Correctif | Preuve |
| --- | --- | --- | --- |
| 1 | `--all` marquait un listing « traité » et persistait **avant** d’enregistrer pagination et années : un crash à cet endroit perdait les liens tout en annonçant un plan complet. | `DiscoveryPlan.recordListing()` écrit ids + total + liens + « traité » en **une seule** écriture atomique ; l’état en mémoire n’est adopté qu’après succès du write. Étape extraite dans `scripts/wikitimbres/crawl.ts` (`readListing`). | `tests/wikitimbres-plan.test.ts` (1 écriture comptée ; échec d’écriture ⇒ rien de persisté), `tests/wikitimbres-crawl.test.ts` (157 années + 8 notices survivent à une interruption simulée). |
| 2 | L’aide promettait que `--force` retraite les notices déjà exportées, mais `--all` ne bouclait que sur `pendingNotices()` : aucun `exported`/`rejected`/`missing` n’était rouvert. Flag trompeur. | `--all --force` est **refusé** avec un message qui nomme les reprises réelles. Nouvelle option bornée `--all --retry-rejets` : rouvre au plus `--limit` notices `rejected`/`missing`, jamais les `exported`, sans relire de listing. Aide et docs réécrites. | `tests/wikitimbres-cli.test.ts` (refus, aide, réouverture bornée, refus hors `--all`), `tests/wikitimbres-plan.test.ts` (`reopenRejected`). |
| 3 | `DiscoveryPlan.load` acceptait des tableaux (`JSON.stringify` perd alors les clés nommées ⇒ plan effacé au save suivant), ne validait pas les clés de `listings`, et acceptait des ids `0`, `01` ou non sûrs. | Refus explicite des tableaux ; chaque clé de `listings` doit être exactement l’URL canonique ; ids `^[1-9]\d{0,15}$` et entiers sûrs ; clés de `announced` bornées à 1840-2100. `assertListingUrl` borne aussi l’année, pour ne jamais écrire un plan que `load()` refuserait. | `tests/wikitimbres-plan.test.ts` : 5 tests dédiés. |
| 4 | Première visite `--all` d’une notice déjà présente dans le manifeste (ancien mode plage) : re-parse sans `--images` ⇒ `image_url` existante écrasée par du vide. | `visitNotice()` ne ré-analyse pas une notice connue du manifeste : le plan est synchronisé depuis le manifeste, sans requête. Second filet dans `CatalogStore.save()` : une illustration connue n’est jamais remplacée par un champ vide (« vide » = non recherchée). | `tests/wikitimbres-crawl.test.ts` (aucun appel de chargement ; illustration préservée avec et sans `--force`). |
| 5 | `scripts/smoke-image-pipeline.mts` : commentaire « no network » **faux** (il téléchargeait une vraie image), `SMOKE_DB!` non validé (**a réellement créé un fichier `undefined` de 4,7 Mo à la racine pendant cette revue**, et sans la variable il aurait ouvert `data/vault.sqlite`), `rows[0]` sans garde, `IMAGE_HOSTS` modifié implicitement, aucune assertion. | Runner réécrit : `SMOKE_DB` obligatoire, absolu, refusé s’il vise `data/` du dépôt ou finit par `undefined` ; **aucune requête réseau par défaut**, la requête réelle passe par `SMOKE_NETWORK=1` avec élargissement explicite de `IMAGE_HOSTS` ; lignes de contrôle déterministes insérées par le script ; chaque étape assertée, sortie non nulle si une assertion tombe. Fichier `undefined` parasite supprimé (non suivi par git). | `tests/smoke-image-pipeline.test.ts` (5 tests) + exécution réelle : 10 vérifications « ok », exit 0, sans réseau. |
| 6 | `git diff --check` signalait « new blank line at EOF » sur `docs/05-scraping.md`. | Ligne blanche finale supprimée. | `git diff --check` ⇒ exit 0. |
| 7 | La doc affirmait que `--all` « part de l’index des années du plan du site », alors que le code **construit** l’URL de l’année courante sans lire le plan du site. | Section « Amorce honnête » : l’amorce est construite, pas suivie ; la forme d’URL a été vérifiée, le lien exact ne l’est pas ; conséquence assumée si le site change de schéma. Les liens suivis ensuite viennent tous du site. | `docs/05-scraping.md`, section « Découverte `--all` et illustrations ». |

## 2. Sources réellement consultées (constat du 13 septembre 2026, ~06:17–06:44 UTC)

Une seule requête à la fois, 4 s entre les requêtes, agent `StampVaultBot/1.0`.

| URL | Constat |
| --- | --- |
| `https://www.wikitimbres.fr/robots.txt` | HTTP 200, 60 octets. Seuls `/administration` et `/sphider` sont interdits (`User-Agent: *`). Aucun `Crawl-delay`, aucun `Sitemap`. |
| `https://www.wikitimbres.fr/sitemap.xml` | HTTP 200 mais **3 octets** (BOM seul) : inexploitable. La découverte ne peut donc pas s’appuyer sur un sitemap. |
| `https://www.wikitimbres.fr/plan-du-site` | HTTP 200. Point d’entrée public listant « Parcourir → Par année » (`/timbres/annee/<année>`). C’est la source de la découverte. |
| `https://www.wikitimbres.fr/mentions-legales` | HTTP 200. Contient une section « Conditions d’utilisation » (extraits ci-dessous). |
| `https://www.wikitimbres.fr/timbres/annee/1849` | HTTP 200. 8 notices, en-tête « Année : 1849 (8 Timbres) », pas de pagination. |
| `https://www.wikitimbres.fr/timbres/annee/2020` | HTTP 200. 48 notices par page, en-tête « (399 Timbres) », pagination `/timbres/annee/2020/2020/<offset>`. |
| `https://www.wikitimbres.fr/timbres/annee/2026/2026` (+ `/48`) | HTTP 200. Essai réel de découverte. |
| `/timbres/14768`, `14783`, `14784`, `14841`, `14842`, `14843` | HTTP 200. Notices utilisées pour l’essai réel borné (6 notices au total). |

Le bandeau du site annonce **16444 timbres répertoriés** et l’index des années expose
**158 années** (1849 → 2026, avec des trous réels : 1851 par exemple est absent).

### Ce que disent les conditions d’utilisation (verbatim partiel, à faire relire)

> « Vous êtes libre de : […] Réutiliser nos articles et les images des timbres à des fins
> non commerciales (1) » — « Conditions à respecter : […] D’ajouter " www.wikitimbres.fr "
> dans les mentions légales du document » — « (1) dans le cas contraire, vous devrez vous
> acquitter, en tant que diffuseur d’images, des droits d’auteurs gérés par l’ADAGP ».
> Pied de page : « Tous droits réservés © 2026 WikiTimbres ».

**Cette formulation n’est pas traitée ici comme une autorisation.** Elle coexiste avec un
« tous droits réservés » et renvoie aux droits d’auteur gérés par l’ADAGP. Une revue
juridique distincte est en cours (usage personnel vs dépôt public/privé) ; le code
n’affirme aucune licence et l’option `--images` reste désactivée par défaut.

### Preuves archivées

Archives complètes **hors dépôt** (elles contiennent du contenu tiers) :
`/home/ubuntu/wikitimbres-evidence/` — `robots.txt`, `sitemap.xml`, `plan-du-site.html`,
`mentions-legales.html`, `annee-1849.html`, `annee-2020.html`, les en-têtes HTTP `.headers`
de chaque réponse, et `constat.txt` (horodatage UTC du constat).

Empreintes SHA-256 des pages archivées :

```
9d9e10566b9a3db250e9ae5fff3961cd1d64272e7ad21253c78aa3a84cd7340e  annee-1849.html
6a9a3cfd0bbeb1548b08f2a5de4588020643658921d6c3d580fb496b125866a4  annee-2020.html
352cad9991847bea1b73dbd9e36a768d93664cbf824fc5da457b936191b3a778  mentions-legales.html
4472247ce662928ce96ec8b99c688e7c3969369ca451935f02a43af8a839da1a  plan-du-site.html
3fb95704dcd88701b6026d8e9775fd32e9fd1f6ea5a60e74aa054273013e5889  robots.txt
f1945cd6c19e56b3c1c78943ef5ec18116907a4ca1efc40a57d48ab1db7adfc5  sitemap.xml
```

## 3. Architecture retenue

La découverte suit **les liens réellement publiés**, jamais une plage d’identifiants
devinée. Le sitemap étant vide, l’entrée est l’index des années du plan du site :

```
/timbres/annee/<année>/<année>          (listing, 48 notices par page)
   ├── liens /timbres/<id>/<slug>       -> notices à visiter
   ├── liens de pagination publiés      -> /timbres/annee/<a>/<a>/<offset>
   └── index des autres années          -> nouveaux listings
```

Deux fichiers de reprise, écrits atomiquement dans le dossier de cache :

- `manifest.json` (existant) : lignes CSV exportées, source de vérité du CSV.
- `discovery.json` (nouveau) : listings vus/à voir, notices connues avec leur état
  (`null` en attente, `exported`, `rejected`, `missing`), et le total annoncé par année.

Le total annoncé est indexé **par année** et non par page : le site répète
« (363 Timbres) » sur chaque page, ce qui gonflait le total (défaut détecté puis corrigé).

### Pourquoi « complet » n’est jamais affirmé

Le rapport final distingue explicitement :

```
Couverture : 3 notice(s) exportée(s), 0 rejetée(s), 0 absente(s), 45 en attente ;
             1 listing(s) traité(s), 160 en attente.
Totaux annoncés par les listings déjà lus : 363 timbre(s) ; 48 notice(s) découverte(s).
État : interrompu par la limite ou une erreur ; relancer la même commande reprend.
```

Quand le plan est épuisé, le message reste prudent : « Ce n’est “complet” que pour ces
listings, pas une garantie d’exhaustivité du site. »

## 4. Fichiers

### Nouveaux

| Fichier | Rôle |
| --- | --- |
| `scripts/wikitimbres/discover.ts` | Extraction des années, notices, pagination et totaux depuis le HTML des listings. |
| `scripts/wikitimbres/discovery-plan.ts` | Plan de découverte persistant et reprenable + rapport de couverture + contrôle des URL de listing. |
| `scripts/wikitimbres/crawl.ts` | Étapes de collecte testables sans réseau : `readListing` (un checkpoint atomique par listing) et `visitNotice` (visite d’une notice sans écraser une illustration connue). |
| `scripts/smoke-image-pipeline.mts` | Vérification bornée du parcours base → API embeddings → proxy d’image (base de test obligatoire, réseau opt-in, assertions). |
| `tests/wikitimbres-discover.test.ts` | 5 tests d’extraction sur fixtures issues des pages réelles. |
| `tests/wikitimbres-crawl.test.ts` | 9 tests : atomicité du checkpoint de listing, survie à une interruption, non-écrasement d’illustration, états `missing`/`rejected`. |
| `tests/wikitimbres-plan.test.ts` | 17 tests de reprise, dédup, canonisation, couverture, validation stricte, réouverture bornée des rejets. |
| `tests/wikitimbres-images.test.ts` | 6 tests d’extraction d’image, dont refus d’URL non conformes. |
| `tests/wikitimbres-cli.test.ts` | 11 tests de CLI (aide, refus, dry-run, ciblage du backfill, refus de `--all --force`, `--retry-rejets`). |
| `tests/wikitimbres-backfill.test.ts` | 5 tests de complément d’images et de garde-fou hors ligne. |
| `tests/smoke-image-pipeline.test.ts` | 5 tests du runner de vérification : base obligatoire, chemin non absolu ou « undefined » refusé sans créer de fichier, refus du dossier `data/`, absence de réseau, assertions. |
| `tests/embeddings-coverage.test.ts` | 3 tests du comptage d’indexation et du refus d’hôte au proxy. |
| `tests/embeddings-invalidation.test.ts` | 3 tests de régression : invalidation des vecteurs, collection préservée. |
| `tests/fixtures/wikitimbres-annee-1849.html` | Fixture **structurelle** (balisage/classes/URL, prose retirée). |
| `tests/fixtures/wikitimbres-annee-2020.html` | Fixture **structurelle** avec pagination réelle. |

### Modifiés

| Fichier | Changement |
| --- | --- |
| `scripts/scrape-wikitimbres.ts` | Modes `--all`, `--backfill-images`, `--dry-run`, options `--images`, `--listings`, `--retry-rejets`, budgets obligatoires, refus de `--all --force`, boucles déléguées à `crawl.ts`. |
| `scripts/wikitimbres/parse.ts` | Extraction optionnelle de l’image principale (`stampImageUrl`, `IMAGE_CREDIT`), rejet des numéros de catalogue factices. |
| `scripts/wikitimbres/store.ts` | `idsWithoutImage()`, `reopenWithoutImage()` pour le backfill ciblé ; `save()` ne remplace plus une illustration connue par un champ vide. |
| `scripts/wikitimbres/fetch.ts` | Mode `WIKITIMBRES_OFFLINE=1` : aucune requête, cache seul. |
| `app/api/embeddings/route.ts` | Notices sans illustration exclues du « pending » visuel, exposées comme `unavailable`. |
| `lib/models.ts` | `IndexProgress.unavailable` propagé à l’interface. |
| `components/search-workbench.tsx` | Total visuel distinct du total textuel, message explicite sur les notices non indexables. |

## 5. Sécurité et respect du site

- **Robots** : `robots.txt` re-téléchargé à chaque exécution, y compris avec `--force` et en
  mode découverte. Redirections de `robots.txt` refusées. Statut ≠ 200, contenu non textuel
  ou invalide ⇒ arrêt.
- **Chemins autorisés** : les notices restent sous `/timbre(s)/`, les listings sous
  `/timbres/annee/...` uniquement (`assertListingUrl`). Autre hôte, `user:pass@`, port,
  `?query`, `#fragment` ⇒ refus. `/administration` refusé même si un lien y menait.
- **URL de pagination suivies telles que publiées**, jamais reconstruites (un essai réel a
  montré qu’une URL fabriquée était fausse ; le correctif suit désormais le lien du site).
- **Images** : aucun fichier image n’est téléchargé par le scraper. Seule l’URL est
  enregistrée, et seulement si elle est HTTPS, sur `www.wikitimbres.fr`, sous
  `/public/stamps/<taille>/<fichier>.(jpg|jpeg|png|webp)`. Les logos, icônes et « visuels »
  contribués par les membres sont exclus par construction.
- **Proxy applicatif** : `app/api/image/[id]` n’autorise par défaut que
  `www.phil-ouest.com`. Une notice Wikitimbres renvoie **403** tant que l’hôte n’est pas
  ajouté volontairement à `IMAGE_HOSTS`. Pas d’open proxy, pas d’élargissement automatique.
- **Rythme** : 3 s minimum entre requêtes (défaut), une seule requête à la fois, aucun
  réessai automatique, arrêt sur 429/503.
- **Verrou** : `run.lock` empêche deux exécutions simultanées.

## 6. Tests

`npm test` — **99 tests, 17 fichiers, exit code 0** (vérifié sans pipe masquant le code).

```
Test Files  17 passed (17)
     Tests  99 passed (99)
TEST_EXIT=0
```

`npm run build` — **exit code 0**, 13 routes générées.

`git diff --check` — **exit code 0** (plus aucune ligne blanche en fin de fichier).

Méthode : TDD vertical. Chaque fonctionnalité a un test écrit d’abord, **exécuté en échec**,
puis l’implémentation minimale. Échecs RED effectivement observés, 1re passe : module
`discover` absent, module `discovery-plan` absent, `IMAGE_CREDIT` absent, `--all` inconnu du
CLI, `unavailable` absent de l’API, `parsePaginationUrls` absent, budget du backfill mal
ciblé, total annoncé doublé, numéro de catalogue factice conservé.

Échecs RED de la 2e passe (correctifs de revue), tous observés avant correction :
`recordListing is not a function`, plan invalide accepté (tableaux, clés de listing, ids `0`,
années hors bornes), `readListing`/`visitNotice` absents, `image_url` réellement écrasée par
du vide (`expected '' to be 'https://…POSTE-1850-4.jpg'`), `reopenRejected is not a
function`, `--all --force` accepté sans message, `--retry-rejets` inconnu du CLI, runner de
vérification ouvrant la base par défaut au lieu d’exiger `SMOKE_DB`.

Exception signalée honnêtement : les 3 tests de `tests/embeddings-invalidation.test.ts`
sont passés **du premier coup**. Ce sont des tests de **régression** documentant un
comportement déjà correct (`importStamps` invalide déjà les vecteurs), pas du TDD.

### Cas de sécurité et d’erreur couverts

- URL d’image en `http:`, autre hôte, port explicite, `user:pass@`, `javascript:`, logo ⇒
  image rejetée, métadonnées conservées.
- Listing sur un autre hôte, sur `/administration`, année incohérente ou hors bornes ⇒ refus.
- Plan corrompu (JSON invalide, sections en tableau, clé de listing non canonique, id `0`
  ou non sûr, année hors bornes) ⇒ arrêt explicite, jamais de reprise à zéro silencieuse.
- Interruption pendant l’enregistrement d’un listing ⇒ soit tout est écrit, soit rien : le
  listing n’est jamais « traité » sans ses liens.
- Notice déjà exportée revue sans `--images` ⇒ illustration conservée (deux garde-fous).
- `WIKITIMBRES_OFFLINE=1` ⇒ toute requête non présente en cache échoue sans appel réseau.
- Notice absente (404/410) ⇒ comptée `missing`, pas `rejected`.
- Proxy : hôte non autorisé ⇒ 403 ; notice inconnue ⇒ 404 ; notice sans image ⇒ 404.
- Runner de vérification : `SMOKE_DB` absent, relatif, se terminant par `undefined`, ou
  visant `data/` du dépôt ⇒ refus avant toute ouverture de base.

## 7. Essais réels bornés (logs disponibles)

Logs conservés dans `/tmp/smoke-wt/` (hors dépôt) : `smoke-1.log`, `smoke-live-1.log`,
`smoke-live-2.log`, `smoke-bf2-1.log`, `smoke-bf2-2.log`, `smoke-import.log`,
`smoke-pipeline.log`.

**Volume réel total de cette session : 6 notices + 4 listings + robots.txt.** Aucune
collecte massive.

### Découverte réelle (`--all --limit 3 --listings 2 --images`)

```
Listing 1/2 : https://www.wikitimbres.fr/timbres/annee/2026/2026
  48 notice(s) liée(s), 48 nouvelle(s), total annoncé 363 ; le site annonce 16444 timbre(s) au total.
  3 page(s) de pagination et 157 année(s) ajoutées au plan.
Listing 2/2 : https://www.wikitimbres.fr/timbres/annee/2026/2026/48
3 notice(s) enregistrée(s) sur 3 examinée(s). Exécution interrompue par les budgets.
```

Reprise vérifiée : une seconde exécution en `--dry-run` reprend à
`/timbres/annee/2026/2026/96` avec 93 notices en attente, sans redemander les 3 déjà faites.

### Backfill réel (`--backfill-images --limit 5`)

```
Complément d’illustrations : 3 notice(s) à revoir depuis le cache local ; aucun listing n’est lu.
Notices à compléter : 14841, 14842, 14843.
Téléchargement : /robots.txt
Notice 14841 (1/5)
Cache : /timbres/14841        <- réutilisation du cache, aucune nouvelle requête de notice
```

Résultat CSV : les 3 notices reçoivent leur `image_url` et leur crédit, sans `--force` et
sans re-télécharger les pages.

### Parcours base → API → proxy (base de test jetable, sans réseau)

Rejoué après durcissement du runner, le 13 septembre 2026 :
`SMOKE_DB=/tmp/smoke-wt-run/test.sqlite npx tsx scripts/smoke-image-pipeline.mts`

```
Base de test : /tmp/smoke-wt-run/test.sqlite
Réseau : aucune requête réseau (SMOKE_NETWORK non demandé) ; seul le refus par défaut est vérifié.
  visual   -> prêts 179, en attente 1, non indexables 1
  semantic -> prêts 179, en attente 2, non indexables 0
  proxy sans IMAGE_HOSTS -> 403 Hébergement de l’illustration non autorisé.
  notice inconnue -> 404
  notice sans illustration -> 404
  proxy avec IMAGE_HOSTS -> non exercé (SMOKE_NETWORK=1 requis, une vraie image serait téléchargée).
Vérifications réussies : sans aucune requête réseau.   (exit 0, 10 contrôles « ok »)
```

La ligne `visual en attente 1 / non indexables 1` contre `semantic en attente 2` prouve la
correction du comptage : la notice sans illustration n’est plus une tâche impossible.

**Non rejoué dans cette passe :** le relais servant réellement une image
(`proxy avec IMAGE_HOSTS -> 200 image/jpeg`, obtenu lors de la 1re passe). Il est désormais
derrière `SMOKE_NETWORK=1`, volontairement non exécuté ici pour ne faire aucune requête.

### Ce qui n’est PAS validé

- **Le calcul d’empreintes MobileNet et la recherche par ressemblance sur des images
  Wikitimbres n’ont pas été exercés.** Ils tournent dans le navigateur ; cette session est
  sans navigateur. Ce qui est prouvé, c’est que le décompte à préparer est correct et que le
  relais refuse par défaut. La reconnaissance elle-même reste à valider manuellement dans
  l’interface. **Le parcours n’est donc pas validé de bout en bout.**
- Le relais servant réellement une image n’a **pas** été rejoué dans cette 2e passe (il est
  désormais derrière `SMOKE_NETWORK=1`).
- Aucun `npm run dev` ni parcours d’interface cliqué.
- Aucune vérification que les 16444 notices sont atteignables : seuls 4 listings ont été lus
  (1re passe), aucun listing n’a été lu pendant cette 2e passe.
- Aucun essai réel de `--all --retry-rejets` sur le site : la fonction est vérifiée hors
  ligne (plan de test + `--dry-run`), pas sur des notices réellement rejetées en production.

## 8. Commandes utilisables

```bash
# Aide complète
npm run scrape:wikitimbres -- --help

# Simulation, aucune requête réseau
npm run scrape:wikitimbres -- --all --limit 5 --dry-run

# Essai borné réel (métadonnées seules)
npm run scrape:wikitimbres -- --all --limit 10 --listings 2

# Idem avec les adresses d’illustration (option explicite)
npm run scrape:wikitimbres -- --all --limit 10 --listings 2 --images

# Plage d’identifiants, comme avant
npm run scrape:wikitimbres -- --start 1 --end 3 --limit 3

# Compléter les illustrations des notices déjà exportées, depuis le cache
npm run scrape:wikitimbres -- --backfill-images --limit 20

# Reprendre les notices rejetées ou absentes (borné par --limit, sans relire de listing)
npm run scrape:wikitimbres -- --all --retry-rejets --limit 20

# Ralentir davantage
WIKITIMBRES_DELAY_MS=6000 npm run scrape:wikitimbres -- --all --limit 10

# Travailler sans réseau (cache seul)
WIKITIMBRES_OFFLINE=1 npm run scrape:wikitimbres -- --all --limit 5 --dry-run

# Chemins isolés (recommandé pour un essai)
WIKITIMBRES_CACHE_DIR=/tmp/essai/cache WIKITIMBRES_OUTPUT=/tmp/essai/timbres.csv \
  npm run scrape:wikitimbres -- --all --limit 5 --dry-run

# Import dans une base de test, jamais la base personnelle
DATABASE_PATH=/tmp/essai/test.sqlite npm run import:catalog -- /tmp/essai/timbres.csv

# Vérification du parcours image (base de test OBLIGATOIRE, aucune requête réseau)
SMOKE_DB=/tmp/essai/test.sqlite npx tsx scripts/smoke-image-pipeline.mts

# Idem en exerçant réellement le relais (une seule requête d’image, opt-in explicite)
SMOKE_DB=/tmp/essai/test.sqlite SMOKE_NETWORK=1 npx tsx scripts/smoke-image-pipeline.mts

# Tests et build
npm test
npm run build
```

`--limit` est **obligatoire** avec `--all` et `--backfill-images` : il n’existe aucun mode
« tout aspirer » implicite. `--all` refuse d’être combiné à `--start`/`--end` et à `--force`.

## 9. Limites réelles et obstacles rencontrés

> État du chantier Wikitimbres **avant assainissement**. La revue corrigée est désormais synthétisée dans [DATA-LICENSE.md](../DATA-LICENSE.md) ; les fixtures réelles et le jeu fourni sont traités par [l’assainissement courant](06-assainissement.md). Les constats et chiffres de ce rapport décrivent les essais antérieurs, pas le catalogue synthétique actuel.

1. **Pas de sitemap exploitable.** `sitemap.xml` renvoie 200 avec 3 octets. La découverte
   passe donc par l’index des années, qui est la source publique la plus proche d’une
   énumération. Les notices hors de cet index (colonies sous `/co/...`, par exemple) ne
   sont **pas** couvertes : le préfixe `/co/` est volontairement exclu.
2. **Exhaustivité non prouvée.** Le site annonce 16444 timbres et 158 années. Atteindre
   cette couverture demanderait environ 350 pages de listing plus 16444 notices, soit
   ~14 h à 3 s par requête. Ce n’est pas fait et ne doit pas l’être pendant le
   développement. Le compteur reste factuel sur ce qui a été réellement lu.
3. **Permissions clarifiées, portée encore à préciser.** Les conditions autorisent
   explicitement la réutilisation non commerciale des articles et images ; les PNG HD
   font l’objet de conditions spécifiques. Le renvoi ADAGP est conditionnel, pas général.
   La collecte exhaustive et la portée des droits tiers restent à confirmer par écrit.
   `--images` reste désactivé par défaut ; voir la notice de contenus tiers.
4. **Contenu tiers hors dépôt.** Les archives de pages réelles sont dans
   `/home/ubuntu/wikitimbres-evidence/`, pas dans le dépôt. Les deux nouvelles fixtures de
   listing sont **structurelles** : balisage, classes CSS, identifiants et motifs d’URL
   conservés (faits techniques nécessaires aux tests), prose éditoriale retirée.
   **À signaler à la revue :** `tests/fixtures/wikitimbres-real.html` (95 Ko) et
   `tests/fixtures/wikitimbres.html` sont **déjà suivis par git** depuis les commits
   `663c4a9` et `e2064b3` (12 septembre), antérieurs à ce chantier. `wikitimbres-real.html`
   est une page Wikitimbres complète et verbatim. L’historique n’a pas été réécrit.
5. **Reconnaissance visuelle non exercée de bout en bout** (voir §7).
6. **`--force` exige le réseau.** Même avec un cache complet, `robots.txt` est toujours
   re-vérifié : `--force` est donc incompatible avec `WIKITIMBRES_OFFLINE=1`. C’est
   volontaire.
7. **Données du site imparfaites.** Certaines notices affichent `xxxxx` comme numéro de
   catalogue (désormais ignoré) et n’indiquent pas de pays (« France » par défaut, avec un
   message). Le champ `estimated_value` reste vide : les cotations affichées par le site ne
   sont pas reprises.
8. **Une année peut contenir des notices d’une autre année** (`wikitimbres-14783` est
   intitulé « 2023 … » sous l’année 2026). L’année exportée est celle de la date
   d’émission de la notice, pas celle du listing.

## 10. À faire relire en priorité

- `scripts/wikitimbres/discovery-plan.ts` : schéma de reprise, validation stricte à la
  relecture, atomicité de `recordListing`, canonisation des URL.
- `scripts/wikitimbres/crawl.ts` : `readListing` (un seul point de reprise par listing) et
  `visitNotice` (règle « ne pas ré-analyser une notice déjà au manifeste »).
- `scripts/scrape-wikitimbres.ts` : arbitrage des budgets, refus de `--all --force`,
  périmètre exact de `--retry-rejets`, distinction backfill/découverte.
- `scripts/wikitimbres/store.ts` : la règle « vide = non recherchée » dans `save()`.
- `scripts/smoke-image-pipeline.mts` : garde-fous `SMOKE_DB` et bascule `SMOKE_NETWORK`.
- `scripts/wikitimbres/parse.ts` : `stampImageUrl` et le libellé exact de `IMAGE_CREDIT`.
- La décision d’exposer ou non `IMAGE_HOSTS=www.wikitimbres.fr`, qui dépend de la revue
  juridique et n’est activée nulle part par défaut.

### Points restés en dette (non traités dans cette passe, hors périmètre)

- `tsc --noEmit -p tsconfig.json` signale une erreur **préexistante** dans
  `tests/wikitimbres-parse.test.ts` (ligne 25, `Object.keys` sur un `unknown` renvoyé par
  `csv-parse`). Elle est antérieure à ce chantier, n’affecte ni `npm test` ni `npm run build`,
  et ce fichier de test appartient à un autre lot de travail.
- L’assainissement juridique des artefacts versionnés (README, `DATA-LICENSE.md`,
  `.gitignore`, `data/catalog.json`, `data/embeddings.json`, fixture
  `tests/fixtures/wikitimbres-real.html`) est traité **séparément** ; ces fichiers n’ont pas
  été touchés ici. Les tests de cette passe n’utilisent aucune fixture de page réelle : le
  HTML de notice nécessaire est écrit en clair dans `tests/wikitimbres-crawl.test.ts`
  (balisage structurel, aucun contenu éditorial tiers).
