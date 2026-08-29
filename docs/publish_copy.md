# A2A Firewall — Publish Copy (Draft)

> Status: **draft** — for design-partner / pilot outreach.
> Audience: AI engineering leaders building multi-agent systems.
> Tone: confidently honest. Core is production-ready; proxy / eBPF / semantic R&D is explicitly scoped.

---

## Title options

1. **We found a real gap in our own firewall — then closed it. Here are the numbers.**
2. **A2A Firewall v1.0: we caught the multilingual prompt-injection gap we had, and fixed it**
3. **Your firewall is English-only and you didn't notice: how we found and closed our own blind spot**
4. **A2A Firewall is live: multi-agent governance that holds up in Hindi, Arabic, Chinese, Russian — and even unaccented Spanish**

---

## The one-line story

> **Your agents are probably only guarded against English attacks. So were ours —
> until we intentionally stress-tested our own firewall in five languages, found
> it silently missing 26 of 31 adversarial payloads, and shipped a fix. Same
> pitch, now with proof instead of a promise.**

---

## Post body (draft)

**A2A Firewall v1.0 is live**, and the honest, repeatable story is a bug we found and closed.

If you run more than two agents that talk to each other, you have already hit the problem
this solves: one agent calls another, trusting it with a task — and trusting the payload it
carries. That is a confused-deputy attack surface. No model-level guardrail fixes it,
because the attack is not in one model: it spans the delegation chain.

A2A Firewall is an inter-agent security mesh that sits between agents and inspects every
message before it is acted on:

- **Cryptographic tamper-evidence** — every hop is Ed25519-signed and hash-chained for a
  non-repudiable audit trail.
- **Capability attenuation (Macaroon-style)** — delegations carry scoped capabilities; a
  compromised agent inherits exactly zero authority beyond its own grants.
- **Multi-layer detection** — deterministic rule engine + injection/IPS signatures + PII
  scanner, with an LLM semantic layer in the pipeline.
- **RBAC, compliance packs, spend/rate limits, retention and SOC workflows** for real
  enterprise governance, not a lab demo.

### The gap we found — with the numbers

The [case-study report](https://github.com/mananjp/a2a-firewall/blob/main/docs/case_study_report.md)
is honest about its own scope: the headline benchmark corpus is **English-only**. That is the
easy, comfortable claim. So we did the uncomfortable thing — we attacked our own firewall
in **Hindi, Spanish, Arabic, Chinese and Russian** (41 labeled fixtures, run against the
live Layer 3 rules and the real Groq semantic layer), and published the raw results:

| Path | Non-English attacks blocked | False positives on benign |
| :-- | :-- | :-- |
| Deterministic Layer 3 rules (English-only regexes) | **5 / 31** (16%) | 0 |
| Old fast "injection-only" Groq path (pre-fix) | **20 / 31** (65%) | 0 |
| **Shipped fix** (full semantic prompt for any non-ASCII payload) | **30 / 31** (97%) | 0 |

The gap was real and architectural: the cheap fast-path (used at zero risk to save
latency) trusted an English-optimized keyword gate for payloads the rules could never
parse. The fix — force the full multi-language semantic prompt whenever the payload
carries non-Latin or accented-Latin script — closed **10 of 11 previously-missed attacks in
one change**, lifting end-to-end coverage from 67.7% to **96.8%** with a **0.0% false-positive
rate** on the benign set. Distinct-script languages (Hindi/Devanagari, Arabic, Chinese,
Russian) are now caught **100%**.

We are not declaring victory on the final 3.2%: the single residual miss is a
**pure-ASCII, unaccented Spanish** payload that is character-for-character
indistinguishable from English — no character-based heuristic can catch it, and we say so
in the report rather than bury it.

### What this means for your mesh

- **The live case study still holds** — clean 3-agent pipeline passes at risk **0.0**; prompt
  injection and SQL-injection credential-exfiltration are both blocked; deterministic
  in-process latency p50 **~0.63 ms**, p95 **~1.3 ms**, p99 **~2.3 ms**; **0.0% false-positive**
  across a 211-fixture benign corpus.
- **The multilingual result is now part of the same story**, because it answers the exact
  question the case study left open — *"does it work when the attacker doesn't write in
  English?"* — with a measured answer, not a promise.
- CI is fully green on `main`, including Docker + Postgres integration tests, the new
  multilingual gate tests, and the rerunnable gap harness.

### For India / APAC BFSI teams specifically

This is not a roadmap item for us — it is why we shipped the multilingual fix at all.
Two things line up that no English-first guardrail vendor can claim:

- **The multilingual gap was measured and closed in the same week.** Indian BFSI
  traffic is not an English-only edge case; Hindi, and regional-language agent prompts
  are the *normal* case. Our own case-study benchmark was English-only, so we
  intentionally attacked it in Hindi, Arabic, Chinese, Russian and Spanish, found the
  deterministic rules and the cheap fast-path were silently missing non-English attacks
  (26/31), and shipped the fix that lifts coverage to **96.8% (30/31)** with a **0.0%
  false-positive rate** on the benign set — with the one residual case (pure-ASCII
  unaccented Spanish) stated in the report instead of buried. We are not promising to get
  to multilingual "eventually historically" — we already measured it and found the
  exact failure mode, before it was anyone's customer incident.
- **Indian compliance is wired into the detection core, not bolted on.** The same
  pipeline ships built-in **RBI** and **DPDP (India)** enforcement packs — unmasked PAN,
  Aadhaar exposure, high-value cross-border transfers, and cross-border PII transfer
  flags (`compliance_packs.py`, `pii_patterns.py`) — so multilingual detection and
  Indian data-protection rules live in the same governed gate.

If you run multi-agent compliance, SOC-automation, or agent-calling-agent workloads in
India, and your regional-language traffic is real, we want to measure your languages in
public exactly the way we published ours.

The honest part remains: this repo is the **production core**. The transparent proxy
(Tier A) provides zero-touch container/process interception, while eBPF L7 kernel-level
gating (Tier B) is available for Linux host deployments. We will not pretend the attack
corpus is fully blocked today when it is not — and we will not let the numbers drift from
the measured run.

**We are looking for design partners and pilot deployments.** If you are running (or about
to run) a multi-agent system in production — compliance, SOC automation, and
agent-calling-agent patterns especially — we want your real workloads on our roadmap.
Bring us a language we have not tested yet and we will measure it in public:

- Find us at the repo, or reply here with the shape of your mesh.
- Priority for pilots: API/SDK integration, deployment hardening, and the proxy/eBPF path.

GitHub: https://github.com/mananjp/a2a-firewall
Release: https://github.com/mananjp/a2a-firewall/releases/tag/v1.0.0-core
Live case-study report: https://github.com/mananjp/a2a-firewall/blob/main/docs/case_study_report.md
Gap analysis + harness: https://github.com/mananjp/a2a-firewall/blob/main/backend/tests/multilingual_gap_analysis.py