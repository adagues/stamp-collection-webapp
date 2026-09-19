# Persistance distante avec Turso

Turso héberge la base libSQL distante. L’application Next.js et ses routes API peuvent rester sur Vercel ou être déployées sur un autre hébergeur Node.js : elles accèdent toutes à la même base avec `@libsql/client`. L’URL et le jeton restent exclusivement côté serveur.

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
TURSO_DATABASE_URL=libsql://nom-base-organisation.turso.io
TURSO_AUTH_TOKEN=jeton-prive
```

Sur Vercel, définir ces variables pour l’environnement Production, puis redéployer. Ne jamais les préfixer par `NEXT_PUBLIC_` ni envoyer `.env.local` dans Git. Au premier accès, l’application crée de façon idempotente les tables, l’index FTS5 et ses triggers. Si la table `stamps` est vide, elle amorce le catalogue fictif distribué ; elle ne remplace pas une base déjà peuplée.

Le [guide officiel Next.js + Turso](https://docs.turso.tech/sdk/ts/guides/nextjs) décrit la création des identifiants et la configuration de `@libsql/client`.

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
5. Définir les variables serveur, redéployer, puis vérifier les nombres de notices, d’entrées de collection et de vecteurs, une recherche FTS5 et une écriture de collection avant d’abandonner la sauvegarde locale.

L’[import officiel d’une base SQLite](https://docs.turso.tech/cloud/migrate-to-turso) documente aussi le chemin de migration et les prérequis du fichier source.

## Exploitation

- `npm run seed` vérifie la connexion et initialise seulement une base vide ; la collection existante est conservée.
- `npm run import:catalog -- chemin/catalogue.csv` écrit dans la base configurée et invalide les vecteurs des notices modifiées.
- `npm run export:embeddings` lit la base configurée, mais écrit toujours un artefact local exclu de Git.
- Les écritures de catalogue et les lots de vecteurs utilisent des batches transactionnels libSQL.
- La base distante ne remplace pas le contrôle d’accès à l’application. Tant que l’application ne possède pas sa propre authentification, conserver la protection privée de l’hébergeur.

Contenu Turso reformulé à partir de la documentation officielle afin de respecter les restrictions de licence.
