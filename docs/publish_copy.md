# A2A Firewall — Publish Copy (Draft)

> Status: **draft** — for design-partner / pilot outreach.
> Audience: AI engineering leaders building multi-agent systems.
> Tone: confidently honest. Core is production-ready; proxy / eBPF / semantic R&D is explicitly scoped.

---

## Title options

1. **A2A Firewall is live: governance for multi-agent systems that actually blocks prompt injection**
2. **The confused-deputy problem is the firewall problem: A2A Firewall 1.0**
3. **v1.0 released: the inter-agent security layer your agent mesh is missing**

---

## Post body (draft)

**A2A Firewall v1.0 is live.** ([GitHub](https://github.com/mananjp/a2a-firewall) · release
[v1.0.0-core](https://github.com/mananjp/a2a-firewall/releases/tag/v1.0.0-core))

If you run more than two agents that talk to each other, you have already hit the
problem this solves: one agent calls another, trusting it with a task — and trusting the
payload it carries. That is a confused-deputy attack surface. No model-level guardrail
fixes it, because the attack is not in one model: it spans the delegation chain.

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

What we can prove today (all reproduced against the live deployment
`a2a-firewall1.onrender.com`):

- **Live case study**: a clean 3-agent pipeline passes with risk **0.0**; a prompt-injection
  attempt and a SQL-injection credential-exfiltration attempt are both **blocked**.
- **Deterministic latency** (in-process): p50 **~0.63 ms**, p95 **~1.3 ms**, p99 **~2.3 ms**.
- **False-positive rate: 0.0%** across a 211-fixture benign edge-case corpus.
- CI is fully green on `main`, including Docker + Postgres integration tests.

The honest part: this repo is the **sellable core**. The HTTP inline proxy, eBPF L7 and
full semantic-detection path are tracked as **ongoing R&D**, not shipped claims. We will
not pretend the attack corpus is fully blocked today when it is not; the numbers above are
exactly the numbers we measured.

**We are looking for design partners and pilot deployments.** If you are running (or about
to run) a multi-agent system in production — compliance, SOC automation, and
agent-calling-agent patterns especially — we want your real workloads on our roadmap:

- Find us at the repo, or reply here with the shape of your mesh.
- Priority for pilots: API/SDK integration, deployment hardening, and the proxy/eBPF path.

GitHub: https://github.com/mananjp/a2a-firewall
Release: https://github.com/mananjp/a2a-firewall/releases/tag/v1.0.0-core
Live case-study report: https://github.com/mananjp/a2a-firewall/blob/main/docs/case_study_report.md