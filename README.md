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
pnpm install
pnpm db:up                  # démarre SQL Server, attend le healthcheck, crée la base « atlas »
pnpm dev                    # http://localhost:3000
```

Vérifier que la base existe :

```bash
set -a; source .env; set +a
docker compose exec db /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" \
  -Q "SELECT name FROM sys.databases WHERE name = 'atlas'"
```

Tests de bout en bout (première fois : installer Chromium pour Playwright) :

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Pages utiles : `/` (carte), `/dev/design` (vitrine du système de design, hors production), `/api/health`.

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
| `pnpm test:e2e` | Tests Playwright (Chromium) sur un build de production |
| `pnpm check:offline` | Échoue si une URL `http(s)://` externe apparaît dans `src/` ou `public/` |
| `pnpm db:up` | `docker compose up` + attente du healthcheck + création idempotente de la base `atlas` |
| `pnpm db:down` | Arrête SQL Server (le volume `atlas-mssql-data` est conservé) |
| `pnpm verify` | Enchaîne typecheck, lint, test, check:offline et build |

## Variables d'environnement

Validées au démarrage par `src/lib/env.ts` (zod) : le serveur s'arrête immédiatement si l'une d'elles manque ou est invalide, avec un message qui la nomme.

| Variable | Contrainte |
|---|---|
| `MSSQL_SA_PASSWORD` | Mot de passe `sa` du conteneur (utilisé par Docker uniquement) |
| `DATABASE_URL` | Doit commencer par `sqlserver://` |
| `APP_URL` | URL valide |

## Arborescence

```
.
├── .env.example              # modèle de configuration (le .env n'est jamais commité)
├── .nvmrc                    # Node 22
├── docker-compose.yml        # SQL Server 2022 + job d'initialisation de la base
├── docs/
│   ├── architecture.md       # principes, stack, découpage en 12 étapes
│   └── design-system.md      # tokens, règles des couleurs de statut, accessibilité
├── scripts/
│   ├── check-no-external.ts  # garde anti-dépendance externe
│   └── db-up.sh              # démarrage de la base (pnpm db:up)
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
│   ├── lib/                  # env, format, status, csp, utils
│   ├── instrumentation.ts    # validation de l'environnement au démarrage
│   └── middleware.ts         # nonce + Content-Security-Policy
├── tests/
│   ├── unit/                 # Vitest + Testing Library
│   └── e2e/                  # Playwright
├── vitest.config.ts
└── playwright.config.ts
```
