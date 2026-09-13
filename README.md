# Coffre à Timbres

Un album personnel pour explorer une collection de timbres, rechercher par photo ou par sens, et suivre ses exemplaires.

## Mode démonstration

Le dépôt est livré avec un **catalogue de démonstration entièrement fictif** (pays « Démoland », notices, séries et numéros inventés, adresses source en `.invalid`), **sans aucune illustration** et **sans vecteurs précalculés**. Il sert à essayer l'interface ; il ne permet pas d'identifier de vrais timbres.

Pour une collection réelle, importer des données dont vous avez vérifié les droits : voir [le schéma CSV](data/import/README.md) et [contenus tiers et périmètre de licence](DATA-LICENSE.md). Le mode démonstration reste utilisable tel quel, et une base vide est également valide : aucun faux timbre présenté comme réel n'est ajouté.

## Démarrer

Prérequis : Node.js 22 LTS à jour (22.12 minimum), ou Node.js 24 ou ultérieur, npm et un accès Internet pour les illustrations et le premier téléchargement des modèles.

```bash
npm install
npm run dev
```

Ouvrir `http://localhost:3000`. Si ce port est occupé, Next.js annonce le port suivant disponible. La base `data/vault.sqlite` est créée automatiquement à partir du catalogue de démonstration **uniquement si elle est vide** : une base existante n'est jamais réinitialisée ni écrasée, et sa collection est conservée. Aucun compte n’est nécessaire.

```bash
npm run build
npm start
npm test
```

## Utiliser son album

- **Le catalogue fourni est une démonstration fictive**, sans contenu repris d’un site tiers ni illustrations : il permet de tester filtres, recherche lexicale, tri et pagination. Importer un catalogue dont on possède les droits pour une collection réelle.
- **Ma collection** : cocher un timbre pour l’ajouter ; modifier la quantité et la référence personnelle, puis utiliser le bouton d’enregistrement. Les mêmes champs existent sur chaque carte et sur sa page de détail.
- Décocher retire la possession et remet la quantité à zéro, tout en conservant la référence. Une quantité positive représente un timbre possédé.
- Les statistiques distinguent les notices et les exemplaires. Les valeurs inconnues sont exclues du total ; aucune cote n’a été inventée.
- **Identifier un timbre** : importer une image JPEG, PNG ou WebP de moins de 10 Mo, ou utiliser la caméra. Un cadrage serré, de face et bien éclairé améliore les résultats.
- La caméra nécessite une autorisation du navigateur et une connexion HTTPS ou `localhost`.
- **Rechercher par le sens** : saisir une idée, par exemple « paysages de montagne ». Les rangs de similarité MiniLM sont fusionnés avec ceux de l’index lexical FTS5.
- La recherche par mots fonctionne sans modèle. Si un modèle échoue, le catalogue manuel reste disponible ; la recherche sémantique peut se rabattre sur les mots-clés.

## Préparer les modèles

- Aucun vecteur précalculé n’est distribué (`data/embeddings.json` est vide). Les vecteurs déjà présents dans une base locale sont conservés. Ce choix de distribution n’est pas une obligation juridique générale de supprimer les empreintes.
- La page de recherche indique combien d’images et de textes sont prêts. Les boutons **Préparer les images** et **Préparer les textes** calculent les vecteurs manquants dans le navigateur et les enregistrent dans SQLite.
- Les modèles sont MobileNet v2, avec 1 280 composantes, et `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, quantifié, avec 384 composantes et moyenne normalisée.
- Le téléchargement initial peut prendre plusieurs minutes ; MiniLM multilingue est plus volumineux qu’un modèle uniquement anglophone. La préparation peut être arrêtée et reprise.
- Après une préparation complète, `npm run export:embeddings` écrit un export **local** dans `data/exports/embeddings.json`, exclu de Git, sans remplacer le fichier de démonstration. Cet export exclut les références personnelles ; cela ne suffit pas à autoriser sa publication.
- Une image indisponible est signalée dans le bilan et peut être réessayée. Les recherches ne portent que sur les vecteurs disponibles pour la version du modèle sélectionnée.
- Les photos restent dans le navigateur. Seuls leurs vecteurs numériques sont transmis au serveur local ; les téléchargements de modèles contactent leurs hébergeurs externes.
- La recherche visuelle compare les vecteurs par similarité cosinus et affiche jusqu’à 24 candidats. Ces rangs ne sont pas des probabilités d’identification.

## Données, import et sauvegarde

- Les notices fournies sont synthétiques et explicitement fictives. Les droits des futurs contenus importés, leurs crédits et leurs sources doivent être vérifiés séparément : voir [contenus tiers et périmètre de licence](DATA-LICENSE.md).
- Les valeurs faciales sont historiques et ne constituent pas une estimation de collection. La base initiale ne contient aucune valeur estimée.
- Pour ajouter d’autres pays : consulter [le schéma CSV](data/import/README.md), puis exécuter `npm run import:catalog -- chemin/catalogue.csv`.
- Un import met à jour les identifiants existants sans effacer leur collection, et invalide leurs vecteurs. Relancer ensuite la préparation.
- `npm run seed` initialise une base vide de façon déterministe, sans supprimer une base existante.
- Pour sauvegarder, arrêter l’application puis copier `data/vault.sqlite` et, s’ils existent, ses fichiers `-wal` et `-shm`. La base et les références personnelles sont exclues de Git.
- `DATABASE_PATH` permet de choisir l’emplacement de la base. `IMAGE_HOSTS` ajoute des noms d’hôtes HTTPS autorisés techniquement, séparés par des virgules. Le relais télécharge et retransmet les images (ce n’est pas un simple lien), avec `Cache-Control: private, no-store` ; vérifier les droits avant activation.

## Collecte de métadonnées Wikitimbres

- Un script de collecte personnelle respecte `robots.txt`, espace les requêtes et conserve un cache local, sans télécharger les images. **Ne pas lancer `--all` avant clarification écrite de la permission de collecte exhaustive** ; une limite technique n’est pas un seuil juridique sûr.
- Consulter [les précautions et commandes de collecte](docs/05-scraping.md), dont un essai limité à trois identifiants et le test hors réseau.

## Structure et validation

- [Intention](docs/01-intent.md), [conception et diagrammes](docs/02-design.md), [spécifications](docs/03-specs.md).
- `app/` : pages et routes API Next.js 14 ; `components/` : interface française ; `lib/` : SQLite, collection, classement et modèles.
- `data/catalog.json` : catalogue de démonstration fictif ; `data/embeddings.json` : vide ; `scripts/` : initialisation et import ; `tests/` : tests Vitest de classement, validation, API, persistance et périmètre de publication.
- Le workflow `.github/workflows/ci.yml` prévoit `npm install`, `npm run build` et `npm test` à chaque envoi et demande de fusion.

## Limites connues

- Ressemblance approximative, sans authentification, identification de variété ni estimation certifiée. MobileNet est un modèle généraliste ; dentelure, filigrane et état de conservation nécessitent une vérification humaine.
- Le catalogue synthétique n’est pas une référence philatélique et ne permet pas d’identifier de vrais timbres par photo. L’import de données autorisées constitue la voie d’extension.
- Images et modèles nécessitent un accès à des services externes ; la préparation dépend des capacités du navigateur. La qualité des résultats sémantiques dépend des descriptions disponibles.
- Application personnelle à un seul utilisateur, **sans authentification ni gestion de comptes : elle reste à faire**. Réserver l'usage à un hébergement privé ; ne pas exposer l'application sur Internet avant d'avoir ajouté un contrôle d'accès. Authentifier réduit l'audience mais ne confère aucun droit supplémentaire sur les contenus affichés.
- Le relais `/api/image/<id>` **télécharge et retransmet les octets** de l'illustration : ce n'est pas un simple lien hypertexte. Il répond `Cache-Control: private, no-store` et refuse par défaut tout hôte non listé. Autoriser un hôte via `IMAGE_HOSTS` est une décision technique qui ne remplace pas la vérification des droits.
- **Aucune collecte exhaustive automatique** : le collecteur reste manuel, borné et limité par `robots.txt`. Ne pas lancer `--all` sans clarification écrite préalable ; aucun nombre de notices ne constitue un seuil sûr.
- Next.js 14 et `@xenova/transformers` 2 sont conservés conformément au socle demandé. L’audit npm signale des vulnérabilités dans ce socle et ses dépendances ; une migration du socle reste nécessaire avant un déploiement public.

## Licence

Code, documentation originale et exemples synthétiques sous licence MIT. Attribution : Stamp Vault contributors. Les contenus tiers, dépendances et modèles conservent leurs droits respectifs ; voir [DATA-LICENSE.md](DATA-LICENSE.md).
