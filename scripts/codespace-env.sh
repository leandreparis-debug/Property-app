#!/usr/bin/env bash
# Creates the .env file of a GitHub Codespace (or of a local workstation) if
# it is ABSENT. An existing .env is never modified. Development values only:
# the SQL Server password is generated at random, nothing here is a real secret.
#
# Inside a Codespace (CODESPACE_NAME and GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
# set by GitHub), the application is reached through the forwarded HTTPS
# address of port 3000: APP_URL is that address, Server Actions accept it,
# cookies are Secure and the client IP is read from the proxy.
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${1:-.env}"

if [ -f "$TARGET" ]; then
  echo "$TARGET existe déjà : conservé tel quel."
  exit 0
fi

# Random SQL Server password: upper and lower case, digits and a symbol
# (SQL Server policy), without « ; » nor quotes (DATABASE_URL syntax).
SA_PASSWORD="Vigie-Dev-$(node -e 'process.stdout.write(require("node:crypto").randomBytes(12).toString("base64url"))')-7a"

if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  PUBLIC_HOST="${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  APP_URL="https://${PUBLIC_HOST}"
  ORIGINS_LINE="SERVER_ACTIONS_ALLOWED_ORIGINS=${PUBLIC_HOST}"
  COOKIE_SECURE=true
  TRUST_PROXY=true
else
  APP_URL="http://localhost:3000"
  ORIGINS_LINE="# SERVER_ACTIONS_ALLOWED_ORIGINS="
  COOKIE_SECURE=false
  TRUST_PROXY=false
fi

umask 077
cat > "$TARGET" <<ENV
# Généré par scripts/codespace-env.sh le $(date -u +%Y-%m-%dT%H:%M:%SZ).
# Valeurs de DÉVELOPPEMENT uniquement : aucune donnée ni aucun secret réels.
MSSQL_SA_PASSWORD=${SA_PASSWORD}
DATABASE_URL="sqlserver://localhost:1433;database=vigie;user=sa;password=${SA_PASSWORD};trustServerCertificate=true"
APP_URL=${APP_URL}
# Adresse publique du port transféré (Codespaces) : acceptée pour les Server Actions.
${ORIGINS_LINE}

# HTTPS via le transfert de ports de Codespaces : cookie Secure (préfixe __Host-),
# adresse IP du client lue dans X-Forwarded-For posé par le proxy.
COOKIE_SECURE=${COOKIE_SECURE}
TRUST_PROXY=${TRUST_PROXY}
SESSION_IDLE_MINUTES=240
SESSION_ABSOLUTE_HOURS=12

STORAGE_ROOT=./storage
# Fond de carte IGN chargé par le navigateur ; « offline » = fond de secours.
MAP_BASEMAP=ign

# Environnement de test : pas de tâches planifiées (les lancer depuis
# Administration → Exploitation si besoin).
OPS_SCHEDULER=off
OPS_DAILY_AT=03:30
ENV
echo "$TARGET créé (${APP_URL})."
