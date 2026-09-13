# Collecte Wikitimbres

- Usage personnel et de recherche : cela ne constitue pas à soi seul une autorisation. **Ne pas lancer `--all` avant confirmation écrite sur la collecte exhaustive** (recommandation de prudence, pas interdiction légale démontrée). Les permissions, la restriction HD PNG et les points ouverts sont détaillés dans [DATA-LICENSE.md](../DATA-LICENSE.md) ; `robots.txt` ne constitue pas une licence.
- Par défaut, aucune illustration n’est extraite : `image_url` et `image_credit` restent vides et les liens d’images du HTML ne sont pas suivis. L’option explicite `--images` enregistre l’adresse de l’illustration déjà publiée par le site, sans jamais télécharger le fichier ; voir la section « Découverte `--all` et illustrations » plus bas, et les réserves juridiques qui l’accompagnent.
- Les métadonnées sont exportées selon [le schéma CSV existant](../data/import/README.md). La description dédiée est privilégiée, puis le commentaire dédié ; à défaut, les faits sont assemblés. Les crédits ne sont pas extraits.
- Une référence de catalogue n’est conservée que sous un libellé reconnu, telle qu’affichée, sans numéro déduit. Les estimations restent vides ; `currency=EUR` est la convention de la colonne d’estimation, sans conversion de la valeur faciale historique.
- Un titre, un pays et une année valides sont nécessaires ; sinon la notice est ignorée avec un message. Une série absente devient « Série non renseignée ».
- Prérequis : version Node.js indiquée dans le README, puis `npm install`, depuis la racine du dépôt.
- Parseur testé hors ligne sur une fixture minimale **synthétique**, `tests/fixtures/wikitimbres-synthetic.html`. L’archive HTML réelle n’est plus distribuée dans l’arbre courant ; son remplacement ne l’efface pas de l’historique.
- Essai local **sans réseau** : `npm test -- tests/wikitimbres-parse.test.ts tests/wikitimbres-parse-synthetic.test.ts`. Les autres tests de collecte simulent le réseau.
- Petit essai réel ultérieur : `npm run scrape:wikitimbres -- --start 1 --end 3 --limit 3`.
- Sans arguments : identifiants 1 à 3. `--start` et `--end` sont inclusifs ; plage limitée à 50 identifiants, `--limit` entre 1 et 50 (50 par défaut). La limite compte les identifiants examinés, y compris ceux ignorés.
- Les chemins essayés sont `/timbres/ID`, avec suivi des redirections autorisées. Des notices peuvent être absentes ou ignorées si leur structure diffère de la page testée. Vérifier le CSV du petit essai avant d’élargir la plage.
- Délai conservateur : 3 secondes minimum entre la fin d’une requête et la suivante, aucune concurrence. Pour ralentir : `WIKITIMBRES_DELAY_MS=5000 npm run scrape:wikitimbres -- --start 1 --end 3`. Valeurs admises : 3000 à 3600000 ms ; un `Crawl-delay` supérieur est respecté, ou entraîne un arrêt s’il dépasse cette borne.
- Agent annoncé : `StampVaultBot/1.0 (personal catalog research; metadata only)`.
- `robots.txt` est demandé en premier à chaque lancement et archivé, même avec un cache existant, afin de vérifier les règles actuelles. Échec réseau, statut autre que 200, réponse non textuelle ou invalide : arrêt avec code non nul. Les redirections de `robots.txt` sont refusées par prudence.
- Chaque chemin de notice et chaque redirection sont contrôlés avant accès ; les chemins interdits sont ignorés avec leur motif. Les redirections hors du même site ou du catalogue sont refusées.
- Les réponses sont enregistrées dans `data/cache/wikitimbres/` et réutilisées par défaut, y compris les erreurs HTTP. Un contenu binaire inattendu n’est pas sauvegardé. Les codes 404/410 sont ignorés ; les autres erreurs, dont 429/503, arrêtent la collecte sans nouvelle tentative automatique.
- `--force` (mode plage uniquement) renouvelle les réponses et retraite les identifiants déjà exportés de la plage, sans contourner robots ni le délai. À utiliser ponctuellement après correction d’un problème, pas pour relancer en boucle. Refusé avec `--all` et `--backfill-images`.
- Le manifeste local conserve les identifiants exportés ; une reprise les ignore sans redemander leurs pages. Un échec d’extraction reste réessayable depuis le cache. Le CSV est reconstruit depuis le manifeste au lancement, puis actualisé après chaque notice.
- Résultat : `data/import/wikitimbres.csv`. Les écritures sont atomiques ; les identifiants et adresses finales évitent les doublons. Conserver le manifeste pour préserver la reprise et les notices des plages précédentes.
- Le verrou `data/cache/wikitimbres/run.lock` empêche deux exécutions locales simultanées. Après une interruption brutale, ne le supprimer qu’après avoir vérifié que le processus indiqué dedans est terminé.
- Cache, manifeste et CSV généré sont exclus de Git ; garder ces données localement. Les pages HTML en cache peuvent contenir des textes et liens tiers : ne pas publier ce cache.
- Après vérification des notices produites : `npm run import:catalog -- data/import/wikitimbres.csv`. Cette commande distincte met à jour la base ; la collecte seule ne la modifie pas. Un CSV sans notice ne peut pas être importé.
- Aide : `npm run scrape:wikitimbres -- --help`.

## Découverte `--all` et illustrations

- Rapport détaillé du chantier, preuves et limites : [wikitimbres-implementation-report.md](wikitimbres-implementation-report.md).
- `sitemap.xml` du site est vide (3 octets, constaté le 13 septembre 2026) : la découverte
  suit les liens réellement publiés — liens de notices, liens de pagination et index des
  autres années — à partir d’une page d’année du catalogue. Aucune plage d’identifiants
  n’est devinée.
- **Amorce honnête :** au premier lancement, quand `discovery.json` est vide, le point de
  départ n’est **pas** lu depuis `/plan-du-site`. Il est **construit** par le script :
  `/timbres/annee/<année UTC courante>/<année UTC courante>`. Cette forme d’URL a été
  vérifiée sur le site (le plan du site expose bien « Parcourir → Par année »), mais le lien
  exact n’est pas suivi pour cette première page. Dès ce premier listing lu, toutes les
  autres pages viennent uniquement des liens publiés par le site. Conséquence assumée : si
  le site changeait ce schéma d’URL, l’amorce échouerait (listing absent, marqué traité,
  aucun lien inventé) et il faudrait fournir l’amorce à la main.
- Chaque page de listing est enregistrée en **un seul point de reprise** : identifiants de
  notices, total annoncé, liens de pagination et index des années sont écrits ensemble. Une
  interruption juste après la lecture d’un listing ne perd donc plus ses liens, et un plan
  n’annonce jamais une page « traitée » dont les liens auraient disparu.
- `--all` exige `--limit` (1 à 20000) ; `--listings` borne les pages de listing (défaut 5).
  Il n’existe aucun mode « tout aspirer » implicite, et `--all` refuse `--start`/`--end`.
- `--all` **refuse `--force`** : il n’existe aucun rafraîchissement global de la découverte.
  Le message d’erreur renvoie vers les trois reprises réellement implémentées :
  - `--all --retry-rejets --limit N` remet en attente au plus `N` notices déjà notées
    `rejected` ou `missing`, puis les revisite. Les notices déjà exportées ne sont **pas**
    rouvertes et les listings déjà lus ne sont **pas** relus.
  - `--backfill-images --limit N` complète les illustrations manquantes depuis le cache.
  - le mode plage `--start`/`--end` accepte `--force` pour ses seuls identifiants.
- Une notice déjà présente dans le manifeste n’est pas ré-analysée par `--all` : le plan est
  synchronisé depuis le manifeste sans redemander la page. Sans cette règle, une passe sans
  `--images` sur une notice exportée par une ancienne plage écrasait son `image_url` par une
  valeur vide. Par sécurité supplémentaire, le manifeste ne remplace jamais une illustration
  connue par un champ vide : « vide » signifie « non recherchée », pas « inexistante ».
- Reprise : `discovery.json` dans le dossier de cache mémorise les listings vus, les notices
  connues et leur état (`exported`, `rejected`, `missing`, ou en attente). Relancer la même
  commande continue sans redemander les pages déjà traitées.
- Le compte rendu distingue notices exportées, rejetées, absentes et en attente, ainsi que
  les listings restants. Un plan épuisé n’est « complet » que pour les listings connus :
  ce n’est pas une garantie d’exhaustivité du site.
- `--dry-run` n’effectue aucune requête, pas même `robots.txt` : il affiche le plan et la
  couverture. `WIKITIMBRES_OFFLINE=1` interdit toute requête et n’utilise que le cache.
- Chemins configurables : `WIKITIMBRES_CACHE_DIR` et `WIKITIMBRES_OUTPUT`, utiles pour un
  essai isolé sans toucher au cache ni au CSV habituels.
- `--images` (facultatif) ajoute l’adresse de l’illustration principale et un crédit.
  **Aucun fichier image n’est téléchargé.** Seule l’URL déjà publiée par le site est
  enregistrée, et uniquement si elle est en HTTPS, sur `www.wikitimbres.fr`, sous
  `/public/stamps/<taille>/<fichier>.(jpg|jpeg|png|webp)`. Les logos, icônes et « visuels »
  ajoutés par les membres sont exclus.
- **Cette option ne vaut pas autorisation.** Le site autorise explicitement la réutilisation
  non commerciale des articles et images, mais les téléchargements HD PNG sont réservés
  à des projets d’impression philatélique déterminés et non transmissibles. Le renvoi
  ADAGP ne signifie pas un paiement général pour tout usage personnel. La portée de
  chaque droit et la collecte intégrale restent à clarifier ; voir la notice de contenus tiers.
- Le relais `/api/image/<id>` n’autorise par défaut que `www.phil-ouest.com` : une notice
  Wikitimbres renvoie 403 tant que `IMAGE_HOSTS` n’a pas été élargi volontairement.
- `--backfill-images --limit N` complète les illustrations des notices déjà exportées, en
  réutilisant les pages du cache, sans `--force` et sans relire de listing.
- Les notices sans illustration ne sont plus comptées comme « en attente » d’indexation
  visuelle : elles apparaissent séparément comme non indexables par l’image.
- Les numéros de catalogue factices affichés par le site (`xxxxx`, `-`, `?`…) sont ignorés.
- Vérification bornée du parcours base → API → relais d’image :
  `SMOKE_DB=/tmp/essai/test.sqlite npx tsx scripts/smoke-image-pipeline.mts`.
  `SMOKE_DB` est **obligatoire** (chemin absolu, hors du dossier `data/` du dépôt) : le script
  refuse de démarrer sans lui et n’ouvre jamais la base personnelle. Par défaut il n’effectue
  **aucune requête réseau** ; `SMOKE_NETWORK=1` ajoute la seule requête qui télécharge vraiment
  une illustration, en élargissant `IMAGE_HOSTS` explicitement pour ce test. Chaque étape est
  vérifiée et le script sort en code non nul si une vérification échoue.
