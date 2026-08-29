# 🛡️ A2A Firewall — Inter-Agent Governance Mesh & Zero-Trust Security (v1.1.1)

<p align="center">
  <a href="https://github.com/mananjp/a2a-firewall/releases"><img src="https://img.shields.io/badge/Version-1.1.1--prod--core-blue?style=for-the-badge" alt="Version 1.1.1" /></a>
  <a href="https://pypi.org/project/a2a-firewall-sdk/"><img src="https://img.shields.io/pypi/v/a2a-firewall-sdk?style=for-the-badge&logo=pypi&logoColor=white&label=PyPI" alt="PyPI SDK" /></a>
  <a href="https://www.npmjs.com/package/a2a-firewall-sdk"><img src="https://img.shields.io/npm/v/a2a-firewall-sdk?style=for-the-badge&logo=npm&logoColor=white&label=npm" alt="npm SDK" /></a>
  <img src="https://img.shields.io/badge/Python-3.12-blue?style=for-the-badge&logo=python" alt="Python 3.12" />
  <img src="https://img.shields.io/badge/FastAPI-0.109-emerald?style=for-the-badge&logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/SCIM-2.0%20(RFC%207644)-purple?style=for-the-badge" alt="SCIM 2.0" />
  <img src="https://img.shields.io/badge/Compliance-RBI%20|%20DPDP%20|%20HIPAA%20|%20PCI--DSS-green?style=for-the-badge" alt="Compliance" />
  <img src="https://img.shields.io/badge/OpenTelemetry-Enabled-orange?style=for-the-badge&logo=opentelemetry" alt="OpenTelemetry" />
</p>

---

## 🌐 Executive Summary

**A2A Firewall** is an enterprise-grade **Zero-Trust Inter-Agent Governance Mesh & Security Gateway** designed to inspect, validate, throttle, control spend, and cryptographically audit communications across autonomous AI agent fleets.

Whether your agents are orchestrated via **LangGraph**, **CrewAI**, **Microsoft AutoGen**, or **Model Context Protocol (MCP)**, A2A Firewall prevents **prompt injections, confused-deputy privilege escalations, PII exfiltrations, SQL mutations, and runaway token loops** without requiring structural changes to your agent codebase.

---

## 🏛️ 3-Layer Interception & Platform Architecture

A2A Firewall provides defense-in-depth across three deployment tiers:

```
                                      INTER-AGENT & LLM TRAFFIC
                                                  │
        ┌─────────────────────────────────────────┼─────────────────────────────────────────┐
        │                                         │                                         │
  [Tier 1: Transparent TLS Proxy]       [Tier 2: MCP Tool Gateway]             [Tier 3: Egress & eBPF Guard]
  • a2a-proxy sidecar (Port 8080)       • stdio & HTTP/SSE parser              • Linux cgroup/connect4 filter
  • Dynamic 2048-bit RSA Root CA        • Path Traversal Defense (../)         • Drop non-proxy raw sockets
  • Zero-touch HTTPS CONNECT MITM       • Dangerous Command Block (rm -rf)     • Cross-platform process watcher
  • OpenAI / Anthropic / REST norm      • SQL Injection in Tool Args           • Anti-bypass evasion detection
        │                                         │                                         │
        └─────────────────────────────────────────┼─────────────────────────────────────────┘
                                                  ▼
                        ╔═════════════════════════════════════════════════╗
                        ║      A2A 5-LAYER CORE DETECTION PIPELINE        ║
                        ║─────────────────────────────────────────────────║
                        ║ Layer 0: Preflight Bounds & Canary Honeypots    ║
                        ║ Layer 1: JSON Schema & Tool Signature Validation║
                        ║ Layer 2: RBAC & Macaroon Caveat Attenuation     ║
                        ║ Layer 3: Rule Engine, SQLi & PII Sanitizer      ║
                        ║ Layer 4: Semantic Intent Drift (Groq 70B/120B)  ║
                        ║ Layer 5: Policy Synthesis & Lineage Audit Ledger║
                        ╚═════════════════════════════════════════════════╝
                                                  │
                       ┌──────────────────────────┼──────────────────────────┐
                       ▼                          ▼                          ▼
                   [ ALLOW ]                  [ BLOCK ]                  [ REVIEW ]
             Forwarded to Target        Dropped & Quarantined        SOC Analyst Queue
```

---

## 🚀 Quickstart

### 1. Run Complete Local Stack via Docker Compose
```bash
git clone https://github.com/mananjp/a2a-firewall.git
cd a2a-firewall
docker compose up --build -d
```
- **Web Dashboard**: [http://localhost:3000](http://localhost:3000) (Next.js 16)
- **API Server & Swagger**: [http://localhost:8000/docs](http://localhost:8000/docs) (FastAPI)
- **Jaeger Distributed Tracing**: [http://localhost:16686](http://localhost:16686)

---

### 2. Zero-Touch Container Sidecar (Tier A)
Wrap your agents in Docker or Kubernetes with **zero agent code changes**:

```yaml
# In your docker-compose.yml:
services:
  a2a-proxy:
    image: ghcr.io/mananjp/a2a-proxy:latest
    ports: ["8080:8080"]
    volumes: [ca-certs:/data/ca]

  your-agent:
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
*See complete examples in [`examples/docker-sidecar/`](file:///d:/git/a2a_firewall/a2a-firewall/examples/docker-sidecar/) and [`examples/kubernetes/`](file:///d:/git/a2a_firewall/a2a-firewall/examples/kubernetes/).*

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
        payload={"query": "Summarize market trends."}
    )
    print(f"Message Allowed! Decision: {response.decision}, Risk: {response.risk_score}")
except FirewallBlockedError as e:
    print(f"Security Block: {e.reason}, Violations: {e.violations}")
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
  payload: { query: 'Summarize market trends.' },
});

console.log(`Decision: ${response.decision}, Risk: ${response.riskScore}`);
```

---

## 🧩 Framework Integrations

| Framework | Guide & Examples | Protection Mechanism |
| :--- | :--- | :--- |
| **LangGraph** | [LangGraph Integration Guide](file:///d:/git/a2a_firewall/a2a-firewall/docs/integrations/langgraph.md) | Node-to-node Ed25519 signing, StateGraph capability attenuation, proxy sidecar |
| **CrewAI** | [CrewAI Integration Guide](file:///d:/git/a2a_firewall/a2a-firewall/docs/integrations/crewai.md) | Hierarchical crew delegation guard, custom tool boundary protection |
| **AutoGen (AG2)** | [AutoGen Integration Guide](file:///d:/git/a2a_firewall/a2a-firewall/docs/integrations/autogen.md) | `ConversableAgent` message filter hooks, code execution sandbox |
| **Claude & Cursor MCP** | [MCP Governance Guide](file:///d:/git/a2a_firewall/a2a-firewall/docs/integrations/mcp.md) | `a2a_firewall.mcp wrap` stdio/SSE tool call argument inspector |

---

## 🏢 Enterprise Governance Capabilities

### 1. 💰 Spend Limits & Cost Governance (`/dashboard/spend`)
- **Per-Agent & Workspace Monthly Budgets**: Set financial quotas (USD) and token limits.
- **Enforcement Modes**: Configurable `block` (`403 SPEND_LIMIT_EXCEEDED`) or `warn` (SOC alert).
- **Inference Cost Ledger**: Real-time token consumption tracking across models with CSV export.

### 2. 👥 Role-Based Access Control (RBAC) (`/dashboard/rbac`)
- **6 Standard Roles**: `admin`, `security_admin`, `soc_analyst`, `auditor`, `developer`, `viewer`.
- **Granular Capabilities**: `spend:manage`, `policies:write`, `audit:export`, `network:manage`, `scim:manage`.

### 3. 🆔 SCIM 2.0 Automated Identity Provisioning (`/dashboard/scim`)
- **RFC 7643 & 7644 Compliant**: Real-time push sync from **Okta**, **Microsoft Entra ID (Azure AD)**, and **OneLogin**.
- **OAuth Bearer Token Security**: Salted SHA-256 token hashing at rest with token rotation.

### 4. 📊 Continuous Compliance & Observability (`/dashboard/compliance`)
- **Real-Time Posture Scoring (0–100%)**: Instant compliance metrics across 6 frameworks:
  - **RBI** (Reserve Bank of India cyber security directions, PAN/Card masking)
  - **DPDP** (Digital Personal Data Protection Act, Aadhaar/PII privacy)
  - **HIPAA** (Health Insurance Portability and Accountability Act)
  - **PCI-DSS** (Payment Card Industry Data Security Standard)
  - **GDPR** & **CCPA** (Global & California Consumer Privacy)
- **One-Click Evidence Bundle**: Pre-compiled regulatory packages in JSON/CSV format.

### 5. 🗄️ Retention Engine & Automated PII Sanitization (`/dashboard/retention`)
- **Granular Lifecycles**: Configurable TTL for payloads, telemetry, and security alerts.
- **Compliance Floor Protection**: Audit logs locked to a minimum of 365 days.
- **Automated PII Scrubbing**: Aadhaar, PAN, SSN, Credit Cards, and emails sanitized on aging records.

---

## 📊 Live Performance Benchmarks (N=300 runs)

| Stage | Operation | Latency (p50) | Latency (p99) |
| :--- | :--- | :--- | :--- |
| **Normalizer** | Protocol parsing & feature extraction | `0.006 ms` | `0.014 ms` |
| **MCP Policy Engine** | Tool argument & path boundary evaluation | `0.682 ms` | `0.804 ms` |
| **Full TLS MITM Proxy** | TCP connect + TLS MITM termination + Policy Gate | `4.450 ms` | `70.878 ms` |
| **False Positive Rate** | Tested across 211 benign enterprise prompt fixtures | **0.0% FP** | **0.0% FP** |

---

## 📚 Documentation Index

- **[Enterprise Onboarding Guide](file:///d:/git/a2a_firewall/a2a-firewall/docs/onboarding.md)**: 5-step rollout from Monitor &rarr; Review &rarr; Enforce
- **[Deployment Guide](file:///d:/git/a2a_firewall/a2a-firewall/docs/deployment-guide.md)**: Standalone CLI, Docker Sidecar, Kubernetes Pod Specs
- **[Case Study Report](file:///d:/git/a2a_firewall/a2a-firewall/docs/case_study_report.md)**: Multi-hop attack defense live reproduction
- **[Architecture Decision Records (ADRs)](file:///d:/git/a2a_firewall/a2a-firewall/docs/)**: Non-amplification, intent-binding, transparent proxy

---

## 📄 License

Distributed under the Apache-2.0 License.
