# Importer un catalogue

- Le fichier `data/catalog.json` contient 179 notices françaises vérifiées le 12 septembre 2026 sur Phil-Ouest, de 1849 à 1963, avec quelques variétés distinctes.
- Chaque notice conserve son adresse source ; les numéros renseignés sont ceux indiqués sous « N° Y&T » sur cette source, sans invention ni certification indépendante.
- Les illustrations restent hébergées par Phil-Ouest, avec droits réservés ; elles ne sont pas placées sous licence MIT. Leur disponibilité dépend du site source.
- Le code est sous licence MIT ; aucune autorisation de redistribution des illustrations n’est présumée.
- La valeur faciale historique est distincte de la valeur estimée de collection. Les estimations sont inconnues et restent vides.
- Les noms de séries sont regroupés pour faciliter la navigation ; les variantes restent rattachées à leur notice source.
- Importer uniquement des données et illustrations dont vous pouvez faire cet usage.

## Format CSV

- Encodage UTF-8, séparateur virgule, première ligne obligatoire, guillemets doubles autour des cellules contenant une virgule.
- Colonnes obligatoires : `id,title,country,year,series,denomination,description,image_url,image_credit,source_url,catalog_number,estimated_value,currency`.
- `id` : identifiant stable et unique, lettres, chiffres, tirets ou traits de soulignement.
- `title`, `country`, `series`, `description` : libellés en français ; `year` : année entière de 1840 à 2100.
- `denomination` : valeur faciale avec sa monnaie historique, ou cellule vide si inconnue.
- `image_url` : adresse HTTPS publique de l’illustration, ou vide ; `image_credit` : provenance et droits.
- `source_url` : adresse HTTPS d’une notice vérifiable.
- `catalog_number` : numéro vérifié ou cellule vide, jamais un numéro supposé.
- `estimated_value` : montant positif ou nul, point décimal, ou vide si inconnu ; `currency` : code ISO à trois lettres.
- Les champs obligatoires textuels ne peuvent pas être vides, sauf `denomination`, `image_url` et `image_credit`.
- Commande : `npm run import:catalog -- chemin/vers/catalogue.csv`.
- L’import valide tout le fichier avant écriture, refuse les identifiants dupliqués et applique une transaction atomique.
- Un identifiant existant met à jour sa notice, conserve sa collection et invalide ses vecteurs pour les recalculer.
- Les autres pays utilisent le même format ; aucune couverture mondiale complète n’est annoncée.
- `npm run seed` initialise une base vide à partir du catalogue fourni, sans effacer une collection existante.
