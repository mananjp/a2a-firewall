#!/usr/bin/env bash
# Run the end-to-end demo attack scenario.
# Prereq: stack running (scripts/dev.sh), SDK installed (pip install -e ../sdk),
#         and environment variables exported from scripts/seed.py.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${PLANNER_API_KEY:-}" ] || [ -z "${RESEARCHER_ID:-}" ]; then
  echo "[demo] missing required env vars (PLANNER_API_KEY, RESEARCHER_ID, etc.)" >&2
  echo "[demo] run scripts/seed.py first to populate them" >&2
  exit 1
fi

cd "$SCRIPT_DIR/../../sdk"
exec python examples/demo_attack.py