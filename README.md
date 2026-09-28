# Atlas

Atlas est l'outil interne de Carrefour Property qui centralise les données des entrepôts logistiques en France métropolitaine (moins de 200 sites).
Il remplace un tableur d'environ 200 colonnes et des documents isolés par un référentiel unique, consultable depuis une carte nationale.
L'application fonctionne **sans aucune dépendance internet à l'exécution** : elle tourne sur un serveur interne, sur un réseau fermé.

## Prérequis

| Outil | Version | Remarque |
|---|---|---|
| Node.js | 22 LTS | voir `.nvmrc` (`nvm use`) |
| pnpm | 10 | via corepack : `corepack enable` (version figée dans `packageManager`) |
| Docker Desktop | récent | SQL Server 2022 tourne dans un conteneur en local |

**Apple Silicon (M1/M2/M3…)** : l'image SQL Server n'existe qu'en `linux/amd64`. Dans Docker Desktop, ouvrir *Settings → General* et activer **« Use Rosetta for x86_64/amd64 emulation on Apple Silicon »**, puis redémarrer Docker Desktop. Le `docker-compose.yml` force déjà `platform: linux/amd64`.

## Démarrage

```bash
cp .env.example .env        # puis changer le mot de passe si besoin (dans les deux variables)
corepack enable
pnpm install                # génère aussi le client Prisma (postinstall)
pnpm db:up                  # démarre SQL Server, attend le healthcheck, crée la base « atlas »
pnpm db:migrate             # applique les migrations
pnpm db:seed                # 10 sites de démonstration fictifs (idempotent)
pnpm dev                    # http://localhost:3000
```

Vérifier la base (`db:sql` charge `.env` et lance sqlcmd dans le conteneur) :

```bash
pnpm db:sql -Q "SELECT COUNT(*) FROM sites; SELECT COUNT(*) FROM annual_metrics;"
pnpm db:sql                 # session sqlcmd interactive sur la base atlas
```

Tests de bout en bout (première fois : installer Chromium pour Playwright ; la base doit tourner) :

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Pages utiles : `/` (carte), `/dev/design` (vitrine du système de design, hors production), `/api/health` (état de l'application et de la base ; HTTP 503 si la base est injoignable).

## Base de données

- Schéma : `prisma/schema.prisma` ; documentation : [`docs/data-model.md`](docs/data-model.md) ; correspondance avec le tableur : [`docs/source-mapping.md`](docs/source-mapping.md).
- Prisma 7 : générateur `prisma-client` (client généré dans `generated/prisma/`, non commité) et adaptateur `@prisma/adapter-mssql`. La configuration de la CLI est dans `prisma.config.ts`.
- Tout accès à la base vit sous `src/server/` (`import "server-only"`). Le singleton est `db` dans `src/server/db.ts`.

### Faire évoluer le schéma

1. Modifier `prisma/schema.prisma`.
2. `pnpm db:migrate --name description_courte` : crée la migration dans `prisma/migrations/`, l'applique en local et vérifie l'absence de dérive.
   Pour relire ou compléter le SQL avant de l'appliquer (contrainte `CHECK`, par exemple), utiliser `pnpm db:migrate --create-only --name …`, modifier le fichier, puis relancer `pnpm db:migrate`.
3. `pnpm db:generate` si le client n'a pas été régénéré.
4. Commiter le schéma **et** le dossier de migration.
5. Sur un serveur (recette, production) : `pnpm db:deploy`, qui applique les migrations en attente sans jamais réinitialiser.

> Les contraintes `CHECK` (`users.role`, `audit_logs.action`, `audit_logs.source`, `annual_metrics.source`) sont écrites à la main dans la migration initiale : toute modification de ces listes demande une nouvelle migration, en plus de `src/domain/enums.ts`.

`pnpm db:reset` (développement uniquement) supprime la base, rejoue les migrations puis lance le seed. Il demande de taper le nom de la base pour confirmer (`--yes` pour ne pas demander). Il refuse de s'exécuter si `NODE_ENV=production`.

### Base de test (intégration)

`pnpm test:integration` travaille sur une base **distincte**, `atlas_test`, sur le même serveur. Le `globalSetup` la réinitialise à chaque lancement avec `prisma migrate reset --force` (elle est créée si elle n'existe pas, puis toutes les migrations sont rejouées). Aucune préparation manuelle n'est nécessaire, à part `pnpm db:up`.

- La chaîne de connexion est dérivée de `DATABASE_URL` en remplaçant `database=…` par `database=atlas_test`. On peut la forcer avec `TEST_DATABASE_URL`.
- Par sécurité, le setup refuse toute base dont le nom ne se termine pas par `_test`.
- Prisma 7 bloque `migrate reset` lorsqu'il détecte un agent IA (Claude Code, Cursor…) et demande le consentement explicite de l'utilisateur. Lancée par un humain ou par la CI, la commande fonctionne normalement.

## Scripts

| Script | Rôle |
|---|---|
| `pnpm dev` | Serveur de développement Next.js |
| `pnpm build` | Build de production (`output: "standalone"`) |
| `pnpm start` | Démarre le build de production |
| `pnpm lint` | ESLint (zéro avertissement toléré) |
| `pnpm typecheck` | Vérification TypeScript (`tsc --noEmit`) |
| `pnpm test` | Tests unitaires Vitest |
| `pnpm test:watch` | Vitest en mode watch |
| `pnpm test:e2e` | Tests Playwright (Chromium) sur un build de production ; la base doit tourner |
| `pnpm test:integration` | Tests d'intégration Vitest sur la base `atlas_test` (recréée à chaque lancement) |
| `pnpm check:offline` | Échoue si une URL `http(s)://` externe apparaît dans `src/` ou `public/` |
| `pnpm db:up` | `docker compose up` + attente du healthcheck + création idempotente de la base `atlas` |
| `pnpm db:down` | Arrête SQL Server (le volume `atlas-mssql-data` est conservé) |
| `pnpm db:generate` | Génère le client Prisma dans `generated/prisma/` (lancé aussi par `pnpm install`) |
| `pnpm db:migrate` | `prisma migrate dev` : crée ou applique les migrations en développement |
| `pnpm db:deploy` | `prisma migrate deploy` : applique les migrations en attente (serveurs) |
| `pnpm db:reset` | Développement uniquement, avec confirmation : recrée la base, rejoue les migrations, lance le seed |
| `pnpm db:seed` | Charge les 10 sites de démonstration fictifs (idempotent) |
| `pnpm db:studio` | Ouvre Prisma Studio (navigateur local) |
| `pnpm db:sql` | sqlcmd dans le conteneur, `.env` chargé automatiquement (`-Q "…"` pour une requête, sans argument pour une session interactive) |
| `pnpm verify` | Enchaîne typecheck, lint, test, check:offline et build |

## Variables d'environnement

Validées au démarrage par `src/lib/env.ts` (zod) : le serveur s'arrête immédiatement si l'une d'elles manque ou est invalide, avec un message qui la nomme.

| Variable | Contrainte |
|---|---|
| `MSSQL_SA_PASSWORD` | Mot de passe `sa` du conteneur (utilisé par Docker uniquement) |
| `DATABASE_URL` | Doit commencer par `sqlserver://` |
| `APP_URL` | URL valide |
| `TEST_DATABASE_URL` | Facultative : base des tests d'intégration (nom terminé par `_test`) |

## Arborescence

```
.
├── .env.example              # modèle de configuration (le .env n'est jamais commité)
├── .nvmrc                    # Node 22
├── docker-compose.yml        # SQL Server 2022 + job d'initialisation de la base
├── prisma.config.ts          # configuration de la CLI Prisma 7
├── prisma/
│   ├── schema.prisma         # modèle de données
│   ├── migrations/           # migrations SQL (commitées)
│   └── seed.ts               # 10 sites de démonstration fictifs
├── generated/prisma/         # client Prisma généré (non commité)
├── docs/
│   ├── architecture.md       # principes, stack, découpage en 12 étapes
│   ├── data-model.md         # diagramme, rôle des tables, règles, modules futurs
│   ├── source-mapping.md     # colonne du tableur → table.champ
│   └── design-system.md      # tokens, règles des couleurs de statut, accessibilité
├── scripts/
│   ├── check-no-external.ts  # garde anti-dépendance externe
│   ├── db-up.sh              # démarrage de la base (pnpm db:up)
│   ├── db-sql.sh             # sqlcmd avec .env chargé (pnpm db:sql)
│   └── db-reset.ts           # réinitialisation confirmée (pnpm db:reset)
├── src/
│   ├── app/                  # routes (App Router)
│   │   ├── globals.css       # tokens de design (@theme) + mapping shadcn
│   │   ├── layout.tsx        # <html lang="fr" class="dark">, polices Geist, coque
│   │   ├── page.tsx          # carte (placeholder jusqu'à l'étape 6)
│   │   ├── sites/ supervision/ admin/   # pages placeholder
│   │   ├── dev/design/       # vitrine du design system (404 en production)
│   │   ├── api/health/       # sonde de vie
│   │   └── not-found.tsx
│   ├── components/
│   │   ├── ui/               # composants shadcn/ui, adaptés aux tokens
│   │   ├── shell/            # AppShell, NavRail, CommandBar, MapStage, PageContainer
│   │   ├── panel/            # Panel (panneau flottant verre)
│   │   ├── status/           # StatusDot, StatusBadge, StatusLegend
│   │   └── empty/            # EmptyState
│   ├── config/navigation.ts  # entrées du rail
│   ├── domain/               # règles métier pures : enums (zod), catalogue d'indicateurs, calculs dérivés, dates
│   ├── lib/                  # env, format, status, csp, utils
│   ├── server/               # accès base (server-only) : db (singleton), prisma (fabrique), health
│   ├── instrumentation.ts    # validation de l'environnement au démarrage
│   └── middleware.ts         # nonce + Content-Security-Policy
├── tests/
│   ├── unit/                 # Vitest + Testing Library
│   ├── integration/          # Vitest sur SQL Server (base atlas_test)
│   └── e2e/                  # Playwright
├── vitest.config.ts
├── vitest.integration.config.ts
└── playwright.config.ts
```
