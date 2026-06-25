# RUNBOOK — Local Development & Testing

## Prerequisites

- Python 3.12 (3.14 has pydantic-core wheel issues)
- Docker (for postgres + jaeger + backend stack)
- `gh` CLI authenticated to github.com (for the Batch 1 push workflow)

## Initial Setup

```bash
# 1. Clone the repo
git clone https://github.com/mananjp/a2a-firewall.git
cd a2a-firewall

# 2. Create venv + install
cd backend
py -3.12 -m venv .venv
.venv/Scripts/pip install -r requirements.txt -r requirements-dev.txt
.venv/Scripts/pip install -e .

# 3. Copy env template
cp .env.example .env
# Edit .env: add your GROQ_API_KEY

# 4. From repo root: start the stack
cd ..
docker-compose up --build -d

# 5. Wait for backend health
for i in {1..30}; do curl -sf http://localhost:8000/health && break; sleep 1; done
```

## Running Tests

### Unit Tests (no DB required)

```bash
cd backend
.venv/Scripts/pytest tests/unit -v
```

These include:
- `test_policy_decision.py` — Layer 5 decision logic
- `test_rule_engine.py` — Layer 3 forbidden-pattern detection
- `test_attack_corpus.py` — 6 attack fixtures (role_override, instruction_smuggling,
  context_poisoning, circular_spawn, deep_chain, giant_payload)

### Integration Tests (require stack)

```bash
# From repo root with stack running:
cd backend
$env:TEST_DATABASE_URL = "postgresql+asyncpg://a2a:a2apassword@db:5432/a2afirewall"
$env:TEST_BACKEND_URL = "http://localhost:8000"
.venv/Scripts/pytest tests/integration -v
```

Integration tests auto-skip without `TEST_DATABASE_URL`. They cover:
- `test_firewall_endpoint.py` — full inspect endpoint with allow/block paths
- `test_multi_tenant_isolation.py` — workspace A cannot read workspace B's data

### E2E Tests (require stack)

```bash
$env:TEST_DATABASE_URL = "postgresql+asyncpg://a2a:a2apassword@db:5432/a2afirewall"
$env:TEST_BACKEND_URL = "http://localhost:8000"
.venv/Scripts/pytest tests/e2e -v
```

Covers the full 3-agent pipeline (clean + attack scenarios).

### One-Command Pipeline

```bash
cd backend
make pipeline       # lint + format-check + typecheck + unit + build + audit
```

## Seeding Demo Data

After the stack is up:

```bash
cd backend
.venv/Scripts/python scripts/seed.py
```

This prints environment variables to export:

```bash
export WORKSPACE_ID=...
export WORKSPACE_API_KEY=...
export PLANNER_ID=...
export PLANNER_API_KEY=...
export RESEARCHER_ID=...
export RESEARCHER_API_KEY=...
export SUMMARIZER_ID=...
export SUMMARIZER_API_KEY=...
```

Then run the demo attack:

```bash
cd ../sdk
pip install -e .
cd examples
python demo_attack.py
```

Expected output:

```
[Demo] Sending injected payload to Researcher via Firewall...
[Demo] BLOCKED as expected!
  Reason : forbidden_pattern
  Risk   : 0.4
  Task ID: <uuid>
Check the dashboard for the violation and execution tree.
```

## Common Operations

### Database Migrations

```bash
cd backend
.venv/Scripts/python -m alembic upgrade head      # apply
.venv/Scripts/python -m alembic downgrade -1     # rollback one
.venv/Scripts/python -m alembic revision --autogenerate -m "message"   # new migration
```

### Stopping the Stack

```bash
docker-compose down
# Add -v to drop postgres data:
docker-compose down -v
```

### Verifying Security

The single most important security test:

```bash
.venv/Scripts/pytest tests/integration/test_multi_tenant_isolation.py -v
```

If any of these tests fails, **do not deploy**. Workspace isolation is the core claim.

## Configuration Reference

All settings live in `backend/src/a2a_firewall/core/config.py` and read from `.env`:

| Setting | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | (required) | Postgres connection string |
| `GROQ_API_KEY` | (required) | Groq API key for layer 4 |
| `SECRET_KEY` | (required) | Used for any JWT signing (future) |
| `API_KEY_SALT` | (required) | Salt for API key hashing |
| `DEBUG` | false | SQLAlchemy echo + FastAPI debug |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS allow-list (comma-separated) |
| `MAX_PAYLOAD_BYTES` | 102400 | Layer 0 preflight size limit |
| `DEFAULT_FAIL_MODE` | closed | Workspace fail_mode default |
| `WORKSPACE_DEFAULT_DENY` | true | Default-deny permission model |
| `GROQ_THRESHOLD` | 0.3 | Risk score to trigger Groq call |
| `BLOCK_THRESHOLD` | 0.8 | Risk score to auto-block |
| `REVIEW_THRESHOLD` | 0.5 | Risk score to flag for review |
| `WORKSPACE_RATE_LIMIT_PER_MIN` | 1000 | Per-workspace API rate limit |
| `AGENT_INSPECT_RATE_LIMIT_PER_MIN` | 60 | Per-agent inspect endpoint rate limit |
| `RATE_LIMIT_ENABLED` | true | Master switch for both rate limiters |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | Jaeger OTLP HTTP endpoint |

## Troubleshooting

### "Database password authentication failed"

Check that `.env`'s `DATABASE_URL` matches docker-compose's `POSTGRES_USER`/`POSTGRES_PASSWORD`.

### "OTel exporter can't connect to localhost:4318"

Jaeger isn't running, OR `OTEL_SDK_DISABLED=true` to disable. Spans will be silently dropped.

### "Alembic can't find migrations"

Run from `backend/` directory (where `alembic.ini` lives).

### "Rate limit hit immediately"

Lower `WORKSPACE_RATE_LIMIT_PER_MIN` for production; raise for testing. The limit is in-memory only — restart backend to reset.

### "Tests pass individually but fail when run together"

In-memory rate limiter state leaks between tests. Call `a2a_firewall.core.rate_limit.configure(workspace_max_per_min=10000, agent_max_per_min=10000)` in test setup, or run pytest with `-p no:cacheprovider` to avoid module cache issues.