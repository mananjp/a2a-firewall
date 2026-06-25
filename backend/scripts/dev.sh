#!/usr/bin/env bash
# Start the A2A Firewall backend stack for local development.
# Usage: scripts/dev.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR/.."

# Ensure .env exists
if [ ! -f backend/.env ]; then
  echo "[dev] backend/.env missing — copying from .env.example"
  cp backend/.env.example backend/.env
fi

echo "[dev] starting docker-compose stack..."
docker-compose up --build -d

echo "[dev] waiting for backend health..."
for i in {1..30}; do
  if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
    echo "[dev] backend healthy"
    exit 0
  fi
  sleep 1
done

echo "[dev] backend failed to come up in 30s" >&2
docker-compose logs backend
exit 1