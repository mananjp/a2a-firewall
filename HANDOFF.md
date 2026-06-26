# A2A Firewall — Project Handoff Context

Current branch state: `main` at `feea780` (locally ahead by one commit that fixes the
`telemetry.py` mypy regression and bumps the frontend CI job from Node 20 → 22).
Remote: `https://github.com/mananjp/a2a-firewall`.

---

## What is A2A Firewall

An inter-agent governance mesh that intercepts every message between AI agents,
validates it structurally and semantically, decides allow/block/review, and traces
the lineage. The full MVP plan lives at `a2a_firewall_mvp_plan.md`.

**Core claims** the MVP must demonstrate:
1. A 3-agent pipeline (Planner → Researcher → Summarizer) runs normally.
2. Inserting a prompt-injection payload causes it to be blocked with a readable reason.
3. The dashboard shows the full execution tree and traces the blocked hop back to its origin agent.

---

## Stack (locked decisions)

- **Backend**: Python 3.12 (NOT 3.14 — pydantic-core wheels missing), FastAPI 0.138,
  SQLAlchemy 2.0 async, asyncpg, Alembic, Pydantic 2.13, Groq (`llama-3.1-8b-instant`),
  OpenTelemetry, custom in-memory rate limiter (no slowapi to avoid CVE concerns).
- **Frontend**: React 18, TypeScript, Vite 8, Tailwind 3, react-flow 11, react-router-dom 6.30.
- **Database**: Postgres 16 (no Redis — explicitly removed by user).
- **Infra**: docker-compose locally (postgres + jaeger + backend + frontend); Render
  Blueprint in production via `render.yaml` (postgres + backend web service + frontend
  static site, all free plan). NO Redis. NO external auth (DEV-only email "login" that
  rotates the workspace key).
- **CI/CD**: GitHub Actions (test.yml runs 5 jobs on push/PR; deploy.yml triggers
  Render deploy hooks on `workflow_run: success` — only needed if you wire up hooks;
  Blueprint-only deploys don't need it).

---

## Repo layout (current)

```
a2a-firewall/
├── a2a_firewall_mvp_plan.md          # source-of-truth plan doc
├── README.md
├── HANDOFF.md                        # this file
├── render.yaml                       # Render Blueprint (backend + frontend + db)
├── .gitignore
├── docker-compose.yml                # postgres + jaeger + backend + frontend
├── backend/
│   ├── pyproject.toml               # ruff + mypy strict + pytest config
│   ├── Makefile
│   ├── requirements.txt              # runtime
│   ├── requirements-dev.txt          # tooling
│   ├── alembic.ini
│   ├── .env.example
│   ├── .dockerignore                 # exclude tests/, scripts/dev.sh, etc.
│   ├── entrypoint.sh                # auto-migrate + uvicorn
│   ├── scripts/{seed.py,dev.sh,run_demo.sh}
│   ├── src/a2a_firewall/
│   │   ├── main.py
│   │   ├── core/{config,security,telemetry,rate_limit}.py
│   │   ├── db/{database,models}.py + migrations/
│   │   ├── detection/{orchestrator,layer0_preflight,layer1_schema,
│   │   │             layer2_permissions,layer3_rules,layer4_groq,layer5_decision}.py
│   │   └── api/routes/{auth,workspaces,agents,schemas,firewall,tasks,
│   │                   violations,review,policies,stats}.py
│   └── tests/{unit,integration,e2e,attack_corpus}/
├── frontend/
│   ├── package.json                  # pinned versions (no ^)
│   ├── .dockerignore                 # exclude node_modules, dist, tests
│   ├── tsconfig.json / vite.config.ts / vitest.config.ts
│   ├── tailwind.config.js / postcss.config.js
│   ├── nginx.conf                   # SPA fallback + caching
│   ├── Makefile
│   ├── index.html
│   └── src/
│       ├── main.tsx / App.tsx / index.css
│       ├── __tests__/setup.ts
│       ├── api/{client,client.test,types}.ts
│       ├── hooks/{useApiKey,usePolling,usePolling.test}.ts(x)
│       ├── components/Layout.tsx
│       └── pages/{Login,Dashboard,Violations,TreeView,TraceDetail,
│                  Agents,Policies,ReviewQueue}Page.tsx
├── docker/
│   ├── Dockerfile                    # backend image
│   └── Dockerfile.frontend           # frontend multi-stage (node:20 → nginx:alpine)
├── docs/RUNBOOK.md
└── .github/workflows/{test,deploy}.yml
```

---

## Commit history (most recent first)

```
feea780  fix: use Render Blueprint env format, add plan and branch fields
c5dc234  style: ruff format telemetry.py
254fe73  fix(ci): add frontend lint, caching, concurrency; rewrite deploy for Render;
         fix Dockerfile.frontend to use npm ci; add .dockerignore files
b9510d1  docs: write comprehensive and detailed README.md
d238d02  fix(frontend): wrap usePolling fetchers in useCallback to prevent infinite render loops
ffcdc7f  fix(docker): resolve postgres and jaeger integration startup and runtime crashes
6c4d43c  fix(e2e): emit decision trace event on early block, fix lineage order assertions
7f58c23  fix(ci): block injection patterns, reorder task routes, update Dockerfile to py3.12
393c7cc  fix(telemetry): tolerate FastAPIInstrumentor crash on newer starlette
ffde09b  fix(ci): make venv path cross-platform in integration/e2e test fixtures
2e21611  fix(ci): create venv in CI so .venv/bin/ paths resolve
e3671b7  feat: frontend dashboard + Alembic startup hook + CI/CD (Batch 4)
3088e7b  feat(backend): OTel trace_events + attack corpus + multi-tenant + e2e + rate limit (Batch 3)
87833b9  feat(backend): Alembic migrations + me endpoints + permission endpoint + integration tests (Batch 2)
996921f  feat(backend): restructure to src/ layout + pipeline tooling (Batch 1)
8ccd99c  feat: detection pipeline, DB schema, SDK, tests, examples
6dfd688  feat: all API route handlers
b1eebbd  feat: backend app — main, core, db models
3610b2d  chore: initial project structure
```

---

## CI status (current `feea780`)

Last run `28248159051` on `feea780`:

| Job | Status |
|---|---|
| Backend security audit | success |
| Frontend lint / typecheck / test / build | success |
| Backend lint / typecheck / unit | **failure** (`mypy strict`) |
| Backend docker build | skipped (downstream) |
| Backend integration (postgres + jaeger) | skipped (downstream) |

**Single failure**: `src/a2a_firewall/core/telemetry.py:20: error: Function is missing
a type annotation [no-untyped-def]`. The `patched_get_route_details(scope)` monkeypatch
added in `393c7cc` to work around `FastAPIInstrumentor` crashing on newer starlette
was never annotated, and `pyproject.toml` sets `disallow_untyped_defs = true`.

**Fix (local, uncommitted)**: annotate the function with
`def patched_get_route_details(scope: dict[str, Any]) -> str | None:` and add the
`Any` import. Also bump frontend CI Node from `20` to `22` to silence the Node 20
deprecation warning.

The earlier CI failures called out in the previous version of this doc
(`test_injection_blocked` and `test_workspace_b_cannot_read_workspace_a_lineage`) are
**fixed and passing** in `6c4d43c` and `7f58c23`.

---

## Render deployment

`render.yaml` defines a Blueprint with three resources on the free plan:
- `a2a-firewall-backend` (web service, Docker) — `dockerContext: ./backend`,
  `dockerfilePath: ./docker/Dockerfile`, `branch: main`, `healthCheckPath: /health`.
- `a2a-firewall-frontend` (static site) — `buildCommand: cd frontend && npm ci && npm run build`,
  `staticPublishPath: frontend/dist`, `branch: main`. `VITE_API_URL` is baked in to
  `https://a2a-firewall-backend.onrender.com`.
- `a2a-firewall-db` (Postgres).

Render auto-provisions `DATABASE_URL`, `SECRET_KEY`, `API_KEY_SALT`, `ALLOWED_ORIGINS`,
`OTEL_SDK_DISABLED`, `RATE_LIMIT_ENABLED`, `DEBUG=false`. The **only** manual env var
needed on the backend service is `GROQ_API_KEY`.

To enable Blueprint auto-deploy on push:
1. Render dashboard → New → Blueprint → pick `mananjp/a2a-firewall`.
2. After first apply, set `GROQ_API_KEY` on the backend service.
3. Subsequent pushes to `main` auto-deploy.

`deploy.yml` (GitHub Actions) is only needed if you also want deploy hooks. For
Blueprint-only deploys, it's optional.

---

## Local development

```bash
# Backend
cd backend
.venv/Scripts/python -m alembic upgrade head
.venv/Scripts/python -m alembic downgrade -1
.venv/Scripts/python -m alembic revision -m "msg"
make pipeline       # lint + format-check + typecheck + unit + build + audit
.venv/Scripts/pytest -v           # all tests (unit + integration + e2e)
.venv/Scripts/pytest tests/unit  # unit only

# Integration tests need a running backend + DB
$env:TEST_DATABASE_URL = "postgresql+asyncpg://a2a:a2apassword@localhost:5432/a2afirewall"
$env:TEST_BACKEND_URL = "http://localhost:8000"
.venv/Scripts/pytest tests/integration -v
.venv/Scripts/pytest tests/e2e -v

# Frontend
cd frontend
npm run dev         # vite dev server on 5173
npm test            # vitest
npm run build       # tsc + vite build
npm run lint
npm run typecheck

# Full stack (docker-compose)
docker compose up --build -d           # postgres + jaeger + backend + frontend
curl http://localhost:8000/health      # backend healthcheck
curl http://localhost:5173             # frontend
docker compose down -v                 # teardown + remove volumes

# CI status
gh run list --repo mananjp/a2a-firewall --limit 5
gh run watch <RUN_ID> --repo mananjp/a2a-firewall
```

---

## Architecture notes

### Detection pipeline (`detection/orchestrator.py`)

1. **Layer -1 (rate limit)** — per-agent in-memory sliding window. If exceeded,
   writes a synthetic block task + violation + trace event in one transaction.
2. **Layer 0 (preflight)** — payload size, sender/receiver status, depth > 10,
   circular reference, DB-based idempotency check. If a `task_id` already exists
   in `tasks`, returns the cached decision via `_replay_response` (preserves the
   original `review_token` if pending).
3. **Layer 1 (schema)** — JSON Schema validation against `task_schemas`. Pass-through
   if no schema registered for the `task_type`.
4. **Layer 2 (permissions)** — `agent_permissions` matrix lookup. Whitelist model;
   `workspace.default_deny` controls fallback.
5. **Layer 3 (rules)** — forbidden patterns (`INJECTION_PATTERNS` list) plus
   `policy_rules` table. Each layer's outcome is appended to `trace_events`.
6. **Layer 4 (Groq)** — only if `risk_score >= workspace.groq_threshold`. Calls
   `llama-3.1-8b-instant`. 429/graceful degradation handled.
7. **Layer 5 (decision)** — final allow/block/review from `make_decision()`.

All task rows, violation rows, review rows, and trace events are written in **one
transaction** at the end (`_save_and_return`).

### Trace events

- Each inspection produces 6–7 `trace_events` rows (one per layer).
- `parent_span_id` is the inbound `parent_span_id` or a generated UUID.
- `attributes` JSON holds layer-specific structured data.
- Dashboard fetches via `GET /v1/tasks/by-trace/{trace_id}`.

### Rate limiter (`core/rate_limit.py`)

In-memory sliding-window. No external dep.
`check_workspace(key)` is called by middleware on every `/v1/*` request.
`check_agent(agent_id)` is called by the orchestrator at inspection entry.
Configure via env: `WORKSPACE_RATE_LIMIT_PER_MIN`, `AGENT_INSPECT_RATE_LIMIT_PER_MIN`,
`RATE_LIMIT_ENABLED`.

**Limitation**: state is per-process. Multi-worker / multi-pod would need Redis.
Not in MVP scope.

### DEV-only auth (`POST /v1/auth/login`)

Endpoint takes `{ email }`, looks up `Workspace.admin_email`, **rotates** the API
key (since we can't recover the hash), and returns the new key. Returns 403 when
`DEBUG=false`. Used by the dashboard's `LoginPage`. Marked `# DEV ONLY`.

For production: replace with proper password auth or SSO. Out of MVP scope.

---

## Known issues / quirks

1. **Python 3.14 doesn't work** — pydantic-core wheels missing. Use Python 3.12
   (matches `Dockerfile`).

2. **OpenTelemetry FastAPI instrumentation crashes on newer starlette.**
   `setup_telemetry()` wraps `FastAPIInstrumentor.instrument_app()` in
   `contextlib.suppress(Exception)` and also monkeypatches `_get_route_details`
   to tolerate `_IncludedRouter` lacking `path`. Set `OTEL_SDK_DISABLED=true` in
   test/CI to skip entirely.

3. **Integration test fixtures hardcode venv path** — fixed to be cross-platform
   via `os.name == "nt"`. If you add new integration/e2e test files, copy the
   `alembic_upgrade` fixture pattern from existing files.

4. **`setuptools<81` is pinned** — newer setuptools drops `pkg_resources` which
   `opentelemetry-instrumentation` imports. Don't bump it.

5. **CI venv setup**: `actions/setup-python@v5` installs globally, doesn't create
   `.venv/`. Every backend job needs:
   ```yaml
   - name: Create venv and install deps
     run: |
       python -m venv .venv
       .venv/bin/pip install --upgrade pip setuptools wheel
       .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
       .venv/bin/pip install -e .
   ```

6. **Frontend packages pinned to exact versions** (no `^`) in `package.json`.
   Don't add `^`.

7. **`Dockerfile.frontend` uses `npm ci`** — needs `package-lock.json` present.
   Updated in `254fe73`.

8. **Empty `frontend/src/components/ExecutionTree/`** directory is leftover
   scaffolding (ReactFlow is rendered inline in `TreeViewPage.tsx`). Safe to delete.

---

## Useful URLs

- **Plan doc**: `a2a_firewall_mvp_plan.md`
- **Runbook**: `docs/RUNBOOK.md`
- **Latest commit (origin/main)**: `feea780 fix: use Render Blueprint env format, add plan and branch fields`
- **Render backend (prod)**: `https://a2a-firewall-backend.onrender.com`
- **Render frontend (prod)**: `https://a2a-firewall-frontend.onrender.com`
- **GitHub**: https://github.com/mananjp/a2a-firewall