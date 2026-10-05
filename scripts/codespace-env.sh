#!/usr/bin/env bash
# Creates the .env file of a GitHub Codespace (or of a local workstation) if
# it is ABSENT. Development values only: the SQL Server password is generated
# at random, nothing here is a real secret.
#
# Inside a Codespace, an EXISTING .env is repaired: APP_URL,
# SERVER_ACTIONS_ALLOWED_ORIGINS, COOKIE_SECURE and TRUST_PROXY are set to the
# values of this Codespace (every other line, the database password included,
# is kept). Outside a Codespace an existing .env is never modified.
#
# Inside a Codespace (CODESPACE_NAME and GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
# set by GitHub), the application is reached through the forwarded HTTPS
# address of port 3000: APP_URL is that address, Server Actions accept it,
# cookies are Secure and the client IP is read from the proxy.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/codespace-lib.sh
source scripts/codespace-lib.sh
load_codespace_env
TARGET="${1:-.env}"

# Sets KEY=VALUE in the file: replaces the line (commented or not), or appends it.
set_key() {
  local key="$1" value="$2" file="$3"
  if grep -qE "^#? ?${key}=" "$file"; then
    KEY="$key" VALUE="$value" node -e '
      const fs = require("fs"); const f = process.argv[1]; const { KEY, VALUE } = process.env;
      const re = new RegExp("^#? ?" + KEY + "=.*$", "m");
      fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(re, KEY + "=" + VALUE));' "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

if [ -f "$TARGET" ]; then
  if in_codespace; then
    PUBLIC_HOST="${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    set_key APP_URL "https://${PUBLIC_HOST}" "$TARGET"
    set_key SERVER_ACTIONS_ALLOWED_ORIGINS "${PUBLIC_HOST},localhost:3000" "$TARGET"
    set_key COOKIE_SECURE true "$TARGET"
    set_key TRUST_PROXY true "$TARGET"
    echo "$TARGET existe déjà : adresse du Codespace vérifiée (https://${PUBLIC_HOST}), le reste est conservé."
  else
    echo "$TARGET existe déjà : conservé tel quel."
  fi
  exit 0
fi

# Random SQL Server password: upper and lower case, digits and a symbol
# (SQL Server policy), without « ; » nor quotes (DATABASE_URL syntax).
SA_PASSWORD="Vigie-Dev-$(node -e 'process.stdout.write(require("node:crypto").randomBytes(12).toString("base64url"))')-7a"

if in_codespace; then
  PUBLIC_HOST="${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  APP_URL="https://${PUBLIC_HOST}"
  ORIGINS_LINE="SERVER_ACTIONS_ALLOWED_ORIGINS=${PUBLIC_HOST},localhost:3000"
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
# Adresse publique du port transféré (Codespaces), et localhost:3000 : le proxy
# de Codespaces réécrit l'en-tête Origin en localhost:3000.
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
