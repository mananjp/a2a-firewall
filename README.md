# 🛡️ A2A Firewall — Agent Runtime Security Fabric & Zero-Trust Governance (v1.3.0)

<p align="center">
  <a href="https://github.com/mananjp/a2a-firewall/releases"><img src="https://img.shields.io/badge/Version-1.3.0--prod--fabric-blue?style=for-the-badge" alt="Version 1.3.0" /></a>
  <a href="https://pypi.org/project/a2a-firewall-sdk/"><img src="https://img.shields.io/pypi/v/a2a-firewall-sdk?style=for-the-badge&logo=pypi&logoColor=white&label=PyPI" alt="PyPI SDK" /></a>
  <a href="https://www.npmjs.com/package/a2a-firewall-sdk"><img src="https://img.shields.io/npm/v/a2a-firewall-sdk?style=for-the-badge&logo=npm&logoColor=white&label=npm" alt="npm SDK" /></a>
  <img src="https://img.shields.io/badge/Python-3.12-blue?style=for-the-badge&logo=python" alt="Python 3.12" />
  <img src="https://img.shields.io/badge/FastAPI-0.109-emerald?style=for-the-badge&logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/SCIM-2.0%20(RFC%207644)-purple?style=for-the-badge" alt="SCIM 2.0" />
  <img src="https://img.shields.io/badge/Compliance-RBI%20|%20DPDP%20|%20HIPAA%20|%20PCI--DSS-green?style=for-the-badge" alt="Compliance" />
  <a href="https://github.com/mananjp/a2a-firewall/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/mananjp/a2a-firewall/test.yml?branch=main&style=for-the-badge&label=CI" alt="CI" /></a>
  <img src="https://img.shields.io/badge/OpenTelemetry-Enabled-orange?style=for-the-badge&logo=opentelemetry" alt="OpenTelemetry" />
</p>

---

## 🌐 Executive Summary

**A2A Firewall** is an open-source **Agent Runtime Security Fabric & Zero-Trust Governance Mesh** designed to inspect, authorize, throttle, sandbox, and cryptographically audit autonomous AI agent fleets and multi-agent systems.

> **Gateways and edge proxies control who can reach a model.**
> **A2A Firewall controls what agents are allowed to do once they are running:**
> **which agent may delegate what to whom, which data may leave, and which tool results may be trusted.**

Whether your agents are orchestrated via **LangGraph**, **CrewAI**, **Microsoft AutoGen**, or **Model Context Protocol (MCP)**, A2A Firewall provides deep runtime guardrails deployable inside your private VPC, Kubernetes cluster, or edge boundary:
- 🔏 **Ed25519 Cryptographic Identity & Macaroon Attenuated Delegation**
- 📜 **Decision Evidence Envelopes & Deterministic Policy Replay**
- 🧠 **Agent Memory & RAG Write-Time Firewall (Anti-Poisoning & Rollback)**
- 🔄 **Stateful Multi-Agent Workflow Security (Graph Anomaly & Cascade Quarantine)**
- 🛡️ **Lineage-Aware DLP & Reversible Tokenization Vault**
- 🔍 **Bidirectional Response & Tool-Result Inspection**
- 🔌 **Unified Model Gateway Provider Adapters** (OpenAI, Anthropic, Bedrock, Vertex AI, Groq, Ollama)
- 💰 **Spend Limits, SCIM 2.0 Provisioning, and Multi-Regulatory Compliance Frameworks**

---

## 📄 License

**Core (backend / proxy / gateway / dashboard):** Apache-2.0 — see [LICENSE](LICENSE).
**Python SDK** (`sdk/`): MIT.
**TypeScript SDK** (`sdk-ts/`): MIT.
**n8n community node** (`integrations/n8n/`): MIT.

A commercial license is available for OEM, managed-SaaS, and enterprise support use cases — contact the author.

---

## Version Compatibility

| Server | Python SDK | TypeScript SDK | n8n node |
| :----- | :--------- | :------------- | :------- |
| 1.3.x  | 0.4.x      | 0.4.x          | 0.1.x    |

---

## Feature Maturity

| Capability | Status | Notes |
| :-- | :-- | :-- |
| Inspection pipeline (Layers 0–3), Ed25519 identity, Macaroon delegation | **GA** | Covered by CI test suite |
| Semantic layer (Layer 4) | **Beta** | Requires an LLM endpoint (Groq by default) |
| Decision evidence envelopes & offline verifier | **GA** | Signing keys are local by default; KMS planned |
| Memory / RAG firewall | **Beta** | |
| Stateful workflow security | **Beta** | |
| DLP & token vault | **Beta** | AES-256-GCM vault with HMAC-SHA256 lookup index |
| Transparent TLS proxy (Tier 1) | **Beta** | See proxy threat model |
| MCP gateway (Tier 2) | **Beta** | |
| eBPF egress guard (Tier 3) | **Experimental** | Linux-only, kernel-version dependent |
| Provider adapters: OpenAI, Anthropic, Groq, Ollama | **Beta** | |
| Provider adapters: Bedrock, Vertex AI | **Experimental** | Until covered by integration tests |
| SCIM 2.0 | **GA** | |
| n8n community node | **Beta** | |

---

## 🏛️ System Architecture: Agent Runtime Security Fabric

```
                             AUTONOMOUS AGENT ORCHESTRATION & LLM TRAFFIC
                                                  │
        ┌─────────────────────────────────────────┼─────────────────────────────────────────┐
        ▼                                         ▼                                         ▼
  [Tier 1: Transparent TLS Proxy]       [Tier 2: MCP Tool Gateway]             [Tier 3: Egress & eBPF Guard]
  • Inbound & Outbound MITM (Port 8080) • stdio, HTTP, SSE protocol parser     • Linux cgroup/connect4 filter
  • Upstream LLM Response Inspector     • Path Traversal Defense (../)         • Drop non-proxy raw sockets
  • Provider Schema Normalizer          • Dangerous Command Block (rm -rf)     • PID → Agent Identity mapping
  • Reversible DLP Tokenization         • Tool Return-Result Sanitizer         • Anti-bypass evasion detection
        │                                         │                                         │
        └─────────────────────────────────────────┼─────────────────────────────────────────┘
                                                  ▼
                        ╔═════════════════════════════════════════════════╗
                        ║   A2A MULTI-STAGE RUNTIME ENFORCEMENT ENGINE    ║
                        ║─────────────────────────────────────────────────║
                        ║ • Layer 0: Preflight Bounds & Honeytoken Traps  ║
                        ║ • Layer 1: JSON Schema & Typed Tool Contracts   ║
                        ║ • Layer 2: Ed25519 Identity & Attenuated Scope  ║
                        ║ • Layer 3: Rule Engine, SQLi & Span PII Engine  ║
                        ║ • Layer 4: Semantic Intent Drift (Groq Llama-3) ║
                        ║ • Layer 5: Policy Synthesis & Cryptographic Log ║
                        ╚═════════════════════════════════════════════════╝
                                                  │
          ┌───────────────────────────────────────┼───────────────────────────────────────┐
          ▼                                       ▼                                       ▼
 🧠 Memory / RAG Firewall               🔄 Stateful Workflow Engine             📜 Evidence Envelopes
 • Write-time injection scan            • Graph execution tracking              • Ed25519 signed decision bundle
 • Trust tiers (Verified/External)      • Circular delegation detector          • Tamper-evident SHA-256 chain
 • Content-addressable provenance       • Fan-out explosion control             • Offline CLI verifier
 • Snapshot versioning & rollback       • Root quarantine & token revoke        • Deterministic audit replay
                                                  │
                        ┌─────────────────────────┼─────────────────────────┐
                        ▼                         ▼                         ▼
                    [ ALLOW ]                 [ BLOCK ]                 [ REVIEW ]
              Forwarded to Target       Dropped & Quarantined       SOC Analyst Queue
```

---

## ⚡ What's New in v1.3.0

### 1. 📜 Decision Evidence Envelopes (`/v1/evidence`)
Every security decision produces an immutable, cryptographically signed (Ed25519) **Decision Evidence Envelope**:
- **Signed Audit Proof**: Captures policy version, detector fingerprints, SHA-256 input hashes, redacted evidence spans, evaluator identity, risk scores, and authorization chains.
- **Offline Verifier**: Downstream systems, SIEMs, or auditors can verify envelope integrity offline with `GET /v1/evidence/{id}/verify` or via the CLI without trusting the central dashboard.
- **Deterministic Policy Replay**: Rerun historical requests against frozen policy/detector versions (`POST /v1/evidence/{id}/replay`). Deterministic replay against pinned policy and detector versions. LLM-based layers are recorded but not re-executed unless the model output is stored in the envelope.

### 2. 🧠 Agent Memory & RAG Firewall (`/v1/memory`)
Autonomous agents rely on episodic memory and vector stores that can be weaponized through persistent indirect prompt injections:
- **Write-Time Sanitization**: Scans content before it is committed to vector databases or memory stores (`detection/memory_scanner.py`).
- **Trust-Tiered Collections**: Isolates memories into `verified`, `external`, and `quarantined` tiers.
- **Poisoning Defense**: Analyzes instruction density, source concentration anomalies, and embedding outlier shifts.
- **Snapshot & Instant Rollback**: Creates versioned memory state snapshots (`POST /v1/memory/rollback`) with signed deletion receipts.

### 3. 🔄 Stateful Multi-Agent Workflow Security (`/v1/workflows`)
Single-prompt firewalls fail when attacks occur across distributed agent steps. A2A Firewall evaluates the **entire execution graph**:
- **Graph Anomaly Detection**: Identifies circular delegation loops ($A \rightarrow B \rightarrow A$), excessive child agent fan-out explosions, and anomalous tool sequences.
- **Cumulative Risk Tracking**: Aggregates risk scores and sensitive data exposures across all hops in a task graph rather than resetting per step.
- **Cascade Quarantine & Revocation**: Quarantines the entire root workflow (`POST /v1/workflows/{id}/quarantine`) and revokes child capability tokens instantly when an ancestor is compromised.

### 4. 🛡️ Lineage-Aware DLP & Reversible Tokenization (`/v1/dlp`)
Enterprise Data Loss Prevention built specifically for LLM inputs and outputs:
- **Span-Accurate Detection**: Accurately labels byte/character offsets for credit cards (Luhn-checked), Aadhaar, PAN, SSN, IBAN, MRN, ICD-10, phone, and emails without false-positive collisions.
- **Reversible Tokenization**: Replaces sensitive data with cryptographically secure tokens (AES-256-GCM encrypted vault with HMAC-SHA256 deterministic lookup index) before transmission to external LLM providers, with secure detokenization upon return.
- **Derived Data Lineage**: Derived summaries and agent outputs inherit parent classification tags, enforcing purpose limitation.

### 5. 🔍 Bidirectional Response & Tool-Result Inspection
Inspects data flowing **back to the agent** from upstream models and tool executions:
- Intercepts and sanitizes indirect prompt injections hidden in scraped web content, database query returns, and third-party API results before the agent processes them.
- Integrated natively into both the Transparent TLS MITM Proxy (`proxy/server.py`) and the MCP HTTP Gateway (`mcp/http_gateway.py`).

### 6. 🔌 Unified AI Gateway Provider Adapters
Standardized interface for heterogeneous LLM providers:
- Built-in adapters for **OpenAI, Anthropic, AWS Bedrock, Google Vertex AI, Groq, and local Ollama**.
- Circuit breaking, timeout budgets, retries, and token cost accounting across providers.

---

## 🚀 Quickstart

### 1. Run Complete Local Stack via Docker Compose
```bash
git clone https://github.com/mananjp/a2a-firewall.git
cd a2a-firewall
docker compose up --build -d
```
- **Web Dashboard**: [http://localhost:3000](http://localhost:3000) (Next.js 16)
- **API Server & Interactive Docs**: [http://localhost:8000/docs](http://localhost:8000/docs) (FastAPI)
- **Jaeger Distributed Tracing**: [http://localhost:16686](http://localhost:16686)

---

### 2. Zero-Touch Container Sidecar Deployment
Deploy as a transparent sidecar with **zero changes to agent code**:

```yaml
services:
  a2a-proxy:
    image: ghcr.io/mananjp/a2a-proxy:latest
    ports: ["8080:8080"]
    volumes: [ca-certs:/data/ca]

  agent-service:
    image: my-agent:latest
    environment:
      HTTPS_PROXY: "http://a2a-proxy:8080"
      SSL_CERT_FILE: "/certs/ca.crt"
      REQUESTS_CA_BUNDLE: "/certs/ca.crt"
      NODE_EXTRA_CA_CERTS: "/certs/ca.crt"
    volumes: [ca-certs:/certs:ro]

volumes:
  ca-certs:
```
*See complete examples in [`examples/docker-sidecar/`](examples/docker-sidecar/) and [`examples/kubernetes/`](examples/kubernetes/).*

---

## 📦 SDK Installation & Usage

### Python SDK ([PyPI: `a2a-firewall-sdk`](https://pypi.org/project/a2a-firewall-sdk/))

```bash
pip install "a2a-firewall-sdk[all]"
```

```python
from a2a_firewall import A2AFirewall, FirewallConfig, FirewallBlockedError

firewall = A2AFirewall(FirewallConfig(
    firewall_url="http://localhost:8000",
    agent_api_key="agt_prod_key",
    agent_id="planner-agent-uuid",
    agent_private_key="ed25519-private-key-hex",  # enables cryptographic message signing
    fail_mode="closed",
))

try:
    response = firewall.send(
        receiver_agent_id="researcher-agent-uuid",
        task_type="research",
        payload={"query": "Summarize quarterly financials for project Alpha."}
    )
    print(f"Decision: {response.decision} (Risk Score: {response.risk_score})")
    print(f"Evidence ID: {response.evidence_id}")
except FirewallBlockedError as e:
    print(f"Security Blocked: {e.reason} | Violations: {e.violations}")
```

---

### TypeScript / Node.js SDK ([npm: `a2a-firewall-sdk`](https://www.npmjs.com/package/a2a-firewall-sdk))

```bash
npm install a2a-firewall-sdk
```

```typescript
import { A2AFirewall } from 'a2a-firewall-sdk';

const firewall = new A2AFirewall({
  firewallUrl: 'http://localhost:8000',
  agentApiKey: 'agt_prod_key',
  agentId: 'planner-agent-uuid',
  agentPrivateKey: 'ed25519-private-key-hex',
  failMode: 'closed',
});

const response = await firewall.send({
  receiverAgentId: 'researcher-agent-uuid',
  taskType: 'research',
  payload: { query: 'Analyze system telemetry.' },
});

console.log(`Decision: ${response.decision} (Risk: ${response.riskScore})`);
```

---

## 🧩 Framework Integrations

| Framework | Documentation | Defense Architecture |
| :--- | :--- | :--- |
| **LangGraph** | [LangGraph Integration Guide](docs/integrations/langgraph.md) | Node-to-node Ed25519 signing, StateGraph capability attenuation, proxy sidecar |
| **CrewAI** | [CrewAI Integration Guide](docs/integrations/crewai.md) | Hierarchical crew delegation guard, custom tool boundary protection |
| **AutoGen (AG2)** | [AutoGen Integration Guide](docs/integrations/autogen.md) | `ConversableAgent` message filter hooks, code execution sandbox |
| **Claude & Cursor MCP** | [MCP Governance Guide](docs/integrations/mcp.md) | `a2a_firewall.mcp wrap` stdio/SSE tool call & return result inspector |

---

## 🏢 Enterprise Governance Capabilities

### 1. 💰 Spend Limits & Cost Governance (`/dashboard/spend`)
- **Per-Agent & Workspace Monthly Budgets**: Set hard financial quotas (USD) and token thresholds.
- **Enforcement Modes**: Configurable `block` (`403 SPEND_LIMIT_EXCEEDED`) or `warn` (SOC alert).
- **Inference Cost Ledger**: Real-time token consumption tracking across models with CSV export.

### 2. 👥 Role-Based Access Control (RBAC) (`/dashboard/rbac`)
- **6 Standard Roles**: `admin`, `security_admin`, `soc_analyst`, `auditor`, `developer`, `viewer`.
- **Granular Capabilities**: `spend:manage`, `policies:write`, `audit:export`, `network:manage`, `scim:manage`, `evidence:verify`, `memory:manage`, `dlp:manage`, `dlp:detokenize`.

### 3. 🆔 SCIM 2.0 Automated Identity Provisioning (`/dashboard/scim`)
- **RFC 7643 & 7644 Compliant**: Push sync from **Okta**, **Microsoft Entra ID (Azure AD)**, and **OneLogin**.
- **OAuth Bearer Token Security**: Salted SHA-256 token hashing at rest with token rotation.

### 4. 📊 Continuous Compliance & Observability (`/dashboard/compliance`)
- **Real-Time Posture Scoring (0–100%)**: Instant compliance metrics across major regulatory frameworks:
  - **RBI** (Reserve Bank of India cyber security directions, PAN/Card masking)
  - **DPDP** (Digital Personal Data Protection Act, Aadhaar/PII privacy)
  - **HIPAA** (Health Insurance Portability and Accountability Act)
  - **PCI-DSS** (Payment Card Industry Data Security Standard)
  - **GDPR** & **CCPA** (Global & California Consumer Privacy)
- **One-Click Evidence Bundle**: Pre-compiled regulatory evidence packages with signed envelopes.

### 5. 🗄️ Retention Engine & Automated PII Sanitization (`/dashboard/retention`)
- **Granular Lifecycles**: Configurable TTL for payloads, telemetry, and security alerts.
- **Compliance Floor Protection**: Audit logs locked to a mandatory minimum retention (e.g. 365 days).
- **Automated PII Scrubbing**: Aadhaar, PAN, SSN, credit cards, and emails sanitized on aging records.

---

## 🔌 API Reference (29+ Endpoints)

| Subsystem | Prefix | Description |
| :--- | :--- | :--- |
| **Firewall** | `POST /v1/firewall/inspect` | 6-stage (Layer 0–5) primary inter-agent inspection pipeline |
| **Response** | `POST /v1/firewall/inspect-response` | Upstream LLM response & tool result inspection |
| **Evidence** | `GET /v1/evidence/{id}` | Retrieve signed decision evidence envelope |
| | `GET /v1/evidence/{id}/verify` | Offline Ed25519 signature & integrity verification |
| | `POST /v1/evidence/{id}/replay` | Deterministic replay against historical policy version |
| **Memory** | `POST /v1/memory/write` | Write-time scanned memory ingestion with trust tiering |
| | `POST /v1/memory/query` | Capability-filtered memory retrieval |
| | `POST /v1/memory/rollback` | Rollback poisoned memory state to snapshot |
| | `DELETE /v1/memory/{id}` | Cryptographic deletion receipt generation |
| **Workflows** | `GET /v1/workflows/{root_task_id}` | Graph execution state, depth, and cumulative risk |
| | `POST /v1/workflows/{root_task_id}/quarantine` | Quarantine workflow graph & cascade-revoke tokens |
| **DLP** | `POST /v1/dlp/inspect` | Classify and transform text under tenant DLP policies |
| | `POST /v1/dlp/tokenize` | Reversibly tokenize sensitive entities |
| | `POST /v1/dlp/detokenize` | Safely detokenize authorized data (audited) |
| **Identity** | `POST /v1/identity/register` | Register agent Ed25519 card and capability scope |
| **Delegation**| `POST /v1/delegation/mint` | Issue attenuated macaroon caveat token |
| **Auth** | `POST /v1/auth/login` | Argon2id authenticated dashboard and API sessions |
| **SCIM 2.0** | `/scim/v2/Users`, `/Groups` | RFC 7644 user and group synchronization |
| **Spend** | `/v1/spend/budgets`, `/summary` | Monthly USD and token budget enforcement |
| **Audit** | `/v1/audit/logs`, `/export` | Cryptographic audit trail & compliance exports |

---

## 📊 Performance Benchmarks & Quality Assurance

- **Test Suite**: Automated tests passing across unit, integration, and security suites (including tests for Evidence, Memory, Workflows, DLP, Adapters, and Response Inspection). See CI badge above.
- **Static Security & Typing**: Clean `ruff` linting and strict `mypy` type validation.
- **Engine Latency**:
  - Normalizer: `0.006 ms` (p50)
  - MCP Argument Policy Check: `0.682 ms` (p50)
  - Full TLS MITM Termination + Policy Gate: `4.450 ms` (p50)
  - False Positives: 0 false positives on our 211-prompt internal benign corpus (95% upper bound ≈ 1.4%, rule of three). Independent benchmark results welcome — see `CONTRIBUTING.md`.

---

## 📚 Technical Documentation

- **[Production Roadmap](docs/strategy/production_roadmap.md)**: Implementation status, hardening roadmap, and deployment milestones.
- **[Case Study Guide](docs/case_study_guide.md)**: Step-by-step reproduction of multi-hop confused deputy attacks.
- **[Enterprise Onboarding Guide](docs/onboarding.md)**: 5-step rollout from Monitor → Review → Enforce.
- **[Architecture Decision Records (ADRs)](docs/)**: ADR-0001 (Non-Amplification), ADR-0002 (Intent Binding), ADR-0003 (Transparent Proxy).
