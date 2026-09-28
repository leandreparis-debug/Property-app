# Architecture

## Principes

1. **Fonctionnement hors internet.** L'application tourne sur un serveur interne, sur un réseau fermé. Polices, tuiles et styles cartographiques, images et scripts sont servis par l'application elle-même. Aucun CDN, aucun appel sortant, aucune télémétrie. Trois garde-fous :
   - une Content-Security-Policy qui n'autorise que `'self'` (plus `data:`/`blob:` pour les images et `blob:` pour les workers) ;
   - `pnpm check:offline`, qui refuse toute URL `http(s)://` externe dans `src/` et `public/` ;
   - un test e2e qui intercepte chaque requête du navigateur et vérifie qu'elle reste sur l'origine de l'application.
2. **La base de données est la source de vérité.** Le tableur n'est qu'une source d'import (étape 4). Toute donnée affichée provient de SQL Server.
3. **Fichiers sur disque, métadonnées en base.** Tous les fichiers écrits par l'application vivent sous `STORAGE_ROOT` (`src/server/storage.ts` refuse tout chemin qui en sortirait). Plans, photos et documents sont stockés sur le système de fichiers du serveur ; la base conserve leurs métadonnées (chemin, type, taille, empreinte, auteur, date).
4. **Audit systématique.** Chaque modification de donnée est tracée : qui, quand, quoi, valeur avant et après (étape 9).
5. **Seul `tools/` joint internet.** Le code qui appelle des services publics vit exclusivement dans `tools/offline-bundle/`, exécuté sur un poste connecté. Il n'est jamais importé par l'application (test dédié) et n'entre pas dans le build. Le serveur ne reçoit que des paquets vérifiés par somme de contrôle (voir [`docs/offline-bundle.md`](offline-bundle.md)).
6. **La carte ne sort jamais de l'origine.** MapLibre, PMTiles et `world-atlas` sont des paquets npm embarqués. Le fond, les polices et les symboles sont servis par `/api/map-assets`, avec des adresses construites à l'exécution depuis `window.location.origin`, jamais écrites en dur.
7. **L'enrichissement ne remplit que les champs vides.** Une valeur publique différente d'une valeur existante est une **divergence** : listée dans le rapport, jamais appliquée. Un champ vidé volontairement dans l'interface est préservé. Les données publiques sans champ métier vont dans `site_public_data`.
8. **Sécurité par défaut.** En-têtes de sécurité sur toutes les réponses, CSP à nonce par requête (pas de `'unsafe-inline'` pour les scripts), variables d'environnement validées au démarrage, aucun secret dans le code.

## Stack

| Brique | Justification |
|---|---|
| Next.js 15 (App Router) | Rendu serveur et routes API dans un seul service Node, facile à déployer en conteneur `standalone`. |
| TypeScript strict (+ `noUncheckedIndexedAccess`) | Les erreurs de données (tableur hétérogène) sont détectées à la compilation plutôt qu'en production. |
| Tailwind CSS v4 (CSS-first) | Tokens de design déclarés une seule fois dans `@theme`, sans fichier de configuration JS. |
| shadcn/ui (Radix) | Composants accessibles copiés dans le dépôt : aucune dépendance distante, entièrement adaptables à nos tokens. |
| Geist (paquet npm `geist`) | Polices auto-hébergées, servies par l'application. |
| lucide-react | Icônes embarquées dans le bundle, sans police d'icônes externe. |
| zod | Validation des variables d'environnement, puis des imports et formulaires. |
| Prisma 7 + SQL Server | SQL Server est la base standard de la DSI ; Prisma apporte schéma typé et migrations. Générateur `prisma-client` et adaptateur `@prisma/adapter-mssql` (pilote `mssql`/`tedious`, sans moteur binaire à l'exécution). |
| MapLibre GL (étape 6) | Carte vectorielle open source, fonctionnant avec des tuiles servies localement. |
| Vitest + Testing Library | Tests unitaires rapides, compatibles ESM et TypeScript. |
| Playwright (Chromium) | Tests e2e réalistes, dont le contrôle « zéro requête externe » et les en-têtes. |
| Docker Compose | SQL Server local identique à la cible ; l'instance DSI le remplace sans changement de code (seule `DATABASE_URL` change). |

## Sécurité HTTP

- `next.config.ts` : `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Permissions-Policy` restrictive, `Cross-Origin-Opener-Policy: same-origin`, `poweredByHeader: false`.
- `src/middleware.ts` + `src/lib/csp.ts` : nonce aléatoire par requête et CSP. Next.js applique le nonce à ses propres scripts ; le layout lit les en-têtes de la requête, ce qui rend chaque page dynamique (condition nécessaire pour les nonces).
- `style-src` autorise `'unsafe-inline'` : les attributs `style="…"` rendus côté serveur (positionnement Radix, MapLibre) ne peuvent pas porter de nonce. Les styles restent limités à la même origine et ne permettent pas d'exécuter du code.
- `upgrade-insecure-requests` n'est pas utilisé : le serveur interne peut être servi en HTTP, et cette directive casserait le chargement des ressources.
- En développement uniquement, `'unsafe-eval'` est ajouté à `script-src`, car l'outillage React en a besoin.

## Organisation du code

| Dossier | Contenu | Règle |
|---|---|---|
| `src/domain/` | Règles métier pures : listes de valeurs (zod), catalogue d'indicateurs, calculs dérivés, dates | Aucun accès base ni réseau, importable côté client comme côté serveur |
| `src/server/` | Accès à la base (`db`, fabrique Prisma, sonde de santé) | `import "server-only"` : jamais importé côté client |
| `src/server/import/` | Import du tableur : fonctions pures (analyse, en-têtes, correspondance, contrôles, plan) et un seul module d'écriture (`writer.ts`) | Écrit toujours via `runWithAuditContext({ source: "import", batchId })` |
| `src/server/enrichment/` | Application d'un `enrichment.json` : plan pur (`plan.ts`), lecture de l'état, un seul module d'écriture, rapport ; export des sites | Écrit via `runWithAuditContext({ source: "enrichment", batchId })` ; ne remplit que les champs vides |
| `src/server/map/`, `src/server/http/range.ts` | Installation du paquet cartographique (vérification SHA-256, bascule atomique, retour arrière) ; service des fichiers par plages d'octets (`/api/map-assets`) | Fichiers uniquement sous `STORAGE_ROOT/map/` |
| `src/domain/compliance/` | Moteur de conformité : règles déclaratives, complétude, évaluation (voir [`docs/compliance-rules.md`](compliance-rules.md)) | Pur ; la date du jour est injectée ; aucun statut stocké |
| `src/server/map/sites.ts`, `transform.ts` | Données de la carte : une requête, puis une transformation pure en DTO minimal | Aucun loyer, montant ni donnée de bail détaillée dans le DTO (test sur les clés) |
| `src/components/map/` | Carte nationale MapLibre : styles (fond complet et de secours), couches des sites, panneaux | Chargée en import dynamique sur `/` uniquement |
| `src/components/brand/` | Logo (symbole et nom) | Couleurs de marque réservées au logo |
| `src/lib/` | Utilitaires transverses (env, formats, statut, CSP) | — |
| `tools/offline-bundle/` | Outil de préparation du paquet hors ligne (poste connecté) : client HTTP partagé, fournisseurs, carte, manifeste | **Seul code autorisé à joindre internet.** Jamais importé par `src/`, exclu du build, mais couvert par le typecheck, le lint et les tests |
| `generated/prisma/` | Client Prisma généré | Hors de `src/` : n'est pas analysé par `check:offline` (ses commentaires contiennent des liens de documentation, jamais chargés) |

## Authentification et audit

Détails et justifications : [`docs/security.md`](security.md).

- **Comptes locaux** et **sessions opaques en base** : un jeton aléatoire de 32 octets dans un cookie `HttpOnly`, dont seule l'empreinte SHA-256 est stockée dans `sessions`. Expiration par inactivité (glissante, renouvelée au plus toutes les 5 minutes) et expiration absolue. Mots de passe hachés en argon2id (paramètres OWASP).
- **Deux niveaux de contrôle** :
  - le middleware vérifie seulement la présence du cookie, pour rediriger vers `/login` ou répondre 401 sur `/api/*` ;
  - la couche d'accès `src/server/auth/current-user.ts` valide la session en base à chaque requête (mise en cache par requête). Elle est appelée par le layout `(app)`, les pages restreintes, les Server Actions et `withApiAuth()` pour les route handlers.
- **Rôles** : matrice unique rôle → actions dans `permissions.ts` (`can`, `assertCan` → `ForbiddenError`, 403).
- **Journal d'audit automatique** : extension du client Prisma. Chaque écriture sur un modèle métier produit des lignes `audit_logs` (auteur, source, lot, champ, avant, après) **dans la même transaction**. Le contexte (auteur, source) passe par `AsyncLocalStorage` (`runWithAuditContext`). Les écritures imbriquées et les opérations en masse sont refusées sur les modèles audités, et le journal est en ajout seul via le client.
- `db` (`src/server/db.ts`) est le client **audité** ; `createPrismaClient()` (non audité) est réservé aux jeux de données de test et à la maintenance.

## Coque de l'application

`AppShell` (dans le layout protégé `(app)/layout.tsx`, qui reçoit l'utilisateur courant) contient le lien d'évitement, `NavRail` (rail de navigation, filtré par rôle, avec `UserMenu` en bas) et `CommandBar` (barre de recherche et palette Ctrl+K). Chaque page rend son contenu dans `<main>` :
- `/` rend `MapStage`, plein écran en arrière-plan. Son emplacement `data-slot="map-canvas"` recevra le canvas MapLibre à l'étape 6 (via `children`) ; les panneaux flottants passent par `overlay` ;
- les autres pages utilisent `PageContainer`, qui laisse la place au rail et à la barre de commande.

## Carte nationale

- **Chargement** :
  - la page serveur `/` calcule les données de la carte avec `getMapSites(todayDateOnly())` et lit le manifeste installé ;
  - elle passe le tout au composant client `NationalMapLoader`, qui charge `NationalMap` par `next/dynamic` (`ssr: false`) ;
  - MapLibre, PMTiles, `@protomaps/basemaps` et la feuille de style de MapLibre vivent dans ce seul morceau. Un test e2e vérifie que `/login` n'en télécharge aucun octet.
  - Le protocole `pmtiles://` est enregistré une seule fois (compteur de références) et retiré au démontage.
- **Fond complet ou de secours** :
  - le fond complet est utilisé si le manifeste installé déclare `france.pmtiles`, les symboles et une plage de glyphes non vide (`resolveMapAssets`, mêmes données que `GET /api/map-assets/status`) ;
  - sinon, le style de secours est construit localement à partir de `world-atlas` (importé dynamiquement, seulement dans ce cas), sans aucune requête de police ;
  - les images aériennes s'ajoutent dans les deux cas si `ortho-sites.pmtiles` est installé.
- **DTO minimal** (`src/domain/map-dto.ts`) :
  - pour chaque point : identifiant, code, nom, ville, département, région, activité, statut, rang, au plus 3 raisons, nombre de raisons, complétude, surface de référence, présence d'une emprise ;
  - pour chaque emprise : statut et hauteur ;
  - la liste des sites non localisés, les décomptes, et toutes les raisons par site pour `SitePeek` ;
  - **aucun loyer, montant ni donnée de bail détaillée**. Le même DTO est servi par `GET /api/map/sites` (permission `site:read`).
- **URL** : la sélection est reflétée par `?site=CODE`, écrit avec `history.replaceState`. Cela n'ajoute aucune entrée d'historique et ne relance pas le rendu serveur de la page, contrairement à `router.replace`.
- **Robustesse** :
  - WebGL indisponible : `EmptyState` avec accès à la liste des sites ;
  - erreurs de ressources : journalisées en développement ;
  - `ResizeObserver` pour suivre la taille ;
  - nettoyage complet au démontage (`map.remove()`, marqueurs, `requestAnimationFrame`).
- **Crochet de test** : `window.__vigieMap = { ready, selectedCode }` existe en développement, ou si le serveur démarre avec `VIGIE_E2E_TEST_HOOKS=1` (suite e2e uniquement). Un test e2e démarre le même build sans cette variable et vérifie que le crochet est absent.

## Découpage en 12 étapes

1. **Initialisation** : projet, système de design, coque, Docker, chaîne qualité *(terminée)*.
2. **Modèle de données** : Prisma, schéma SQL Server, migrations, jeu de démonstration, vérification de la base dans `/api/health` *(terminée, voir `docs/data-model.md`)*.
3. **Authentification, rôles et journal d'audit automatique** *(terminée, voir `docs/security.md`)*.
4. **Import du tableur** : correspondance des ~200 colonnes, contrôles, rapport d'import *(terminée, voir `docs/import.md`)*.
5. **Enrichissement et ressources carto** : paquet hors ligne préparé sur un poste connecté (données publiques, fond de carte, orthophotos), installé et appliqué sur le serveur *(terminée, voir `docs/offline-bundle.md`)*.
6. **Carte nationale** : MapLibre, statut de conformité calculé, aperçu d'un site *(terminée, voir « Carte nationale » ci-dessous et `docs/compliance-rules.md`)*.
7. **Filtres et supervision**.
8. **Fiche entrepôt**.
9. **Édition tracée** : modifications avec journal d'audit.
10. **Volume 3D et plan**.
11. **Exploitation** : sauvegardes, journaux, supervision technique.
12. **Recette et déploiement** : conteneur, livraison à la DSI.
