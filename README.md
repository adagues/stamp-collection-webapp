# Coffre à Timbres

Un album personnel pour explorer le patrimoine postal français, rechercher un timbre par photo ou par sens, et suivre sa collection.

## Démarrer

Prérequis : Node.js 22 LTS à jour (22.12 minimum), ou Node.js 24 ou ultérieur, npm et un accès Internet pour les illustrations et le premier téléchargement des modèles.

```bash
npm install
npm run dev
```

Ouvrir `http://localhost:3000`. Si ce port est occupé, Next.js annonce le port suivant disponible. La base `data/vault.sqlite` est créée automatiquement à partir des données fournies. Aucun compte n’est nécessaire.

```bash
npm run build
npm start
npm test
```

## Utiliser son album

- **Le catalogue** : 179 notices françaises, de 1849 à 1963, incluant Cérès, Semeuse, Marianne, monuments, transports et commémorations ; filtres par année et série, tri et pagination.
- **Ma collection** : cocher un timbre pour l’ajouter ; modifier la quantité et la référence personnelle, puis utiliser le bouton d’enregistrement. Les mêmes champs existent sur chaque carte et sur sa page de détail.
- Décocher retire la possession et remet la quantité à zéro, tout en conservant la référence. Une quantité positive représente un timbre possédé.
- Les statistiques distinguent les notices et les exemplaires. Les valeurs inconnues sont exclues du total ; aucune cote n’a été inventée.
- **Identifier un timbre** : importer une image JPEG, PNG ou WebP de moins de 10 Mo, ou utiliser la caméra. Un cadrage serré, de face et bien éclairé améliore les résultats.
- La caméra nécessite une autorisation du navigateur et une connexion HTTPS ou `localhost`.
- **Rechercher par le sens** : saisir une idée, par exemple « paysages de montagne ». Les rangs de similarité MiniLM sont fusionnés avec ceux de l’index lexical FTS5.
- La recherche par mots fonctionne sans modèle. Si un modèle échoue, le catalogue manuel reste disponible ; la recherche sémantique peut se rabattre sur les mots-clés.

## Préparer les modèles

- Le jeu initial inclut 358 vecteurs précalculés dans un navigateur : les 179 images MobileNet et les 179 textes MiniLM. Ils sont importés automatiquement dans une base neuve, avec vérification de leur version et de l’empreinte de leur notice.
- La page de recherche indique combien d’images et de textes sont prêts. Les boutons **Préparer les images** et **Préparer les textes** calculent les vecteurs manquants dans le navigateur et les enregistrent dans SQLite.
- Les modèles sont MobileNet v2, avec 1 280 composantes, et `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, quantifié, avec 384 composantes et moyenne normalisée.
- Le téléchargement initial peut prendre plusieurs minutes ; MiniLM multilingue est plus volumineux qu’un modèle uniquement anglophone. La préparation peut être arrêtée et reprise.
- Après une préparation complète, `npm run export:embeddings` régénère le fichier de vecteurs du catalogue initial. Cet export exclut les références personnelles.
- Une image indisponible est signalée dans le bilan et peut être réessayée. Les recherches ne portent que sur les vecteurs disponibles pour la version du modèle sélectionnée.
- Les photos restent dans le navigateur. Seuls leurs vecteurs numériques sont transmis au serveur local ; les téléchargements de modèles contactent leurs hébergeurs externes.
- La recherche visuelle compare les vecteurs par similarité cosinus et affiche jusqu’à 24 candidats. Ces rangs ne sont pas des probabilités d’identification.

## Données, import et sauvegarde

- Les notices et leurs numéros renseignés proviennent de Phil-Ouest ; chaque détail propose un lien vers sa source. Les illustrations externes restent soumises aux droits de leur hébergeur et ne relèvent pas de la licence MIT du code.
- Les valeurs faciales sont historiques et ne constituent pas une estimation de collection. La base initiale ne contient aucune valeur estimée.
- Pour ajouter d’autres pays : consulter [le schéma CSV](data/import/README.md), puis exécuter `npm run import:catalog -- chemin/catalogue.csv`.
- Un import met à jour les identifiants existants sans effacer leur collection, et invalide leurs vecteurs. Relancer ensuite la préparation.
- `npm run seed` initialise une base vide de façon déterministe, sans supprimer une base existante.
- Pour sauvegarder, arrêter l’application puis copier `data/vault.sqlite` et, s’ils existent, ses fichiers `-wal` et `-shm`. La base et les références personnelles sont exclues de Git.
- `DATABASE_PATH` permet de choisir l’emplacement de la base. `IMAGE_HOSTS` ajoute des noms d’hôtes HTTPS autorisés, séparés par des virgules, pour les illustrations d’un catalogue importé.

## Structure et validation

- [Intention](docs/01-intent.md), [conception et diagrammes](docs/02-design.md), [spécifications](docs/03-specs.md).
- `app/` : pages et routes API Next.js 14 ; `components/` : interface française ; `lib/` : SQLite, collection, classement et modèles.
- `data/catalog.json` : catalogue initial ; `scripts/` : initialisation et import ; `tests/` : tests Vitest de classement, validation, API et persistance.
- Le workflow `.github/workflows/ci.yml` prévoit `npm install`, `npm run build` et `npm test` à chaque envoi et demande de fusion.

## Limites connues

- Ressemblance approximative, sans authentification, identification de variété ni estimation certifiée. MobileNet est un modèle généraliste ; dentelure, filigrane et état de conservation nécessitent une vérification humaine.
- Catalogue initial volontairement limité, avec certaines variétés et des années non représentées. L’import documenté constitue la voie d’extension ; aucune exhaustivité mondiale n’est annoncée.
- Images et modèles nécessitent un accès à des services externes ; la préparation dépend des capacités du navigateur. La qualité des résultats sémantiques dépend des descriptions disponibles.
- Application personnelle à un seul utilisateur, sans authentification ni gestion de comptes. Utiliser un environnement privé ; protéger l’accès avant toute exposition sur Internet.
- Next.js 14 et `@xenova/transformers` 2 sont conservés conformément au socle demandé. L’audit npm signale des vulnérabilités dans ce socle et ses dépendances ; une migration du socle reste nécessaire avant un déploiement public.

## Licence

Code sous licence MIT. Attribution : Stamp Vault contributors. Les sources et illustrations externes conservent leurs droits respectifs.
