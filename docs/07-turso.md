# Persistance distante avec Turso

Turso héberge la base SQLite distante. L’application Next.js et ses routes API peuvent rester sur Vercel ou être déployées sur un autre hébergeur Node.js : elles accèdent toutes à la même base avec le pilote serverless officiel pour les URL `turso://`. Les anciennes bases `libsql://` restent prises en charge avec `@libsql/client`, qui sert aussi aux bases locales `file:`. L’URL et le jeton restent exclusivement côté serveur.

## Créer et connecter la base

Installer le CLI Turso, se connecter, puis créer une base :

```bash
turso auth login
turso db create stamp-collection
turso db show --url stamp-collection
turso db tokens create stamp-collection
```

Reporter les deux dernières valeurs dans l’environnement du serveur :

```dotenv
TURSO_DATABASE_URL=turso://nom-base-organisation.turso.io
TURSO_AUTH_TOKEN=jeton-prive
```

Sur Vercel, définir ces variables pour l’environnement Production, puis redéployer. Ne jamais les préfixer par `NEXT_PUBLIC_` ni envoyer `.env.local` dans Git. Au premier accès, l’application crée de façon idempotente les tables et l’index lexical portable. Le moteur Rust/MVCC de Turso ne prenant pas en charge les tables virtuelles, cette recherche n’utilise pas FTS5. Si la table `stamps` est vide, l’application amorce le catalogue fictif distribué ; elle ne remplace pas une base déjà peuplée.

Le [guide officiel des pilotes TypeScript Turso](https://docs.turso.tech/sdk/ts/reference) distingue le pilote serverless des nouvelles bases `turso://` et le client libSQL des bases `libsql://`.

## Développement local

Le fichier `.env.example` utilise une base libSQL locale, sans jeton :

```bash
cp .env.example .env.local
npm run dev
```

Avec `TURSO_DATABASE_URL=file:data/vault.sqlite`, les tests et le développement restent hors réseau. Les tests créent leurs propres fichiers temporaires et ne doivent jamais pointer vers la base Turso de production.

## Migrer un coffre SQLite existant

1. Arrêter l’ancienne application afin de figer les écritures et conserver une copie de sauvegarde cohérente du fichier SQLite.
2. Préparer la copie SQLite pour l’import, après sauvegarde, avec le CLI `sqlite3` :

   ```bash
   sqlite3 /chemin/absolu/vault.sqlite "PRAGMA journal_mode=WAL; PRAGMA wal_checkpoint(TRUNCATE);"
   ```

3. Importer cette copie dans Turso avec la commande actuelle du CLI :

   ```bash
   turso db import /chemin/absolu/vault.sqlite
   ```

4. Relever dans la sortie le nom attribué à la base importée, récupérer son URL et créer un nouveau jeton avec `turso db show --url <nom>` et `turso db tokens create <nom>`.
5. Définir les variables serveur, redéployer, puis vérifier les nombres de notices, d’entrées de collection et de vecteurs, une recherche lexicale et une écriture de collection avant d’abandonner la sauvegarde locale.

L’[import officiel d’une base SQLite](https://docs.turso.tech/cloud/migrate-to-turso) documente aussi le chemin de migration et les prérequis du fichier source.

## Exploitation

- `npm run seed` vérifie la connexion et initialise seulement une base vide ; la collection existante est conservée.
- `npm run import:catalog -- chemin/catalogue.csv` écrit dans la base configurée et invalide les vecteurs des notices modifiées.
- `npm run export:embeddings` lit la base configurée, mais écrit toujours un artefact local exclu de Git.
- Les écritures de catalogue et les lots de vecteurs utilisent des batches transactionnels. La migration de schéma 2 reconstruit `stamp_search` dans une transaction d’écriture avant de publier sa version ; éviter néanmoins tout import pendant un redéploiement de migration.
- Une ancienne table virtuelle FTS5 peut rester stockée après import d’un fichier libSQL historique, mais ses triggers sont retirés et l’application ne la consulte plus.
- La recherche de préfixes parcourt la table lexicale ordinaire. Elle vise le catalogue personnel actuel de quelques centaines de notices ; mesurer ou remplacer cette stratégie avant un catalogue de grande taille.
- La base distante ne remplace pas le contrôle d’accès à l’application. Tant que l’application ne possède pas sa propre authentification, conserver la protection privée de l’hébergeur.

Contenu Turso reformulé à partir de la documentation officielle afin de respecter les restrictions de licence.
