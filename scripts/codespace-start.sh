#!/usr/bin/env bash
# postStartCommand of .devcontainer: each time the Codespace starts or
# resumes, Docker has been stopped — restart SQL Server (idempotent).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
  echo "Préparation pas encore faite (.env absent) : rien à relancer."
  exit 0
fi
for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; [ "$i" = 60 ] && { echo "Docker ne répond pas."; exit 1; }; sleep 2; done
pnpm -s db:up
