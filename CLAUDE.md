# CLAUDE.md — consignes pour Claude Code

Lire d'abord [`docs/reprise.md`](docs/reprise.md) : état du projet, historique, décisions et prochaines étapes.

## Le projet en bref

**Vigie** (anciennement « Atlas ») : outil interne de Carrefour Property qui centralise les données de moins de 200 entrepôts logistiques en France métropolitaine. Il remplace un tableur d'environ 200 colonnes. Next.js 15 (App Router), TypeScript strict, Tailwind v4 CSS-first, shadcn/ui, Prisma 7 + SQL Server (Docker en local), MapLibre GL, Vitest, Playwright. Desktop uniquement.

## Règles à respecter

- **Langue** : interface, documentation et réponses à l'utilisatrice en **français**. Code, noms de fichiers, identifiants et messages de commit en **anglais**.
- **Hors ligne** : le serveur n'appelle jamais internet. Aucun CDN, aucune télémétrie, polices auto-hébergées. `pnpm check:offline` refuse toute URL externe dans `src/` et `public/`. **Seule exception assumée** : le fond de carte IGN (`data.geopf.fr`), chargé par le navigateur quand `MAP_BASEMAP=ign`, autorisé seulement dans `img-src` et `connect-src` de la CSP. Seul `tools/offline-bundle/` peut joindre internet (poste connecté), jamais importé par `src/`.
- **Couleurs de statut réservées** : vert, ambre, rouge (et gris « non évalué ») ne servent qu'au statut de conformité, toujours doublés d'un libellé. Aucun bouton, décor ou graphique non-statut ne les utilise. Pas de variante `destructive` rouge.
- **Audit** : toute écriture métier passe par le client audité `db` (`src/server/db.ts`) dans un `runWithAuditContext`. On ne supprime **jamais** de ligne de `audit_logs` (un test le vérifie).
- **Accès base** uniquement sous `src/server/` (`import "server-only"`). `src/domain/` reste pur (ni base ni réseau).
- **Schéma** : toute modification de `prisma/schema.prisma` s'accompagne d'une migration commitée (`pnpm db:migrate --name …`), puis `pnpm fields:lengths` si des colonnes texte changent.
- **Variables d'environnement** validées par zod dans `src/lib/env.ts` ; aucun secret en dur ; `.env` jamais commité.
- **Accessibilité** : contraste AA, `:focus-visible` visible, navigation clavier, `aria-label` sur les boutons-icônes, `prefers-reduced-motion` respecté.
- JSDoc sur les fonctions exportées de `src/lib/` et sur les props des composants.
- Ne pas créer de pull request sans demande explicite.

## Commandes

```bash
cp .env.example .env && corepack enable && pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm user:create --email admin@vigie.local --name "Admin Démo" --role admin
pnpm dev
```

Avant de pousser : `pnpm verify` (typecheck, lint sans avertissement, tests unitaires, check:offline, build). Avec la base : `pnpm test:integration` (base `vigie_test`) et `pnpm test:e2e` (base `vigie_e2e`, mode carte hors ligne). Prisma 7 refuse `migrate reset` lancé par un agent IA sans consentement explicite de l'utilisatrice : le lui demander.

Documentation détaillée : `README.md` et `docs/` (architecture, modèle de données, import, sécurité, conformité, filtres, fiche, édition, plans, paquet hors ligne, design system).
