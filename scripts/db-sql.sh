#!/usr/bin/env bash
# Runs sqlcmd inside the `db` container, with the SA password loaded from .env.
#   pnpm db:sql                      → interactive session on the `vigie` database
#   pnpm db:sql -Q "SELECT 1"        → runs a query and exits
#   pnpm db:sql -d vigie_test -Q …   → targets another database (last -d wins)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Fichier .env introuvable : exécuter d'abord « cp .env.example .env »." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

tty_flag=()
[ -t 0 ] && [ -t 1 ] || tty_flag=(-T)

exec docker compose exec "${tty_flag[@]}" db /opt/mssql-tools18/bin/sqlcmd \
  -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -d vigie -W "$@"
