# A2A Firewall — Production & Go-to-Market Roadmap (v2, corrected)

*This revises the earlier version, which relied on HANDOFF.md and was wrong about
how much of the enterprise feature set actually exists. The `feat/smoke-test-fixes`
branch was checked directly (source, not docs) before writing this version.*

---

## 0. What's Actually True (Verified Against Source)

HANDOFF.md undersold this project. The real branch has substantial, tested
implementations, not stubs:

| Feature | File(s) | Status |
|---|---|---|
| Ed25519 signing + hash-chained lineage | `core/signing.py` (236 lines) | Real crypto: sign/verify, tamper-evident chain hashing |
| Macaroon-style delegation attenuation | `core/delegation.py` (279 lines) | Implemented, tested (`test_delegation_chain_write.py`, `test_non_amplification.py`) |
| Agent identity ledger | `core/identity.py` (193 lines) | Implemented, tested (`test_identity_delegation.py`, 356 lines of tests) |
| RBAC (standard + custom roles) | `core/rbac_manager.py`, `api/routes/rbac.py` | Implemented, tested |
| SCIM 2.0 schema formatting | `api/routes/scim.py` (420 lines) | Implemented, tested |
| Spend/token budget enforcement | `core/spend_manager.py` (182 lines) | Implemented, tested (`test_spend_limit_enforcement_blocking`) |
| Network/CIDR/IP allowlisting | `core/network_security.py` (158 lines) | Implemented, tested |
| Data retention floors | `core/retention_engine.py` (205 lines) | Implemented, tested |
| Anti-pentest / honeytoken defense | `core/anti_pentest.py` (207 lines) | Implemented |
| Compliance packs, CVE lookup, PII patterns | `detection/{compliance_packs,cve_lookup,pii_patterns}.py` (~900 lines combined) | Implemented |
| All 20+ routers | `main.py` | Actually mounted, not orphaned |
| The mypy CI failure HANDOFF flagged | `core/telemetry.py` | Already fixed on this branch |

**Two gaps confirmed by reading the code directly, not assumed:**

1. **`api/routes/auth.py`** — the file's own docstring says this is dev-only: email
   in, API key rotated and returned, no password, disabled when `DEBUG=false`.
   Explicitly states real auth is "out of MVP scope."
2. **`core/rate_limit.py`** — the file's own docstring says it's in-memory,
   single-process, and "Redis (deferred per plan: no Redis in this build)."

Everything else in the earlier version of this document that questioned whether
the README's claims were real — retract that. They're real. The only credibility
risk left is that the **live homepage and dashboard demo present cryptographic
identity, RBAC, SCIM, and compliance scoring as fully operational**, while the two
gaps above mean the product isn't safe to put in front of a second real user yet
regardless of how complete the detection pipeline is. That's a narrower and much
better problem to have.

---

## 1. Production Hardening — Revised Priority List

With the corrected picture, the list is shorter and sharper than before.

### 1.1 Real authentication (the one true blocker)
This is the single item standing between "impressive demo" and "safe to hand to
a second person." Options, roughly in order of speed to ship:
- **Fastest**: password auth with Argon2id, added directly to `auth.py` — a few
  hours of work given the rest of the auth plumbing (API key generation, hashing)
  already exists.
- **Better long-term**: OAuth/OIDC via Clerk or WorkOS free tier, since you'll
  want SSO for enterprise buyers anyway given the SCIM work already done — SCIM
  without any real identity provider integration behind it is only half the
  story.
- Either way: keep the current dev-login path, but gate it behind
  `DEBUG=true` only (already done) and make sure it's not reachable in the
  Render production deployment's env config specifically, not just by default.

### 1.2 Distributed rate limiting
Same fix needed as before — the in-memory sliding window won't survive a second
backend instance. Given you've already built spend/token budget enforcement
(`spend_manager.py`) which almost certainly needs the same "durable counter
shared across processes" primitive, solving this once (Postgres-backed counter,
or Upstash Redis free tier) benefits both `rate_limit.py` and any future
multi-instance spend tracking. Worth designing them together rather than fixing
rate limiting in isolation.

### 1.3 Reconcile the demo with reality
The live sandbox at a2a-firewall.onrender.com shows a simulated flow (client-side
animation) rather than live backend calls for some of the "Dispatch Flow"
interaction — verify which parts of `/dashboard/demo` are hitting real endpoints
(`simulation.py`, `demo.py`) versus rendering canned data. If any of it is canned,
that's fine for a landing page, but say so in the code/comments so nobody
mistakes it for the actual inspection pipeline later, and make sure the "6-Gate
Pipeline" language on the homepage matches the actual layer count in
`detection/orchestrator.py` (worth double-checking now that `layer3b_cve_risk.py`
exists — is it 6 gates or 7+ now?).

### 1.4 Observability in production
Confirm `OTEL_SDK_DISABLED` isn't still set to `true` in the Render env — if
lineage tracing is the core value prop and it's off in prod, that's worth fixing
regardless of how complete everything else is.

### 1.5 Database durability
Same as before: confirm Render Postgres free tier backup/PITR situation before
any real customer or design-partner data goes in. With this much schema now
(8 migrations, `008_enterprise_governance.py` alone implies a lot of new tables),
this matters more now than it did at MVP stage, not less.

### 1.6 Secrets management
`GROQ_API_KEY` and `SECRET_KEY` as plain Render env vars is fine solo; move to a
proper secrets manager before a design partner's traffic (and therefore your
Groq bill and signing key) depends on it.

---

## 2. Tests & Benchmarks You Need Before You Can Sell This

This section is unchanged from the earlier version in substance — the need for
measured evidence doesn't depend on how much of the feature set is real. If
anything, having genuine Ed25519/RBAC/SCIM machinery makes the accuracy and
security benchmarks *more* valuable to produce, because you can now credibly
claim things a pure-LLM-classifier competitor can't.

### 2.1 Detection accuracy benchmark
- Expand `tests/attack_corpus` to 200+ malicious payloads across categories
  (role override, instruction smuggling, context poisoning, SQLi-style,
  exfiltration, circular delegation, privilege escalation) and 200+ benign
  edge-case payloads.
- Report true positive rate, false positive rate, detection breakdown by layer
  (now especially interesting given you have both `layer3_rules.py` and
  `layer3b_cve_risk.py` plus the Groq layer — show which layer is doing the
  real work), and p50/p95/p99 latency per decision path.
- The homepage already claims "< 20ms p99 inspection latency" — verify that
  number against a real benchmark run, not the demo animation, before it goes
  in front of a technical buyer who will absolutely test it themselves.

### 2.2 Load and failure testing
- `locust`/`k6` load test against the real Render deployment.
- Explicitly test: Groq rate-limited mid-burst, DB pool exhaustion, backend
  killed mid-inspection (confirm no half-written state across
  tasks/violations/trace_events/delegation tables — there are more tables now
  than the original schema, so this transaction boundary is worth re-verifying).
- Test the signature verification path under load specifically — Ed25519 verify
  is cheap but worth confirming it's not a hidden bottleneck at volume.

### 2.3 Independent security review
- Run `bandit` and `pip-audit` on the real dependency set now, given the crypto
  surface area (`cryptography` library usage in `signing.py` is exactly the kind
  of thing worth an external eye).
- Get one outside pentest pass specifically against the signature/delegation
  verification logic — that's now a real attack surface (can someone forge a
  chain hash, replay with a stale nonce, or escalate through a malformed
  Macaroon caveat?) rather than a hypothetical one.
- SOC 2 Type I becomes a genuinely reasonable near-term target now (6 months out
  rather than "don't chase it yet") given RBAC, SCIM, audit logging, and
  retention controls already exist — Vanta/Drata startup programs are worth a
  serious look once you have the auth gap closed.

---

## 3. Case Study Structure

Unchanged in structure from the earlier version, but the content is stronger
now because you're not just showing a Groq classification catching a bad
prompt — you can show the full defense-in-depth story:

1. **The scenario** — realistic multi-agent pipeline mapped to a buyer's world.
2. **The attack** — injected payload, arriving the way it actually would.
3. **Without the firewall** — downstream agent acts on it.
4. **With the firewall** — now show *which* layer caught it. A privilege
   escalation attempt caught by Macaroon caveat attenuation (cryptographically
   provable, not just "the LLM said so") is a materially stronger claim than
   "Groq flagged it." Lead with whichever layer is doing genuine deterministic
   work; keep Groq's semantic catch as the second example, since "we don't rely
   solely on an LLM to catch attacks" is a real differentiator once you have
   RBAC/signing/rules doing the deterministic heavy lifting.
5. **The lineage** — show the hash-chained trace proving the payload wasn't
   tampered with between hops, not just an execution tree. That's a much more
   concrete audit story than the original plan had access to.
6. **The numbers** — real latency and false-positive numbers from Section 2.1.
7. **What it would have cost** — quantify the counterfactual for the buyer's
   domain.

---

## 4. Productization & Go-to-Market

### 4.1 Who you're actually selling to
This is where the corrected picture changes the earlier recommendation most.
The original version said "start with PLG/framework integrations, the
regulated-industry play is 6-12 months out." Given what's actually built —
RBAC, SCIM, audit logs, compliance packs, retention controls — **the regulated/
enterprise play (Option B) is much closer than that estimate assumed**. The gap
to a credible enterprise pilot is now specifically: real auth (Section 1.1) and
one external security validation pass (Section 2.3), not a 6-12 month build-out.

Still worth sequencing rather than doing both at once:
- **Near-term**: close the auth gap, run the accuracy/load benchmarks, get one
  external pentest pass. This is weeks, not months, given the feature work is
  already done.
- **Then**: the Finspark/banking framing you already drafted in
  `PPT_AGENT_CONTEXT.md` stops being a hackathon narrative reframe and becomes
  a genuinely defensible pitch, because RBI/DPDP/HIPAA/PCI-DSS compliance
  scoring, audit trails, and retention controls are real, tested code.
- **PLG/framework motion is still worth doing in parallel**, not instead —
  publishing the SDK and getting self-serve users generates the real-world
  traffic data and design-partner testimonial that strengthens the enterprise
  pitch, and it's cheap to run alongside.

### 4.2 Pricing
- Given the enterprise feature set is real, a two-tier structure makes more
  sense now than pure usage-based PLG pricing: a free/self-serve tier
  (inspection volume capped, no RBAC/SCIM) to drive adoption and the case-study
  data point, and a paid enterprise tier (RBAC, SCIM, audit export, compliance
  packs, spend governance) priced per-workspace or per-agent-seat, which is
  defensible now that those features aren't vaporware.
- Look at how Arize/Langfuse price the observability-adjacent tier, but also
  look at how security-gateway products (e.g., API gateway / WAF vendors) price
  the compliance tier specifically — you're now closer to that second category
  than pure LLM-observability tooling.

### 4.3 Distribution
- Publish the SDK to PyPI.
- Write LangGraph/CrewAI integration guides — still true regardless of feature
  completeness, since discovery still runs through "does this work in my stack."
- The homepage copy is already enterprise-sales-ready in tone ("Zero-Trust Agent
  Mesh," "cryptographic lineage") — make sure the SDK quickstart and docs match
  that level of polish, since right now the gap between landing-page polish and
  onboarding-doc polish is probably the more visible mismatch to a visitor than
  anything about feature completeness.

### 4.4 Legal/operational basics
Unchanged: ToS/Privacy Policy before any real traffic, and now that retention
and compliance-pack code exists, actually wire it to a documented, public data
retention policy — the code being real means the policy claims need to be real
too, not just directionally true.

---

## 5. Suggested Sequencing (Next 4-6 Weeks — Shorter Than Before)

1. **Week 1**: Real auth (password or OAuth/OIDC). Confirm `OTEL_SDK_DISABLED`
   is off in prod. Verify which parts of `/dashboard/demo` are live vs. simulated
   and label accordingly.
2. **Week 2**: Move rate limiting off in-memory state (design it alongside
   spend_manager's durability needs). Confirm DB backup/PITR situation.
3. **Week 3**: Build the 400-item labeled attack/benign corpus, run the accuracy
   benchmark, verify the "< 20ms p99" claim against real numbers, run load +
   failure-mode tests.
4. **Week 4**: One external pentest pass specifically on signing/delegation
   verification. Fix findings.
5. **Week 5**: Build the case study (write-up + video) leading with the
   deterministic layers (signing, RBAC, delegation attenuation), Groq as the
   secondary example.
6. **Week 6**: Publish SDK to PyPI, LangGraph/CrewAI guides, start reaching out
   to 1-3 design partners — and given the feature set, at least one of those
   conversations can now credibly be with a fintech/bank-adjacent team, not just
   indie multi-agent builders.
