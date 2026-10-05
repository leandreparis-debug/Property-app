#!/usr/bin/env bash
# Prepares a GitHub Codespace (postCreateCommand of .devcontainer), or any
# workstation with Docker: dependencies, .env, SQL Server, Prisma client,
# migrations, demo data, three test accounts, sample spreadsheet.
# REPLAYABLE: every step is idempotent (no reset, no duplicate).
#
# Usage: pnpm codespace:setup   (or: bash scripts/codespace-setup.sh)
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/codespace-lib.sh
source scripts/codespace-lib.sh
load_codespace_env
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

step "1/7 Vérification de Node.js"
node -e '
const [maj, min, pat] = process.versions.node.split(".").map(Number);
const ok = maj > 22 || (maj === 22 && (min > 22 || (min === 22 && pat >= 2)));
if (!ok) { console.error(`Node ${process.versions.node} : version 22.22.2 ou plus requise.`); process.exit(1); }
console.log(`Node ${process.versions.node}`);'

step "2/7 Dépendances (pnpm install)"
corepack enable >/dev/null 2>&1 || sudo corepack enable
pnpm install --frozen-lockfile

step "3/7 Fichier d'environnement (.env)"
bash scripts/codespace-env.sh

step "4/7 Base de données SQL Server (Docker)"
for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; [ "$i" = 60 ] && { echo "Docker ne répond pas."; exit 1; }; sleep 2; done
pnpm -s db:up
# The database named in DATABASE_URL (vigie by default) — created if missing.
DB_NAME=$(node -e 'require("dotenv").config(); const m = /database=([^;]+)/i.exec(process.env.DATABASE_URL ?? ""); process.stdout.write(m ? m[1] : "")')
if [ -n "$DB_NAME" ] && [[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
  docker compose exec -T db bash -c "/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P \"\$MSSQL_SA_PASSWORD\" -b -Q \"IF DB_ID(N'${DB_NAME}') IS NULL CREATE DATABASE [${DB_NAME}];\"" >/dev/null
fi

step "5/7 Client Prisma et migrations"
pnpm -s db:generate
pnpm -s db:deploy

step "6/7 Sites de démonstration, comptes de test, jeu d'exemple"
pnpm -s db:seed
pnpm -s codespace:data

step "7/7 Terminé"
APP_URL=$(node -e 'require("dotenv").config(); process.stdout.write(process.env.APP_URL ?? "http://localhost:3000")')
cat <<MSG

  Vigie est prête.
  Adresse : ${APP_URL}
  (l'application démarre seule à l'ouverture du Codespace ; sinon : pnpm codespace:prod)

  Comptes de test (fictifs) :
    Administrateur : admin@vigie.local    / Recette-Vigie-2026-A
    Éditeur        : editeur@vigie.local  / Recette-Vigie-2026-E
    Lecteur        : lecteur@vigie.local  / Recette-Vigie-2026-L

  Guide : docs/demarrage-codespaces.md
MSG
