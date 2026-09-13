# Assainissement de la version courante

Application des recommandations du rapport juridique corrigé du 13 septembre 2026. Périmètre : fichiers courants du projet, **sans réécriture Git ni modification de la collection locale**. Aucun commit, push, changement de visibilité ou déploiement n'est inclus.

## Choix appliqués

- Code MIT conservé ; portée précisée dans `LICENSE` et [DATA-LICENSE.md](../DATA-LICENSE.md). Permissions et restrictions des deux sources distinguées, sans inventer une version de licence.
- Catalogue distribué remplacé par une démonstration fictive ; aucun vecteur précalculé distribué. Les données originales restent dans les sauvegardes locales hors dépôt et éventuellement dans l'historique, qui n'est pas traité ici.
- Page HTML complète remplacée par des fixtures minimales synthétiques ; tests adaptés pour ne pas dépendre d'un extrait éditorial réel.
- Bases, caches, exports, imports et preuves exclus de Git. Export d'empreintes dirigé vers `data/exports/embeddings.json` (local), plutôt que vers le fichier de démonstration suivi.
- Relais d'images : `Cache-Control: private, no-store`, vérifié par un test sans réseau. Le relais reste une copie/transmission technique ; ni cet en-tête ni l'authentification ne créent une permission.
- Documentation de collecte : confirmation écrite recommandée avant `--all`, permission non commerciale et restriction HD PNG expliquées. Aucun crawl n'est lancé par l'assainissement.

Le jeu fictif n'est pas utilisable pour identifier de vrais timbres. L'application garde ses fonctions d'import et de préparation sur des données dont l'utilisateur a vérifié les droits.

## Validation et protection

Les validations complètes et empreintes de contrôle sont consignées dans le bilan de l'assainissement, hors dépôt. Les tests de données travaillent exclusivement sur des bases temporaires/en mémoire. Pour un build ou un essai manuel, définir `DATABASE_PATH` vers une **nouvelle base temporaire**, jamais vers la collection personnelle.

Les tests de non-régression couvrent notamment : la distribution synthétique, l'initialisation sans écrasement d'une base existante, la conservation de la collection, le parcours d'import, le parseur, le relais sans cache partagé et les exclusions Git. L'exécution de ces tests ne constitue pas une validation juridique des futures données importées.

## Limites résiduelles

- Le retrait de l'arbre courant n'efface pas les anciennes révisions, copies distantes ou caches déjà constitués. L'historique reste un arbitrage séparé.
- Aucun feu vert n'est donné pour la collecte exhaustive, la diffusion de données tierces, le déploiement public ou la migration de stockage.
- Les dépendances et modèles gardent leurs licences et limites. Les vulnérabilités du socle, signalées lors de la livraison initiale, ne sont pas corrigées par cet assainissement.
