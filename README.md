# Vigie

Vigie est l'outil interne de Carrefour Property qui centralise les données des entrepôts logistiques en France métropolitaine (moins de 200 sites).
Il remplace un tableur d'environ 200 colonnes et des documents isolés par un référentiel unique, consultable depuis une carte nationale.
L'application fonctionne **sans aucune dépendance internet à l'exécution** : elle tourne sur un serveur interne, sur un réseau fermé.

## Prérequis

| Outil | Version | Remarque |
|---|---|---|
| Node.js | 22 LTS | voir `.nvmrc` (`nvm use`) |
| pnpm | 10 | via corepack : `corepack enable` (version figée dans `packageManager`) |
| Docker Desktop | récent | SQL Server 2022 tourne dans un conteneur en local |

**Apple Silicon (M1/M2/M3…)** : l'image SQL Server n'existe qu'en `linux/amd64`. Dans Docker Desktop, ouvrir *Settings → General* et activer **« Use Rosetta for x86_64/amd64 emulation on Apple Silicon »**, puis redémarrer Docker Desktop. Le `docker-compose.yml` force déjà `platform: linux/amd64`.

## Renommage Atlas → Vigie (poste de développement existant)

Le projet s'appelait « Atlas » jusqu'à l'étape 4. La base s'appelle désormais `vigie` (tests : `vigie_test`), le volume Docker `vigie-mssql-data`, le cookie de session `vigie_session` et les comptes de test sont en `@vigie.local`. Sur un poste déjà installé :

```bash
docker rm -f atlas-db                 # ancien conteneur (le volume atlas-mssql-data n'est pas supprimé)
# Dans .env : remplacer « database=atlas » par « database=vigie » dans DATABASE_URL
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm user:create --email admin@vigie.local --name "Admin Démo" --role admin
pnpm import:spreadsheet --file samples/vigie-sample.xlsx --actor admin@vigie.local   # facultatif
# Une fois la nouvelle base vérifiée : docker volume rm atlas-mssql-data
```

Les sessions ouvertes sous l'ancien nom de cookie sont perdues : il suffit de se reconnecter.

## Démarrage

```bash
cp .env.example .env        # puis changer le mot de passe si besoin (dans les deux variables)
corepack enable
pnpm install                # génère aussi le client Prisma (postinstall)
pnpm db:up                  # démarre SQL Server, attend le healthcheck, crée la base « vigie »
pnpm db:migrate             # applique les migrations
pnpm db:seed                # 10 sites de démonstration fictifs (idempotent)
pnpm user:create --email admin@vigie.local --name "Admin Démo" --role admin
pnpm dev                    # http://localhost:3000 → page de connexion
```

## Comptes utilisateurs

L'application exige une connexion (comptes locaux, sessions en base, trois rôles). Voir [`docs/security.md`](docs/security.md).

**Premier administrateur** : `pnpm user:create --email admin@vigie.local --name "Admin Démo" --role admin`. Le mot de passe est demandé deux fois, en saisie masquée ; il n'est jamais passé en argument. Politique : 12 à 128 caractères, absent de la liste des mots de passe courants, et sans la partie de l'email avant `@`.

| Commande | Effet |
|---|---|
| `pnpm user:create --email … --name "…" --role admin\|editor\|viewer` | Crée un compte |
| `pnpm user:reset-password --email …` | Nouveau mot de passe (demandé deux fois) ; déverrouille le compte et ferme toutes ses sessions |
| `pnpm user:set-active --email … --active=false` | Désactive le compte et ferme ses sessions (`--active=true` pour réactiver) |

Rôles : **Administrateur** (tout), **Éditeur** (modification des sites, équipements, documents, plans), **Lecteur** (consultation et export). Ces commandes sont tracées dans le journal d'audit avec la source `system`.

Vérifier la base (`db:sql` charge `.env` et lance sqlcmd dans le conteneur) :

```bash
pnpm db:sql -Q "SELECT COUNT(*) FROM sites; SELECT COUNT(*) FROM annual_metrics;"
pnpm db:sql                 # session sqlcmd interactive sur la base vigie
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

`pnpm test:integration` travaille sur une base **distincte**, `vigie_test`, sur le même serveur. Le `globalSetup` la réinitialise à chaque lancement avec `prisma migrate reset --force` (elle est créée si elle n'existe pas, puis toutes les migrations sont rejouées). Aucune préparation manuelle n'est nécessaire, à part `pnpm db:up`.

- La chaîne de connexion est dérivée de `DATABASE_URL` en remplaçant `database=…` par `database=vigie_test`. On peut la forcer avec `TEST_DATABASE_URL`.
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
| `pnpm test:e2e` | Tests Playwright (Chromium) sur un build de production ; la base doit tourner. Le `globalSetup` crée (ou réinitialise) deux comptes de test, `e2e-admin@vigie.local` et `e2e-viewer@vigie.local`, dans la base de `.env` |
| `pnpm test:integration` | Tests d'intégration Vitest sur la base `vigie_test` (recréée à chaque lancement) |
| `pnpm check:offline` | Échoue si une URL `http(s)://` externe apparaît dans `src/` ou `public/` |
| `pnpm db:up` | `docker compose up` + attente du healthcheck + création idempotente de la base `vigie` |
| `pnpm db:down` | Arrête SQL Server (le volume `vigie-mssql-data` est conservé) |
| `pnpm db:generate` | Génère le client Prisma dans `generated/prisma/` (lancé aussi par `pnpm install`) |
| `pnpm db:migrate` | `prisma migrate dev` : crée ou applique les migrations en développement |
| `pnpm db:deploy` | `prisma migrate deploy` : applique les migrations en attente (serveurs) |
| `pnpm db:reset` | Développement uniquement, avec confirmation : recrée la base, rejoue les migrations, lance le seed |
| `pnpm db:seed` | Charge les 10 sites de démonstration fictifs (idempotent) |
| `pnpm db:studio` | Ouvre Prisma Studio (navigateur local) |
| `pnpm db:sql` | sqlcmd dans le conteneur, `.env` chargé automatiquement (`-Q "…"` pour une requête, sans argument pour une session interactive) |
| `pnpm user:create` | Crée un compte (voir « Comptes utilisateurs ») |
| `pnpm user:reset-password` | Change le mot de passe d'un compte |
| `pnpm user:set-active` | Active ou désactive un compte |
| `pnpm import:spreadsheet` | Importe le tableur `.xlsx` (administrateur ; `--dry-run` d'abord) — voir « Import du tableur » |
| `pnpm sample:build` | Régénère le fichier de test fictif `samples/vigie-sample.xlsx` |
| `pnpm enrichment:export-sites` | Exporte code, nom, adresse et coordonnées des sites actifs pour le poste connecté (administrateur) |
| `pnpm bundle:probe` | **Poste connecté** : enregistre les réponses brutes des services publics pour quelques sites (`probe-output/`) |
| `pnpm bundle:build` | **Poste connecté** : prépare `vigie-offline-bundle-AAAAMMJJ/` (enrichissement, fond de carte, orthophotos) ; `--fixtures` fonctionne sans réseau |
| `pnpm map:install` | Vérifie un paquet et installe sa carte dans `STORAGE_ROOT/map/` (`--rollback` : version précédente) |
| `pnpm enrichment:apply` | Applique `enrichment.json` : ne remplit que les champs vides, liste les divergences (`--dry-run` d'abord) |
| `pnpm verify` | Enchaîne typecheck, lint, test, check:offline et build |

## Import du tableur

Procédure complète, anomalies et décisions : [`docs/import.md`](docs/import.md).

```bash
# 1. Toujours simuler d'abord (aucune écriture) et lire le rapport
pnpm import:spreadsheet --file referentiel.xlsx --actor admin@vigie.local --dry-run
# 2. Import réel (rejouable : un second passage ne modifie rien)
pnpm import:spreadsheet --file referentiel.xlsx --actor admin@vigie.local
```

- `--actor` : email d'un **administrateur actif** (auteur de toutes les modifications dans le journal d'audit).
- Options : `--sheet <nom>`, `--activity-year <aaaa>` (année des colonnes ETP, CA et colis), `--force` (écrase aussi les champs modifiés dans l'application, après confirmation).
- Rapport : `STORAGE_ROOT/imports/<lot>/` (`report.csv` lisible dans Excel, `changes.csv`, `summary.json`).
- Codes de sortie : `0` succès, `2` succès partiel (lignes rejetées), `1` échec.

**Fichier de test** : `samples/vigie-sample.xlsx` (données entièrement fictives, toutes les colonnes réelles et une vingtaine de cas sales) se régénère avec `pnpm sample:build` :

```bash
pnpm import:spreadsheet --file samples/vigie-sample.xlsx --actor admin@vigie.local --dry-run
```

## Paquet hors ligne (enrichissement et carte)

Le serveur ne joint jamais internet. Les données publiques et la carte sont préparées sur un poste connecté par `tools/offline-bundle/`, puis installées. Procédure complète, données qui sortent du réseau, licences, taille, retour arrière : [`docs/offline-bundle.md`](docs/offline-bundle.md).

```bash
# Serveur : exporter les sites (code, nom, adresse, coordonnées uniquement)
pnpm enrichment:export-sites --out sites.json --actor admin@vigie.local
# Poste connecté (pmtiles requis pour la carte) — ou --fixtures pour un essai sans réseau
pnpm bundle:build --sites sites.json --out .
# Serveur : installer la carte, puis simuler et appliquer l'enrichissement
pnpm map:install --bundle vigie-offline-bundle-AAAAMMJJ --actor admin@vigie.local
pnpm enrichment:apply --file vigie-offline-bundle-AAAAMMJJ/enrichment.json --actor admin@vigie.local --dry-run
pnpm enrichment:apply --file vigie-offline-bundle-AAAAMMJJ/enrichment.json --actor admin@vigie.local
```

## Carte nationale

La page d'accueil `/` affiche la carte des entrepôts (MapLibre, hors ligne), avec le statut de conformité calculé pour chaque site ([`docs/compliance-rules.md`](docs/compliance-rules.md)).

**Voir la carte complète** : sans paquet cartographique réel, la carte utilise un fond de secours (silhouettes des pays, bandeau « Fond de carte détaillé non installé »). Pour obtenir le fond vectoriel détaillé et les images aériennes :

```bash
# Sur un poste connecté (docs/offline-bundle.md) : pmtiles requis
pnpm bundle:build --sites sites.json --out .
# Sur le serveur ou le poste de développement
pnpm map:install --bundle vigie-offline-bundle-AAAAMMJJ --actor admin@vigie.local
```

Recharger `/` : le fond complet est choisi automatiquement dès que `france.pmtiles`, les polices et les symboles sont installés.

## Variables d'environnement

Validées au démarrage par `src/lib/env.ts` (zod) : le serveur s'arrête immédiatement si l'une d'elles manque ou est invalide, avec un message qui la nomme.

| Variable | Contrainte |
|---|---|
| `MSSQL_SA_PASSWORD` | Mot de passe `sa` du conteneur (utilisé par Docker uniquement) |
| `DATABASE_URL` | Doit commencer par `sqlserver://` |
| `APP_URL` | URL valide |
| `COOKIE_SECURE` | `true`/`false`. Cookie `Secure` avec le préfixe `__Host-`. Par défaut `true` en production et `false` sinon ; un avertissement s'affiche au démarrage en production avec `false` |
| `SESSION_IDLE_MINUTES` | Expiration après inactivité, en minutes (défaut 240) |
| `SESSION_ABSOLUTE_HOURS` | Durée maximale d'une session, en heures (défaut 12) |
| `TRUST_PROXY` | `true` uniquement derrière un reverse proxy qui renseigne `X-Forwarded-For` (défaut `false`) |
| `STORAGE_ROOT` | Dossier racine des fichiers écrits par l'application (rapports d'import et d'enrichissement, carte installée `map/`, documents). Par défaut `./storage` hors production ; **obligatoire en production**. Tous les chemins sont résolus sous cette racine. |
| `TEST_DATABASE_URL` | Facultative : base des tests d'intégration (nom terminé par `_test`) |
| `VIGIE_E2E_TEST_HOOKS` | Réservée à la suite e2e (`1` expose `window.__vigieMap`) ; **ne jamais la définir en production** |

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
├── samples/vigie-sample.xlsx # tableur de test fictif (pnpm sample:build)
├── tools/offline-bundle/     # SEUL code autorisé à joindre internet (poste connecté) : pnpm bundle:*
├── storage/                  # STORAGE_ROOT en développement : rapports d'import… (non commité)
├── docs/
│   ├── architecture.md       # principes, stack, découpage en 12 étapes
│   ├── data-model.md         # diagramme, rôle des tables, règles, modules futurs
│   ├── source-mapping.md     # colonne du tableur → table.champ
│   ├── import.md             # procédure d'import, anomalies, décisions
│   ├── security.md           # sessions, rôles, audit
│   ├── offline-bundle.md     # paquet hors ligne : procédure, données sortantes, licences
│   ├── compliance-rules.md   # règles de conformité, complétude
│   ├── brand/                # SVG de référence du logo
│   └── design-system.md      # tokens, règles des couleurs de statut, accessibilité
├── scripts/
│   ├── check-no-external.ts  # garde anti-dépendance externe
│   ├── db-up.sh              # démarrage de la base (pnpm db:up)
│   ├── db-sql.sh             # sqlcmd avec .env chargé (pnpm db:sql)
│   ├── db-reset.ts           # réinitialisation confirmée (pnpm db:reset)
│   ├── user-create.ts        # pnpm user:create
│   ├── user-reset-password.ts
│   ├── user-set-active.ts
│   ├── import-spreadsheet.ts # pnpm import:spreadsheet
│   ├── build-sample-spreadsheet.ts # pnpm sample:build
│   ├── enrichment-export-sites.ts  # pnpm enrichment:export-sites
│   ├── enrichment-apply.ts   # pnpm enrichment:apply
│   ├── map-install.ts        # pnpm map:install
│   └── lib/                  # cli.ts (arguments, saisie masquée), sample-spreadsheet.ts
├── src/
│   ├── app/                  # routes (App Router)
│   │   ├── globals.css       # tokens de design (@theme) + mapping shadcn
│   │   ├── layout.tsx        # <html lang="fr" class="dark">, polices Geist, coque
│   │   ├── (app)/            # zone protégée : layout (session obligatoire) + coque
│   │   │   ├── page.tsx      # carte (placeholder jusqu'à l'étape 6)
│   │   │   └── sites/ supervision/ admin/   # pages placeholder (admin : rôle admin)
│   │   ├── login/            # page de connexion + Server Action
│   │   ├── forbidden.tsx     # « Accès refusé » (403)
│   │   ├── dev/design/       # vitrine du design system (404 en production)
│   │   ├── api/health/       # sonde de vie (publique)
│   │   ├── api/auth/logout/  # déconnexion (POST)
│   │   ├── api/me/           # utilisateur courant (protégée)
│   │   ├── api/map-assets/   # carte installée : fichiers par plages d'octets + status (protégée)
│   │   └── not-found.tsx
│   ├── components/
│   │   ├── ui/               # composants shadcn/ui, adaptés aux tokens
│   │   ├── shell/            # AppShell, NavRail, CommandBar, MapStage, PageContainer
│   │   ├── panel/            # Panel (panneau flottant verre)
│   │   ├── status/           # StatusDot, StatusBadge, StatusLegend
│   │   └── empty/            # EmptyState
│   ├── config/navigation.ts  # entrées du rail
│   ├── domain/               # règles métier pures : enums (zod), catalogue d'indicateurs, calculs dérivés, dates, geo/ (départements, régions)
│   ├── lib/                  # env, format, status, csp, utils
│   ├── server/               # accès base (server-only) : db (singleton audité), prisma (fabriques), health
│   │   ├── auth/             # mots de passe, sessions, cookie, connexion, permissions, couche d'accès
│   │   ├── audit/            # contexte, diff, sérialisation, extension Prisma d'audit
│   │   ├── import/           # import du tableur (analyseurs, en-têtes, correspondance, contrôles, plan, écriture, rapport)
│   │   └── storage.ts        # chemins sous STORAGE_ROOT (anti-traversée)
│   ├── instrumentation.ts    # démarrage : environnement, avertissement cookie, purge des sessions
│   └── middleware.ts         # nonce + CSP ; redirection sans cookie de session
├── tests/
│   ├── unit/                 # Vitest + Testing Library
│   ├── integration/          # Vitest sur SQL Server (base vigie_test)
│   └── e2e/                  # Playwright
├── vitest.config.ts
├── vitest.integration.config.ts
└── playwright.config.ts
```
