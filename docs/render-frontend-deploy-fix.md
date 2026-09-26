# Implementation: Render Frontend Deploy Fix

**Status:** ready to implement
**Date:** 2026-09-25
**Scope:** frontend only — backend code is untouched
**Trigger:** Render build failure on `main` @ `618e202`

---

## 1. Symptom

```
==> Running build command 'cd frontend && npm ci && npm run build'...
> next build
▲ Next.js 16.2.10 (Turbopack)
✓ Generating static pages using 31 workers (28/28) in 522ms
==> Publish directory frontend/dist does not exist!
==> Build failed 😞
```

The build itself succeeded (compile, TypeScript, and page generation all passed). Render
aborted **after** the build, at the publish step.

## 2. Root Cause

Two facts collide:

| Fact | Source |
|:---|:---|
| `output: "standalone"` — the build emits `.next/`, never `dist/` | [`frontend/next.config.ts`](../frontend/next.config.ts) line 4 |
| The live frontend service is a **Render Static Site** with publish path `frontend/dist` | Render dashboard (not visible in the repo) |

The repo's blueprint already describes the correct shape — a Docker **web service**, not a
static site:

- [`render.yaml`](../render.yaml) lines 43-57: `type: web`, `env: docker`,
  `dockerfilePath: ./frontend/Dockerfile`, `dockerContext: ./frontend`
- [`frontend/Dockerfile`](../frontend/Dockerfile): builds `output: "standalone"` and runs
  `node server.js` from `.next/standalone`

**Drift history:** the service was originally a static site — commit `553ae36` is titled
*"fix(render): remove plan property from static frontend service"* and still carried
`buildCommand: cd frontend && npm ci && npm run build` + `staticPublishPath: frontend/dist`.
Commit `28d559e` then rewrote `render.yaml` to the Docker web service, but the **dashboard
service was never recreated** — the blueprint and the running service have disagreed ever since.

## 3. Why Static Export Is Not the Fix

Rendering to a static `dist/` is not viable for this app:

1. `/dashboard/traces/[traceId]` and `/dashboard/trees/[rootTaskId]` are dynamic segments
   (client components using `useParams`); `output: "export"` requires `generateStaticParams`
   for every bracketed route, so those pages would 404.
2. [`frontend/next.config.ts`](../frontend/next.config.ts) `rewrites()` depends on a running
   server to proxy `/v1/:path*` and `/health` to the backend.
3. Refactoring both dynamic pages to query-param routes just to satisfy a hosting model is a
   large, unrelated change to the product surface.

Render cannot convert a Static Site into a Web Service in place — the service must be recreated.

---

## 4. Scope

**In scope**

- Bump `next` / `eslint-config-next` to 16.3.6 to clear 2 critical + 6 high advisories.
- Two correctness fixes in [`frontend/Dockerfile`](../frontend/Dockerfile) required by the
  Docker deploy path (build args + `HOSTNAME`).
- Recreate the Render frontend service as a Docker **web service** named `a2a-firewall` so the
  hostname `a2a-firewall.onrender.com` is retained.
- Re-point the GitHub `RENDER_FRONTEND_HOOK` secret.

**Out of scope (deliberately deferred)**

- CI guard asserting `.next/standalone/server.js` exists after build (this failure class is
  still only caught on Render).
- Render section in [`deployment-guide.md`](deployment-guide.md) / [`RUNBOOK.md`](RUNBOOK.md).
- Frontend test harness — `npm test` is currently `echo 'No frontend tests'`, so there is no
  frontend coverage gate to meet.
- Stale-URL cleanup (`a2a-firewall-backend.onrender.com` / `a2a-firewall-frontend.onrender.com`
  still appear in `HANDOFF.md`, `PPT_AGENT_CONTEXT.md`, `scripts/run_case_study.py`,
  `backend/tests/load/`). Live hosts are `a2a-firewall1.onrender.com` (backend) and
  `a2a-firewall.onrender.com` (frontend).
- Dockerfile base image stays `node:20-alpine` — `next@16.3.6` requires `node >= 20.9.0`.

---

## 5. Phase 1 — Repository Changes

### 5.1 Dependency bump

[`frontend/package.json`](../frontend/package.json) — both are pinned exactly today; keep that
style:

```diff
   "dependencies": {
-    "next": "16.2.10",
+    "next": "16.3.6",
     "react": "19.2.4",
     "react-dom": "19.2.4",
   ...
   "devDependencies": {
-    "eslint-config-next": "16.2.10",
+    "eslint-config-next": "16.3.6",
```

Advisories cleared by this bump (all in `<16.3.3` / `<16.2.11`):

| Severity | Advisory | Note |
|:---|:---|:---|
| critical | GHSA-p293-qw3h-jr36 | unauthenticated RCE on Windows-hosted servers |
| critical | GHSA-2xp9-vwfh-vxw4 | unauthenticated RCE via AVIF image optimization |
| high | GHSA-6gpp-xcg3-4w24 | middleware/proxy bypass (Turbopack, single locale) |
| high | GHSA-89xv-2m56-2m9x | SSRF in server actions on custom servers |
| high | GHSA-p9j2-gv94-2wf4 | SSRF in `rewrites` via attacker-controlled destination |
| high | GHSA-m99w-x7hq-7vfj / GHSA-q8wf-6r8g-63ch / GHSA-955p-x3mx-jcvp | DoS + info disclosure |
| moderate | GHSA-68g3-v927-f742, GHSA-4633-3j49-mh5q, GHSA-4c39-4ccg-62r3 | cache confusion / payload limits |

It also pulls patched `postcss` and `sharp` transitives.

### 5.2 Dockerfile: build arguments for `API_BASE_URL`

Render translates service env vars into Docker build args, but a build arg is only visible if
the Dockerfile declares an `ARG`. `NEXT_PUBLIC_API_URL` already is; `API_BASE_URL` is not —
and `rewrites()` in `next.config.ts` runs at **build** time. Without this, the rewrite
destination silently falls back to `http://127.0.0.1:8000` (the frontend container itself).

```diff
 FROM base AS builder
 COPY --from=deps /app/node_modules ./node_modules
 COPY . .
 ARG NEXT_PUBLIC_API_URL
 ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
+ARG API_BASE_URL
+ENV API_BASE_URL=$API_BASE_URL
 RUN npm run build
```

Optional hardening: give both args the same default so a forgotten dashboard variable still
produces a working deploy instead of a loopback URL:

```diff
-ARG NEXT_PUBLIC_API_URL
+ARG NEXT_PUBLIC_API_URL=https://a2a-firewall1.onrender.com
 ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
-ARG API_BASE_URL
+ARG API_BASE_URL=https://a2a-firewall1.onrender.com
 ENV API_BASE_URL=$API_BASE_URL
```

Neither value is a secret, so baking it into the image layer is safe.

### 5.3 Dockerfile: bind to `0.0.0.0`

Docker sets `HOSTNAME` to the container ID at runtime, overriding the image's
`ENV HOSTNAME="0.0.0.0"` (line 28). Standalone `server.js` reads `process.env.HOSTNAME`, so
the server binds to the container IP instead of all interfaces — the classic "build and deploy
succeed, service is unreachable" failure that costs a redeploy cycle to diagnose.

```diff
-CMD ["node", "server.js"]
+CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
```

BusyBox `sh` is present in `node:20-alpine`; `exec` keeps PID 1 signal semantics so Render's
zero-downtime deploys still shut down cleanly.

### 5.4 Lockfile

```bash
cd frontend
npm install next@16.3.6 --save-exact
npm install --save-dev eslint-config-next@16.3.6 --save-exact
npm audit fix        # dev-only transitives: brace-expansion, browserslist, js-yaml,
                     # nanoid, baseline-browser-mapping
```

`npm audit fix` without `--force` stays inside existing semver ranges, so it only touches
transitive entries in `package-lock.json`.

---

## 6. Phase 2 — Verification Pipeline

Protocol steps 1-6, scoped to the frontend. The backend has no diff, so its integration/e2e
suites are not re-run.

```bash
cd frontend

# Step 1 — lint
npm run lint

# Step 2 — type check
npx tsc --noEmit

# Step 3 — build (with the same values Render will bake in)
NEXT_PUBLIC_API_URL=https://a2a-firewall1.onrender.com \
API_BASE_URL=https://a2a-firewall1.onrender.com \
  npm run build

# Step 4 — the assertion Render's publish step failed to make
test -f .next/standalone/server.js && echo "standalone OK"
grep -rl "a2a-firewall1.onrender.com" .next/static/chunks | head

# Step 5 — container build (the exact artifact Render builds)
docker build -f Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://a2a-firewall1.onrender.com \
  --build-arg API_BASE_URL=https://a2a-firewall1.onrender.com \
  -t a2a-firewall-frontend:test .

# Step 6 — smoke test the image
docker run --rm -p 3100:3000 a2a-firewall-frontend:test
curl -sf http://127.0.0.1:3100/            # expect 200
curl -sf http://127.0.0.1:3100/dashboard   # expect 200
curl -sf http://127.0.0.1:3100/dashboard/traces/abc  # expect 200 (dynamic route, client-fetched)
docker run --rm a2a-firewall-frontend:test sh -c "cat /proc/net/tcp | head"  # bound on 0.0.0.0

# Security audit — target: 0 critical, 0 high
npm audit
```

Expected `npm audit` before the bump: 1 moderate, 6 high, 1 critical. After: only moderate
advisories at worst, none high/critical.

On PowerShell the env-var prefix form does not apply — use
`$env:NEXT_PUBLIC_API_URL="..."; $env:API_BASE_URL="..."; npm run build`.

## 7. Phase 3 — Render Dashboard (manual)

Render will not convert a Static Site into a Web Service, so the service is recreated. Delete
first, so the hostname is released and can be reclaimed.

1. Note the current static site's deploy-hook URL, then **delete** the `a2a-firewall` static
   site.
2. Create a new service:

   | Setting | Value |
   |:---|:---|
   | Type | Web Service |
   | Repository | `mananjp/a2a-firewall` |
   | Branch | `main` |
   | Language / Runtime | **Docker** |
   | Dockerfile Path | `./frontend/Dockerfile` |
   | Docker Context | `./frontend` |
   | Region | same as the existing services (US) |
   | Instance Type | Free |
   | Health Check Path | `/` |
   | Name | `a2a-firewall` (reclaims `a2a-firewall.onrender.com`) |

3. Set these env vars **before the first deploy** — Render passes them to the build as args, and
   `NEXT_PUBLIC_*` is inlined at build time:

   | Key | Value |
   |:---|:---|
   | `NEXT_PUBLIC_API_URL` | `https://a2a-firewall1.onrender.com` |
   | `API_BASE_URL` | `https://a2a-firewall1.onrender.com` |
   | `NODE_ENV` | `production` |

4. Update the GitHub Actions secret `RENDER_FRONTEND_HOOK` to the new service's deploy hook —
   [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) line 30 posts to it.

5. Keep [`render.yaml`](../render.yaml) as-is. It is already correct; if the service is ever
   recreated from the blueprint instead, name the service `a2a-firewall-frontend` and update
   `ALLOWED_ORIGINS` on the backend plus the frontend URLs in
   `docs/case_study_guide.md`, `sdk/README.md`, `sdk-ts/README.md`, and
   `docs/strategy/production_roadmap.md`.

## 8. Phase 4 — Post-Deploy Verification

```bash
curl -sI https://a2a-firewall.onrender.com/            # expect 200
curl -s  https://a2a-firewall.onrender.com/ | head -c 400
```

- Load `/dashboard` in a browser: the page shell renders and the network tab shows XHRs to
  `https://a2a-firewall1.onrender.com/...` (not to same-origin `/v1`).
- Open `/dashboard/traces/<id>` — the dynamic route resolves and fetches.
- Confirm the backend's `ALLOWED_ORIGINS` still contains `https://a2a-firewall.onrender.com`
  (it does today — [`render.yaml`](../render.yaml) line 21).
- Confirm the backend logs show no CORS rejections.

## 9. Rollback

`git revert` the Phase 1 commit and re-trigger the deploy hook. The hostname survives as long
as the new service exists — rollback is a redeploy, not a service rebuild. Do **not** recreate
a static site; the app cannot be statically exported (section 3).

## 10. Risks

| Risk | Impact | Mitigation |
|:---|:---|:---|
| **Free web services sleep after ~15 min idle** — a real behavioural regression from a static site, which never slept | First visitor of each session waits on a cold start (typically 30-60s) before the page shell appears | [`monitoring/uptimerobot.yml`](../monitoring/uptimerobot.yml) already keeps the backend warm; add a frontend monitor to `/` so the container stays resident during demo/recording windows |
| Cold start exceeds Render's 60s on the Free plan | Render may mark deploys unhealthy | Verify the Health Check Path responds before the first recording window |
| `API_BASE_URL` still missing in the dashboard | `/v1/*` rewrite silently points at `127.0.0.1:8000`; only the relative-path fallback is affected (the client uses absolute `NEXT_PUBLIC_API_URL`) | Section 5.2 ARG defaults |
| `HOSTNAME` binds to container IP | Service unreachable despite a green build | Section 5.3 |
| `next@16.3.6` is a new minor | Behaviour change in a Next release | Full lint/typecheck/build/container smoke test in Phase 2 before deploying |

## 11. Open Item (blocks end-to-end validation)

`https://a2a-firewall1.onrender.com/health` and `/ready` both returned **503** while preparing
this document. A Free-tier cold start explains it, but the backend is a Docker service with no
publish-path problem. If it is still 503 after a few minutes, check the backend service's logs
before validating the frontend — the dashboard is useless while the API is down.

## 12. Definition of Done

- [ ] `npm run lint` clean
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` succeeds and `.next/standalone/server.js` exists
- [ ] `docker build -f frontend/Dockerfile -t a2a-firewall-frontend:test frontend` succeeds
- [ ] Container smoke test returns 200 on `/`, `/dashboard`, `/dashboard/traces/<id>`
- [ ] `npm audit` reports no high or critical advisories
- [ ] Render service is a Docker **web service** named `a2a-firewall` on the Free plan
- [ ] `https://a2a-firewall.onrender.com/` returns 200
- [ ] `RENDER_FRONTEND_HOOK` secret updated
- [ ] Backend `/health` returns 200
- [ ] Commit message follows the repo's conventional-commit style (`fix(render): ...`,
      `chore(deps): ...`); do not commit unless asked
