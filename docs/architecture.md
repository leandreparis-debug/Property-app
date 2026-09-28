# Architecture

## Principes

1. **Fonctionnement hors internet.** L'application tourne sur un serveur interne, sur un réseau fermé. Polices, tuiles et styles cartographiques, images et scripts sont servis par l'application elle-même. Aucun CDN, aucun appel sortant, aucune télémétrie. Trois garde-fous :
   - une Content-Security-Policy qui n'autorise que `'self'` (plus `data:`/`blob:` pour les images et `blob:` pour les workers) ;
   - `pnpm check:offline`, qui refuse toute URL `http(s)://` externe dans `src/` et `public/` ;
   - un test e2e qui intercepte chaque requête du navigateur et vérifie qu'elle reste sur l'origine de l'application.
2. **La base de données est la source de vérité.** Le tableur n'est qu'une source d'import (étape 4). Toute donnée affichée provient de SQL Server.
3. **Fichiers sur disque, métadonnées en base.** Plans, photos et documents sont stockés sur le système de fichiers du serveur ; la base conserve leurs métadonnées (chemin, type, taille, empreinte, auteur, date).
4. **Audit systématique.** Chaque modification de donnée est tracée : qui, quand, quoi, valeur avant et après (étape 9).
5. **Sécurité par défaut.** En-têtes de sécurité sur toutes les réponses, CSP à nonce par requête (pas de `'unsafe-inline'` pour les scripts), variables d'environnement validées au démarrage, aucun secret dans le code.

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
| Prisma + SQL Server (étape 2) | SQL Server est la base standard de la DSI ; Prisma apporte schéma typé et migrations. |
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

## Coque de l'application

`AppShell` (dans le layout racine) contient le lien d'évitement, `NavRail` (rail de navigation) et `CommandBar` (barre de recherche et palette Ctrl+K). Chaque page rend son contenu dans `<main>` :
- `/` rend `MapStage`, plein écran en arrière-plan. Son emplacement `data-slot="map-canvas"` recevra le canvas MapLibre à l'étape 6 (via `children`) ; les panneaux flottants passent par `overlay` ;
- les autres pages utilisent `PageContainer`, qui laisse la place au rail et à la barre de commande.

## Découpage en 12 étapes

1. **Initialisation** : projet, système de design, coque, Docker, chaîne qualité *(cette étape)*.
2. **Modèle de données** : Prisma, schéma SQL Server, migrations, vérification de la base dans `/api/health`.
3. **Authentification et rôles**.
4. **Import du tableur** : correspondance des ~200 colonnes, contrôles, rapport d'import.
5. **Enrichissement et ressources carto** : géocodage hors ligne, tuiles et styles servis localement.
6. **Carte nationale** : MapLibre, calcul du statut de conformité.
7. **Filtres et supervision**.
8. **Fiche entrepôt**.
9. **Édition tracée** : modifications avec journal d'audit.
10. **Volume 3D et plan**.
11. **Exploitation** : sauvegardes, journaux, supervision technique.
12. **Recette et déploiement** : conteneur, livraison à la DSI.
