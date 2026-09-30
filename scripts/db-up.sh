#!/usr/bin/env bash
# Starts SQL Server, waits for its healthcheck, then creates the `vigie` and
# `vigie_e2e` databases if needed (idempotent). Used by `pnpm db:up`.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Fichier .env introuvable : exécuter d'abord « cp .env.example .env »." >&2
  exit 1
fi

# `--wait` blocks until `db` is healthy; `db-init` then runs to completion.
docker compose up -d --wait db
docker compose run --rm db-init
