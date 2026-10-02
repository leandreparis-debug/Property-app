#!/usr/bin/env bash
# Starts SQL Server, waits for its healthcheck, then creates the `vigie` and
# `vigie_e2e` databases if needed (idempotent). Used by `pnpm db:up`.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Fichier .env introuvable : exécuter d'abord « cp .env.example .env »." >&2
  exit 1
fi

# `--wait` blocks until `db` is healthy. The databases are then created by
# sqlcmd INSIDE the `db` container (localhost): no container-to-container
# network needed (it is unreliable in Docker-in-Docker, e.g. GitHub Codespaces).
docker compose up -d --wait db
docker compose exec -T db bash -c '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -b -Q "IF DB_ID(N'"'"'vigie'"'"') IS NULL CREATE DATABASE [vigie]; IF DB_ID(N'"'"'vigie_e2e'"'"') IS NULL CREATE DATABASE [vigie_e2e];"'
echo "Bases 'vigie' et 'vigie_e2e' prêtes."
