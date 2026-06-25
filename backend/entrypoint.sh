#!/usr/bin/env bash
# A2A Firewall backend container entrypoint.
# Runs database migrations on every start, then launches uvicorn.
# Fails the container start if migrations fail (intentional — better to
# restart-loop than serve requests against a stale schema).
set -euo pipefail

echo "[entrypoint] $(date -Iseconds) running alembic upgrade head..."
python -m alembic upgrade head
echo "[entrypoint] migrations applied"

echo "[entrypoint] starting uvicorn on 0.0.0.0:8000..."
exec uvicorn a2a_firewall.main:app --host 0.0.0.0 --port 8000