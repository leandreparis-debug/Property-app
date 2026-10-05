#!/usr/bin/env bash
# Starts Vigie on port 3000 in a Codespace (postAttachCommand) or locally.
#   prod (default): production build, rebuilt only when the code changed —
#                   representative of the real performance;
#   dev           : development server (pages compiled on first visit: slow,
#                   for developers only).
# Does nothing if something already listens on port 3000.
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-prod}"
export NEXT_TELEMETRY_DISABLED=1

if (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null; then
  echo "Vigie tourne déjà sur le port 3000 : ouvrir l'onglet « Ports » et l'adresse du port 3000."
  exit 0
fi
if [ ! -f .env ]; then
  echo "Préparation pas encore terminée : attendre la fin de « pnpm codespace:setup » (terminal de création), puis relancer « pnpm codespace:prod »."
  exit 1
fi
for i in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 2; done
pnpm -s db:up >/dev/null

if [ "$MODE" = "dev" ]; then
  echo "Démarrage en mode développement (pnpm dev)…"
  exec pnpm dev
fi

# Production build, redone only when the code changed since the last build.
STAMP=.next/.vigie-build-stamp
CURRENT="$(git rev-parse HEAD 2>/dev/null || echo none)-$(git status --porcelain -- src prisma package.json next.config.ts 2>/dev/null | sha256sum | cut -c1-16)"
if [ ! -f .next/BUILD_ID ] || [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$CURRENT" ]; then
  echo "Construction de la version de production (1 à 3 minutes)…"
  pnpm build
  echo "$CURRENT" > "$STAMP"
fi
echo "Démarrage de Vigie (production) sur le port 3000…"
exec pnpm start -p 3000
