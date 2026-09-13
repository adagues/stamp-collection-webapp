# Importer un catalogue

- Le fichier `data/catalog.json` livré est une **démonstration entièrement fictive** : pays « Démoland », notices, séries et numéros inventés, adresses source en `.invalid` non fonctionnelles. Aucune notice, cotation ni illustration n'est reprise d'un catalogue tiers.
- Ce jeu sert à essayer les filtres, la recherche lexicale, le tri et la pagination. Il ne permet pas d'identifier de vrais timbres et n'est pas une référence philatélique.
- Aucune illustration n'est fournie ni référencée : `image_url` est vide dans tout le jeu de démonstration. Aucun relais d'image n'est donc sollicité par défaut.
- Pour une collection réelle, importer des données dont vous avez vérifié les droits, en conservant provenance, crédits et conditions applicables. Voir [contenus tiers et périmètre de licence](../../DATA-LICENSE.md).
- Le code est sous licence MIT ; cette licence ne confère **aucun droit** sur les contenus importés, leurs textes ou leurs illustrations, et aucune autorisation de redistribution n'est présumée.
- La valeur faciale historique est distincte de la valeur estimée de collection. Les estimations restent vides tant qu'une source vérifiée ne les renseigne pas.
- Les fichiers importés (`data/import/`), caches, exports et bases locales sont exclus de Git : ils ne sont pas destinés à la publication.

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
- Afficher une illustration importée exige d'autoriser son hôte via `IMAGE_HOSTS`. C'est une autorisation **technique** : le relais télécharge et retransmet les octets, ce qui demande une permission distincte du simple accès public.
