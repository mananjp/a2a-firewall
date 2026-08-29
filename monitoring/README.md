# A2A Firewall — Monitoring (Free-Tier Wiring)

This directory turns `docs/monitoring.md` from a *description of observability
intent* into **two free-tier integrations that are actually wired into the
codebase**:

| Capability | Free tier | Wired | Endpoints / config |
| :-- | :-- | :-- | :-- |
| Error tracking | **Sentry** | ✅ backend | `SENTRY_DSN` env var → `core/sentry.py` |
| Uptime / status | **UptimeRobot** | ✅ backend | `/health` + `/ready` endpoints |

Both are additive and **fail-open**: with no credentials the service runs
exactly as before (Sentry no-ops, `/health` always 200). Credentials are
configured once in the Render dashboard (or your env) and monitoring is live.

---

## 1. Sentry (error tracking — free tier, 5k errors/mo)

**Already wired in code:**
- `backend/requirements.txt` → `sentry-sdk[fastapi]`
- `backend/src/a2a_firewall/core/sentry.py` → `setup_sentry()`:
  - activates **only** when `SENTRY_DSN` is set; otherwise returns `False`
    (graceful no-op)
  - instruments **FastAPI** (captures 4xx/5xx as events) and **logging**
    (ERROR-level and above become Events)
  - sets `environment` from `SENTRY_ENVIRONMENT`, sampling from
    `SENTRY_TRACES_SAMPLE_RATE`
- `backend/src/a2a_firewall/main.py` → calls `setup_sentry()` at startup.

**To enable (one-time, ~2 min):**
1. Create a free project at https://sentry.io → copy the DSN
   (`https://<key>@o<org>.ingest.sentry.io/<project>`).
2. Set these environment variables on the Render backend service
   (Dashboard → your service → Environment):
   - `SENTRY_DSN` = your DSN
   - `SENTRY_ENVIRONMENT` = `production`
   - `SENTRY_TRACES_SAMPLE_RATE` = `0.1`
3. Redeploy. You will see captured request errors and logged exceptions in
   Sentry within seconds.

**Disable?** Leave `SENTRY_DSN` empty, or set `SENTRY_DISABLED=true`
(used in tests/CI).

Docs: `docs/monitoring.md` (Error Tracking section),
`backend/.env.example` (Sentry block).

---

## 2. UptimeRobot (uptime/status — free tier, 50 monitors)

**Already wired in code:**
- `backend/src/a2a_firewall/main.py`:
  - `GET /health` → `200 {"status":"ok", ...}` — stable **liveness** target.
  - `GET /ready` → `200 {"status":"ready"}` or `503` — **readiness** probe
    that executes a real `SELECT 1` against the database, surfacing a silently
    broken connection pool instead of a green-but-failing service.

**To enable (one-time, ~2 min):**
1. Create a free account at https://uptimerobot.com.
2. Add the two HTTP(S) monitors described in
   `monitoring/uptimerobot.yml`:
   - **A2A Backend / Health** → `https://a2a-firewall1.onrender.com/health`
   - **A2A Backend / Ready** → `https://a2a-firewall1.onrender.com/ready`
3. Set keyword monitoring (exists `"status":"ok"` / `"status":"ready"`) so an
   HTML error page or captive redirect counts as *down* rather than *up*.
4. Wire an Alert Contact (email, SMS, or Slack webhook) to get notified.

No code change is required to *use* UptimeRobot; the endpoints already exist.
This directory's `uptimerobot.yml` is a declarative, paste-in record of the
monitor set.

---

## 3. Everything-as-code vs. dashboard

The free tiers are UI/account-bound (Sentry DSN + UptimeRobot monitors), so
they cannot be fully reproduced by a config file. What we *can* keep in code
and reviewable is:
- the **integration code** (this repo) — done;
- the **endpoints** UptimeRobot targets — done;
- a **declarative monitor spec** (`monitoring/uptimerobot.yml`) — done;
- the **env/config placeholders** (`render.yaml`, `backend/.env.example`) —

done. See `docs/monitoring.md`'s "Wired-up free tiers" section for the full
picture, and the breakdown of which observability layers remain
self-hosted (Prometheus/Grafana) vs. turnkey (Sentry/UptimeRobot).
