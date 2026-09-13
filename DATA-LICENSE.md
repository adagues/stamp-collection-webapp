# Logiciel, démonstration et contenus tiers

Cette notice applique les recommandations de l'analyse juridique corrigée du 13 septembre 2026. Elle distingue permissions publiées et choix de prudence ; elle ne constitue ni une consultation juridique ni une garantie de licéité.

## Périmètre de la distribution

- `LICENSE` (MIT) couvre le code, la documentation originale et les exemples synthétiques écrits pour ce projet. Les dépendances et modèles conservent leurs propres licences.
- `data/catalog.json` contient exclusivement une **démonstration fictive**, sans notices, cotations ni illustrations reprises d'un catalogue tiers. Ses liens `catalogue.demoland.invalid` sont non fonctionnels par conception (TLD réservé, RFC 2606).
- `data/embeddings.json` est vide. Ne plus fournir les anciens vecteurs est un choix éditorial de prudence, **pas une obligation générale de suppression des embeddings établie par l'analyse**. Aucune suppression des vecteurs de la collection locale n'est demandée ou effectuée.
- `tests/fixtures/wikitimbres-synthetic.html` est une fixture écrite à la main : structure de balisage représentative, contenu inventé. Les fixtures d'année sont également synthétiques : identifiants, noms d'illustrations et compteurs inventés ; seuls les mécanismes de balisage et de pagination sont représentés. Aucune archive de page réelle n'est publiée ; un test vérifie qu'aucune fixture ne dépasse 30 Ko ni ne porte un nom `-real`. Les domaines de source dans les tests servent à vérifier les règles techniques et ne confèrent aucune licence.
- Les imports, bases personnelles, caches, exports et preuves HTML restent locaux et sont exclus de Git. Un `.gitignore` ne retire pas un fichier déjà suivi : vérifier le contenu réel du diff avant publication.

La licence MIT du logiciel n'accorde **aucun droit supplémentaire** sur les textes, images, données ou modèles tiers que l'utilisateur importe. Du code MIT indépendant peut coexister avec des contenus sous d'autres licences, à condition d'en distinguer les périmètres et de respecter leurs obligations.

## Phil-Ouest

Source : [mentions légales de Phil-Ouest](https://www.phil-ouest.com/Mentions_legales.php), consultées pour le rapport du 13 septembre 2026.

Le site annonce une réutilisation totale ou partielle des textes, images et autres documents multimédias selon GFDL ou CC-BY-SA, avec référence à l'original et lien lorsque possible. Cette permission est favorable, mais sa **version n'est pas précisée** ; le projet n'attribue donc pas arbitrairement CC BY-SA 4.0 à ces contenus. La titularité et la portée des droits sur chaque illustration restent à clarifier. Ne pas présenter une licence CC respectée comme librement révocable.

Les anciennes notices de démonstration venaient de Phil-Ouest. Leur remplacement par des exemples fictifs ne signifie pas qu'une incompatibilité automatique avec MIT aurait été établie. Pour un import local autorisé, conserver provenance, crédits, conditions applicables et éventuelles modifications.

## Wikitimbres

Source : [mentions légales et conditions d'utilisation de Wikitimbres](https://www.wikitimbres.fr/mentions-legales), consultées pour le rapport du 13 septembre 2026.

Le site autorise explicitement la réutilisation de ses articles et des images des timbres **à des fins non commerciales**. Les téléchargements **HD en PNG** font l'objet d'une permission plus étroite : projets d'impression présentant un intérêt philatélique, usage limité au projet, non-transmission à des tiers, crédit `www.wikitimbres.fr`. Ne pas assimiler ces téléchargements aux illustrations ordinaires.

Le renvoi aux droits ADAGP est formulé pour le cas contraire à l'usage non commercial : ce n'est pas une obligation universelle de paiement pour tout usage personnel. La permission publiée n'établit cependant pas la titularité de chaque droit d'artiste ni une autorisation expresse de répliquer intégralement la base.

**Par prudence, ne pas lancer `--all` avant confirmation écrite** portant sur la collecte exhaustive, les cotations, les illustrations ordinaires, les empreintes de reconnaissance, l'hébergement distant personnel et toute diffusion de données ou vecteurs. Préférer un export officiel ou un accès prévu par le site. Aucune quantité de notices ni délai de collecte ne constitue un seuil juridique sûr. Le respect de `robots.txt` n'est pas une licence et ne doit pas être contourné.

## Images, empreintes et hébergement

Le collecteur `--images` enregistre des URL et crédits ; il ne télécharge pas lui-même les illustrations. En revanche, `/api/image/<id>` **télécharge, copie temporairement en mémoire et retransmet leurs octets**. Ce relais n'est pas un simple hyperlien. Il envoie désormais `Cache-Control: private, no-store` pour ne pas inviter les caches partagés à conserver les réponses ; cela ne supprime ni la transmission, ni toute copie technique, ni le besoin de permissions adaptées.

L'ajout d'un domaine dans `IMAGE_HOSTS` est une autorisation technique, pas juridique. Les illustrations Wikitimbres restent désactivées dans ce relais par défaut. La reconnaissance peut impliquer des copies techniques ; on ne garantit ni le statut juridique ni la non-inversibilité de tous les vecteurs. Authentifier un hébergement réduit l'audience, sans créer de droits supplémentaires.

## Ce que ce dépôt ne prétend pas

- **Version de licence Phil-Ouest inconnue.** Le site cite « GNU (GFDL) ou Creative Commons (CC-BY-SA) » sans préciser de version ni de titularité sur chaque œuvre représentée. Le projet ne lui attribue donc ni CC BY-SA 4.0, ni GFDL d'une version donnée, et n'affirme pas que ces contenus sont réutilisables sans conditions. Clarification à demander.
- **Permission Wikitimbres non commerciale et bornée.** La réutilisation annoncée porte sur les articles et images de timbres à des fins non commerciales ; les téléchargements **HD en PNG** relèvent d'une permission plus étroite (projet d'impression d'intérêt philatélique, usage limité au projet, non transmissible, crédit demandé). Cette permission n'établit pas qu'une **aspiration intégrale** de la base serait autorisée, ni que l'éditeur détient chaque droit d'auteur concerné.
- **Aucun seuil de sécurité.** Ni un nombre de notices, ni un rythme de collecte, ni le respect de `robots.txt` ne constituent une autorisation. Le respect des limites techniques n'est pas une licence.
- **Retrait des vecteurs = prudence, pas obligation.** L'analyse corrigée ne conclut pas à une obligation générale de supprimer des empreintes. Ne pas publier de vecteurs dérivés d'images tierces est un choix de distribution ; les vecteurs de la collection locale ne sont ni supprimés ni concernés.

## Historique et vérification avant publication

L'assainissement concerne **l'arbre de travail courant uniquement**. Les anciens contenus peuvent rester dans l'historique Git, les clones, les forks ou des versions déjà déployées. Aucune réécriture, suppression de copie distante, modification de visibilité ou publication n'est implicite. Une décision distincte est nécessaire pour traiter l'historique.

Avant de publier : exécuter les tests, contrôler `git status --short` et `git diff`, vérifier qu'aucune base, archive HTML réelle, donnée personnelle ou export n'est ajouté. Les sauvegardes locales hors dépôt ne doivent pas être jointes à une release. Ne pas exposer publiquement l'application personnelle sans contrôle d'accès, revue des permissions et traitement des vulnérabilités du socle.
