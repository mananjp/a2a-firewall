# A2A Firewall — Implementation Plan & Progress

This file is the implementation working plan for the **confused-deputy /
delegation-chain trust** feature track. The strategic rationale is in
`../HANDOFF.md` and `../what changes can i make to my project to have an e.md`
(Lakera-edge research).

> **Audience**: AI agents and humans resuming work. Update this file whenever a
> phase advances.

---

## Big picture

The project is building toward the **delegation-chain trust** differentiator
identified in the Lakera-edge research. Concretely:

1. A 5-layer detection pipeline (`layer0` preflight → `layer5` decision) plus
   identity (Ed25519) and delegation (macaroon) verification.
2. A **non-amplification** invariant: at every delegation hop, the child
   agent's requested capabilities must be a STRICT SUBSET of the parent
   caveats. This is the confused-deputy defense.
3. **Intent-binding** (Phase 3): the child payload must remain consistent
   with the root task's declared intent.
4. **Delegation-chain audit log** (Phase 4): first-class audit trail and
   audit endpoint.
5. **Pipeline + docs verification** (Phase 5): full CI, docs, ADRs.

The original MVP is already complete (Phases 0 and 1 below).

---

## Phase tracker

| Phase | Description | Status | Last commit | Tests |
|---|---|---|---|---|
| 0 | Baseline: backend pipeline + frontend build | ✅ Done | pre-Phase-2 | full unit suite green |
| 1 | Identity / delegation hardening (salted root key, registered-key verification, config depth, key encoding) | ✅ Done | pre-Phase-2 | `test_identity_delegation.py` — 30+ tests |
| 2 | Non-amplification enforcement (core/scope.py + layer2 + delegation scope check) | ✅ Done | phase-2 | `test_scope.py` (22) + `test_non_amplification.py` (4) |
| 3 | Intent-binding (migration 004, SDK, Groq intent dimension, lineage) | ✅ Done | phase-3 | `test_intent_binding.py` (7) |
| 4 | Delegation-chain audit log (populate chains, audit endpoint, frontend audit page) | ✅ Done | phase-4 | `test_audit_endpoint.py` (5) + frontend page |
| 5 | Full pipeline verification + docs (env example, README, RUNBOOK, ADR, demo scenario) | ✅ Done | phase-5 | Full pipeline green (77 unit tests) |

---

## Phase 2 — Non-amplification (this commit)

### What changed

**New files**

- `src/a2a_firewall/core/scope.py` — two pure functions:
  - `parse_requested_scope(request_data) -> set[str]`
  - `is_subset(child, parent_caveats) -> bool`
- `tests/unit/test_scope.py` — 22 unit tests (Red → Green).
- `tests/integration/test_non_amplification.py` — 4 integration tests
  (widening blocked, narrowing allowed, unparented task_type rejected,
  no-token back-compat). Skipped without `TEST_DATABASE_URL`.

**Modified files**

- `src/a2a_firewall/detection/layer2_permissions.py` — `check_permissions`
  now takes an optional `parent_caveats: list[str] | None = None` parameter.
  When provided, the new non-amplification check is the **first** resolution
  step; on failure it short-circuits with
  `{"allowed": False, "check": "non_amplification_violation", ...}`.
- `src/a2a_firewall/detection/orchestrator.py` — after the delegation token
  is verified, the parent's caveats are extracted into a new local
  `parent_caveats` variable and passed through to `check_permissions`. When
  `check_permissions` returns the new violation, a critical-severity
  `non_amplification_violation` entry is added with `details.requested` and
  `details.parent_caveats` for the audit trail.

### Why this is the "real" edge

The confused-deputy attack works because a low-privilege agent is tricked
into asking a high-privilege agent to do something the human never
authorized. **Non-amplification** is the smallest possible change that
breaks that chain: the receiver cannot act on a request whose requested
capability was not already present in the *sender's* delegation token.

We do not require the human to enumerate every allowed delegation; the
macaroon caveats already in the wire format *are* the policy. We just
verify that the child request stays within them.

### Pipeline results (this run)

```
ruff check src tests       → All checks passed!
ruff format --check        → 59 files already formatted
mypy src                   → Success: no issues found in 44 source files
pytest tests/unit -v       → 65 passed (22 new in test_scope.py)
pytest tests/unit --cov    → core/scope.py 94% line coverage (50 stmts, 3 miss)
pytest tests/integration   → 21 skipped (no TEST_DATABASE_URL); file parses
pip-audit                  → No known vulnerabilities found
```

### Design notes (for future agents)

- **Why `parent_caveats is not None` and not just truthy/falsy?** The check
  must be gated on "is a delegation token present at all?" — an empty list
  is a *valid* parent-caveat set meaning "the parent granted no caveats at
  all," and `is_subset(set(), [])` returns True. Using `is not None` makes
  the gate explicit: enforce iff a token was supplied.
- **Why surface the violation in the orchestrator rather than
  `check_permissions` itself?** Keeping `check_permissions` pure (no DB
  writes, no telemetry) means it can be unit-tested and reused. The
  orchestrator owns telemetry/DB writes; the violation is just a marker.
- **Why a single new `violation_type`?** The existing
  `sender_not_permitted` covers *who* may talk to *whom*. `non_amplification_violation`
  covers *what* may be asked across a hop. Conflating them loses the
  audit signal the demo needs.
- **Why didn't we change `core/delegation.py`?** The macaroon already
  rejects widening at *attenuation* time (the parent-of-parent can't widen).
  Phase 2 closes the second attack surface: widening at *request* time
  (the child asks for more than its token grants). Both are needed; only the
  second is new in this phase.

### What is NOT in this phase (intentionally)

- Migration 004 / new `root_intent` column on `tasks` — Phase 3.
- A separate `audit/delegation_chain` endpoint — Phase 4.
- Frontend audit page — Phase 4.
- Per-workspace policy config for non-amplification mode (currently
  always-on when a token is present) — could be added later if a workspace
  needs to opt out.
- Multi-hop child-token verification (where the child's `delegation_token`
  also needs to satisfy *its* parent). The current implementation
  single-hop: the token supplied with the current request is checked
  against that request. Multi-hop verification will be needed when
  agents start forwarding tokens — likely Phase 4 or 5.

### File-touch summary for the next agent

```
src/a2a_firewall/core/scope.py                          (new, 80 LOC)
src/a2a_firewall/detection/layer2_permissions.py        (+18 LOC)
src/a2a_firewall/detection/orchestrator.py              (+28 LOC)
tests/unit/test_scope.py                                (new, 145 LOC)
tests/integration/test_non_amplification.py             (new, 215 LOC)
```

---

## Phase 3 — Intent-binding (planned, not started)

### Goal
Verify that a child delegation's payload remains consistent with the **root
task's declared intent** ("intent-bound sessions" — Iden playbook). The
current payload drifts outside the declared purpose ⇒ block.

### Concrete deliverables
1. **Migration 004** — add `tasks.declared_intent TEXT` (the root task's
   purpose text) and `tasks.intent_drift_score FLOAT` columns.
2. **SDK** (`sdk/` and `sdk-ts/`) — accept an optional `declared_intent`
   field on root task creation; pass it through to the firewall.
3. **Layer 4 Groq prompt** — add an `intent_consistency` dimension to the
   JSON schema. Ask Groq to score 0.0–1.0 whether the current payload
   "is consistent with the root intent." Persist on the task row.
4. **Layer 2 / orchestrator wiring** — when the root task has a
   `declared_intent` and the current `intent_drift_score > 0.7` (configurable),
   append a `intent_drift` violation and block.
5. **Unit + integration tests** — Groq mock, intent-drift block, missing
   intent back-compat.

### Open design questions to resolve before starting
- Where does `declared_intent` come from? SDK-supplied? Auto-extracted from
  the first user prompt via Groq? Both?
- Threshold config: per-workspace or global?
- Does this apply to plain (un-tokenized) requests, or only to delegated
  ones? (Recommend: only when there's a root intent AND a delegation
  token — that's the confused-deputy scenario.)

### Estimated size
~350 LOC across migration, layer4_groq.py, orchestrator.py, tests.

---

## Phase 4 — Delegation-chain audit log (planned, not started)

### Goal
Turn the existing `DelegationChain` table into a first-class audit feature:
populate it on every delegation-bearing inspection, expose a GET endpoint
for reconstruction, and surface it in the frontend.

### Concrete deliverables
1. **Orchestrator** — on every inspection where a delegation token is
   present and verified, write a `DelegationChain` row (already exists in
   the schema at `db/models.py:220` but is never written).
2. **API** — `GET /v1/tasks/{task_id}/delegation-chain` returning the
   full ordered hop list with sender, receiver, depth, caveats, and
   signature validity.
3. **Audit endpoint** — `GET /v1/audit/delegation-chains?workspace_id=...
   &since=...` for compliance export (JSON + CSV).
4. **Frontend** — new `/audit` page with a react-flow tree of the
   delegation chain for a selected task.
5. **Tests** — unit (orchestrator writes a row), integration (GET
   endpoint shape, multi-hop reconstruction), e2e (frontend renders).

### Estimated size
~600 LOC across orchestrator, API, frontend page, tests.

---

## Phase 5 — Pipeline + docs (planned, not started)

### Goal
Make the whole project production-ready from a CI/CD and documentation
standpoint.

### Concrete deliverables
- `.env.example` updated with `DELEGATION_MAX_DEPTH`,
  `DELEGATION_DEFAULT_EXPIRY_SECONDS`, `INTENT_DRIFT_THRESHOLD`.
- `README.md` updated with a "Confused-deputy defense" section
  explaining non-amplification + intent-binding + audit log.
- `RUNBOOK.md` for ops: rotating workspace root key, replaying a
  delegation chain, recovering from a corrupted macaroon.
- `docs/ADR-0001-non-amplification.md` recording the decision.
- `docs/demo-scenario.md` with copy-paste curl commands showing the
  confused-deputy attack being blocked.
- Full pipeline (lint, format-check, typecheck, unit, integration, build,
  audit) green in `.github/workflows/ci.yml`.

### Estimated size
~200 LOC of markdown + CI workflow update.

---

## How to resume work

1. Read this file. Check the phase tracker at the top.
2. Read `HANDOFF.md` for project context.
3. Run `make test-unit` from `backend/` to confirm baseline green.
4. If continuing Phase 3, start with the design questions; if Phase 4, the
   `DelegationChain` model is already there — just not written to.
5. Always re-run the full pipeline before claiming a phase complete (see
   the backend-engineering skill loaded in this project).

## Commands cheat-sheet

```bash
# from backend/
make install        # one-time
make test-unit      # fast: no DB
make test-int       # needs TEST_DATABASE_URL + running stack
make pipeline       # full: lint, format-check, typecheck, test, build, audit
make migrate        # apply Alembic to DATABASE_URL
```
