# A2A Firewall n8n Node — Verification Checklist (v0.1.0)

> This checklist is the acceptance gate for the `n8n-nodes-a2a-firewall` community
> node package. Work through it before tagging and publishing. The backend contract
> it must satisfy is locked by `backend/tests/integration/test_api_contract.py` and
> `backend/tests/unit/test_contract_and_callbacks.py`.
>
> Status legend: `[ ]` not verified · `[x]` verified · `[n/a]` not applicable

---

## 1. Static & build

- [ ] `npm ci` succeeds (lockfile in sync with `package.json`)
- [ ] `npm run lint` (tsc --noEmit) passes with zero errors
- [ ] `npm test` (jest) — all unit tests green: verdict parsing, tokenize/detokenize body construction, inspect-response field mapping
- [ ] `npm run build` produces `dist/` **including icons** (`node scripts/copy-assets.js` runs after tsc)
- [ ] `npm pack --dry-run` contains only `dist/` + `index.js` (no `node_modules`, no `src/`, no test files)
- [ ] `package.json` is valid for the n8n community registry:
  - `n8n.n8nNodesApiVersion: 1`
  - `main` → `index.js` (built, not TS)
  - `license: MIT`, `author`, `repository`, `homepage` set
  - zero runtime dependencies; `n8n-workflow` only a dev/peer dep
  - `files` whitelist present
- [ ] Both `.credentials.js` and `.node.js` files referenced in `n8n.nodes`/`credentials` exist in `dist/`

## 2. Contract lock (run by the backend repo, must pass)

Run with a live stack (see `examples/n8n-sidecar/`):

```bash
cd backend
TEST_DATABASE_URL=postgresql+asyncpg://a2a:a2apassword@localhost:5432/a2afirewall \
TEST_BACKEND_URL=http://localhost:8000 \
.venv/bin/pytest tests/integration/test_api_contract.py -v
```

- [ ] `POST /v1/firewall/inspect` accepts the body `A2aFirewallGuard` emits
      (`task_id`, `receiver_agent_id`, `task_type`, `payload`, `root_task_id`,
      `review_callback_url`, `nonce`, `timestamp`, `metadata`) → returns
      `decision | allowed_to_proceed | risk_score | violations | evidence_id`
- [ ] `POST /v1/firewall/inspect-response` accepts `{response_body, context, redact_pii}`
      → `redacted_body` mapped to the sanitized output field
- [ ] `POST /v1/dlp/tokenize` accepts `{text, destination, entity_type}` → `tokenized_text`
- [ ] `POST /v1/dlp/detokenize` accepts `{text, purpose}` → `text`
- [ ] **detokenize uses a workspace API key, not an agent key** — the backend now
      rejects agent keys on detokenize (403/401). If the DLP node's Detokenize
      credential is an *agent* key, switch it to a **workspace** key and re-test.
- [ ] Retrying `inspect` with the same `task_id` returns the cached decision
      (`idempotent_replay: true`) — one audit record, no double-write

## 3. Runtime e2e (docker compose)

Using `examples/n8n-sidecar/docker-compose.yml` (n8n + A2A Firewall backend + HTTP proxy):

- [ ] Containers come up; backend `/health` and `/ready` return ok
- [ ] `NO_PROXY` is set so firewall → firewall traffic is not self-inspected
- [ ] Workflow **Clean input** → `decision: ALLOW`
- [ ] Workflow **Prompt injection string** → `decision: BLOCK`
- [ ] Workflow **PII text** → routed to `REVIEW`/`BLOCK` as configured; tokenize path replaces PII with `tok_*` tokens and detokenize round-trips them
- [ ] **Fail-closed**: stop the firewall container → item goes to BLOCK
- [ ] **Fail-open option**: with "On Firewall Error → Allow" → item proceeds and `_a2aFirewall.error` is set on the output
- [ ] **Review callback flow**: Guard→Review (`Wait`, `resumeUrl`=Review callback) → analyst `POST /v1/review/{token}/decide` → n8n webhook resumes the workflow

## 4. Security / hygiene (vs backend norms)

- [ ] No secrets in node output or workflow params (API keys live only in credentials)
- [ ] Node error messages don't echo request bodies or API keys
- [ ] No machine-local absolute path links (the `file:` + `///` style) in `README.md` — backend CI fails on these
- [ ] README is MIT-licensed with a pointer to the package license

## 5. Signing — decision required before v0.1.0

The `shared` client currently carries an **inert** Ed25519 `canonicalize`/`signBody`
path plus an "Agent Private Key" credential field. The backend **ignores**
`signature`/`payload_sha256` — it verifies the SDK-style `sender_signature` +
`message_hash` scheme instead. Pick one:

- [ ] **Option A (recommended)**: remove the dead signing path + the `agentPrivateKey`
      credential field for v0.1.0; document that signed payloads land in v0.2.0 with
      a backend test.
- [ ] **Option B**: keep as-is, but mark the option "reserved / ineffective" in the
      node UI so users aren't misled.
- [ ] **Option C**: wire the SDK's `sender_signature`+`message_hash` scheme now and
      add a backend unit test proving the server verifies it.

## 6. Publish readiness

- [ ] `n8n-node-v0.1.0` tag pushes → `.github/workflows/n8n-node.yml` runs lint → test → build → publish (npm provenance)
- [ ] GitHub Actions secret `NPM_TOKEN` configured for the `n8n-nodes-a2a-firewall` package
- [ ] Package name/version does not already exist on npm (`npm view n8n-nodes-a2a-firewall`)
- [ ] `npm run build` artifact imported locally into n8n (`Settings → Community nodes → Install local package`) with one workflow smoke-tested

---

**Sign-off**

Role | Name | Library (static) | Contract (integration) | Runtime e2e | Date
---|---|---|---|---|---
Owner (email/handle) | | | | |
Backend contract owner | | | | |