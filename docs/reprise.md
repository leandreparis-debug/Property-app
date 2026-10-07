# Document de reprise

> Rédigé le 5 octobre 2026 pour reprendre le travail depuis un autre compte Claude. À lire en début de session, avec `CLAUDE.md` et `README.md`.

## Où est le code

- Dépôt : https://github.com/leandreparis-debug/Property-app (privé).
- Tout le travail des étapes 1 à 10 est dans `main` : la pull request [leandreparis-debug/Property-app#1](https://github.com/leandreparis-debug/Property-app/pull/1) (branche `claude/atlas-init-design-system-scuzyd`) a été fusionnée le 5 octobre 2026.
- Ce document, `CLAUDE.md` et l'étape 11 sont sur la branche `claude/ecstatic-cerf-mja73l`, à fusionner à son tour dans `main`.

## Le projet

**Vigie** est l'outil interne de Carrefour Property qui centralise les données de moins de 200 entrepôts logistiques en France métropolitaine. Il remplace un tableur d'environ 200 colonnes et des documents dispersés. Il devait tourner sur un serveur interne de la DSI, sur réseau fermé, avec SQL Server.

Le projet s'appelait **« Atlas »** au départ ; il a été renommé **« Vigie »** après l'étape 4 (base `vigie`, cookie `vigie_session`, comptes `@vigie.local`, logo « V » dans `docs/brand/`).

## Historique des étapes

| Étape | Contenu | Documentation |
|---|---|---|
| 1 | Initialisation : Next.js 15, TypeScript strict, Tailwind v4, shadcn/ui, design system, coque, Docker SQL Server, CSP à nonce, garde `check:offline`, chaîne qualité | `docs/architecture.md`, `docs/design-system.md` |
| 2 | Modèle de données Prisma 7 + SQL Server, migrations, 10 sites fictifs de démonstration | `docs/data-model.md` |
| 3 | Authentification (comptes locaux, sessions en base, argon2id), 3 rôles (admin, éditeur, lecteur), journal d'audit automatique | `docs/security.md` |
| 4 | Import rejouable du tableur `.xlsx` (`--dry-run`, rapport CSV), fichier fictif `samples/vigie-sample.xlsx` | `docs/import.md`, `docs/source-mapping.md` |
| 5 | Enrichissement par données publiques et carte hors ligne, préparés sur un poste connecté (`tools/offline-bundle/`) puis installés | `docs/offline-bundle.md` |
| 6 | Carte nationale MapLibre, statut de conformité calculé, aperçu d'un site | `docs/compliance-rules.md` |
| 7 | Filtres partagés dans l'URL, recherche Ctrl+K, liste des sites, supervision, mode présentation | `docs/filters-and-search.md` |
| 8 | Fiche entrepôt en lecture (`/sites/[id]`) | `docs/site-sheet.md` |
| 9 | Édition tracée section par section, documents, création et archivage de sites, gestion des conflits | `docs/editing.md` |
| 10 | Volume 3D, plan AutoCAD calibré superposé à la carte, équipements | `docs/plans-and-equipment.md` |
| 11 | Exploitation et administration : tâches planifiées (export nocturne avec rétention, purges), espace Administration (exploitation, utilisateurs, journal d'audit, imports et verrou, revue des divergences), exports à la demande | `docs/exploitation.md`, `docs/administration.md` |

Après l'étape 10 :

- **Compatibilité GitHub Codespaces** : `pnpm db:up` crée les bases dans le conteneur (Docker-in-Docker) ; l'hôte redirigé du Codespace est accepté pour les Server Actions (`next.config.ts`).
- **Refonte visuelle (30 septembre 2026)** — remplace le thème sombre de l'étape 1 :
  - thème **clair et chaud** (fond crème, cartes blanches, accent bleu `#1B4F9C` **provisoire** en attendant la charte Carrefour Property) ;
  - **barre de navigation horizontale** en haut (le rail vertical a été retiré), rangée de filtres sur les vues des sites ;
  - fond de carte **IGN** (Plan IGN + photos aériennes) chargé en ligne par le navigateur (`MAP_BASEMAP=ign`, défaut) ; `MAP_BASEMAP=offline` garde le mode réseau fermé, utilisé par les tests e2e ;
  - accueil « Carte du portefeuille » : échéances, fiches à compléter, décompte de conformité, carte avec étiquettes des sites, résumé du site sélectionné.
- **Documents ajoutés (2 octobre 2026)** :
  - `docs/maquettes/` : maquette interactive `maquette-vigie.html` (validée le 30 septembre) et captures de l'application ;
  - `docs/hebergement-google.md` : proposition d'hébergement sur Google Cloud, **non mise en œuvre**.

- **Carte « gris épuré » (5 octobre 2026)** : Plan IGN vectoriel avec le style `gris` de l'IGN (repli sur le Plan IGN en images désaturé), étiquettes de sites plus légères, emprises au trait neutre, volumes en gris clairs (`docs/design-system.md`, section Carte). Rendu du fond IGN **non vérifié** dans l'environnement cloud de Claude (`data.geopf.fr` y est bloqué) ; tests e2e de la carte à relancer.
- **Poste local (7 octobre 2026)** : guide [`docs/demarrage-local.md`](demarrage-local.md) (conteneur de développement VS Code ou installation directe, Windows compris) ; `.gitattributes` force les fins de ligne Unix pour que les scripts bash marchent sous Windows.

## Décisions importantes

- **Hors ligne par principe** : le serveur n'appelle jamais internet. Seule exception : le fond IGN, chargé par les postes des utilisateurs (voir `docs/security.md`, section fond de carte).
- **Couleurs de statut réservées** (vert, ambre, rouge, gris), toujours accompagnées d'un libellé.
- **La base est la source de vérité** ; le tableur n'est qu'une source d'import. Une valeur saisie dans l'application n'est plus écrasée par un nouvel import (sauf `--force`).
- **Fichiers sur disque** sous `STORAGE_ROOT`, métadonnées en base.
- **Audit systématique** dans la même transaction que la modification ; le journal n'est jamais purgé.
- **Hébergement Google (proposition)** : BigQuery écarté comme base principale (pas transactionnel, pas pris en charge par Prisma). Architecture proposée : Cloud SQL (PostgreSQL conseillé, 1 à 2 jours d'adaptation) + Cloud Run + Cloud Storage + IAP, et BigQuery + Looker Studio en complément pour les tableaux de bord. Prérequis : projet Google Cloud avec facturation et accord de la DSI.

## Ce qui reste à faire

1. **Étape 12 — Recette et déploiement** : image Docker (`output: "standalone"` déjà en place), procédure de livraison à la DSI, `pnpm db:deploy` sur le serveur.
2. **Charte Carrefour Property** : remplacer l'accent provisoire (`--color-accent`, `-strong`, `-soft` dans `src/app/globals.css`).
3. **Décision d'hébergement** : réseau fermé DSI (prévu) ou Google Cloud (proposition) ; dans le second cas, migration vers PostgreSQL et stockage Cloud Storage.
4. Import du **vrai tableur** (toujours `--dry-run` d'abord) et paquet hors ligne réel si le mode `offline` est retenu.

## Pour démarrer une nouvelle session

Demander à Claude : « Lis `CLAUDE.md` et `docs/reprise.md`, puis continue avec l'étape 12 » (ou la tâche voulue). Le démarrage local est décrit dans `README.md` (section « Démarrage »).
