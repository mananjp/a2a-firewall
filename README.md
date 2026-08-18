# 🛡️ A2A Firewall — Inter-Agent Governance Mesh (v2.2.0)

<p align="center">
  <img src="https://img.shields.io/badge/Version-2.2.0-blue?style=for-the-badge" alt="Version 2.2.0" />
  <img src="https://img.shields.io/badge/Python-3.12-blue?style=for-the-badge&logo=python" alt="Python 3.12" />
  <img src="https://img.shields.io/badge/FastAPI-0.109-emerald?style=for-the-badge&logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/OpenTelemetry-Enabled-orange?style=for-the-badge&logo=opentelemetry" alt="OpenTelemetry" />
  <img src="https://img.shields.io/badge/Anti--Agentic%20Pentest-Immune-red?style=for-the-badge" alt="Anti-Pentest Immune" />
</p>

A2A Firewall is a production-grade **Zero-Trust Inter-Agent Governance Mesh** designed to intercept, inspect, validate, and trace communication between autonomous AI agents. It provides multi-layer inspection, cryptographic Ed25519 identity verification, Macaroon caveat attenuation, anti-agentic pentest immunity, SQL injection defense, and full OpenTelemetry distributed lineage tracing across complex multi-agent pipelines.

---

## 🏗️ Architecture & Message Flow

Whenever **Agent A** attempts to send a message to **Agent B**, the request is intercepted by the **A2A Sentinel Ingress Gateway**. The firewall processes the message through a **Six-Layer Threat Inspection Pipeline** and synthesizes an immediate security verdict: **Allow**, **Block**, or route for manual **Review**.

```mermaid
graph TD
    A["🤖 Agent A"] -->|1. Signed Payload (Ed25519)| FW["🛡️ A2A Sentinel Gateway"]
    FW -->|Layer -1| L_M1["⏳ Rate Limiter (Token Bucket)"]
    L_M1 -->|Layer 0| L0["⚡ Preflight, Nonces & Anti-Pentest Canaries"]
    L0 -->|Layer 1| L1["📋 JSON Schema Validation"]
    L1 -->|Layer 2| L2["🔑 Permissions Matrix & Macaroon Attenuation"]
    L2 -->|Layer 3| L3["📜 Rule Engine, SQL Guard & Obfuscation Decoders"]
    L3 -->|Layer 4| L4["🧠 Groq LLM Semantic Guard (Intent Drift)"]
    L4 -->|Layer 5| L5["🎛️ Declarative Policy Synthesis Gate"]
    
    L5 -->|Allow| B["🤖 Agent B (Authorized)"]
    L5 -->|Block| Err["❌ Dropped / Dynamic Quarantine"]
    L5 -->|Review| RQ["👥 SOC Review Queue"]
    
    RQ -->|Admin Approved| B
    RQ -->|Admin Rejected| Err
```

---

## 🛡️ Six-Layer Threat Inspection Pipeline

| Layer | Component | Description |
| :--- | :--- | :--- |
| **Layer -1** | **Rate Limiter** | Sliding-window token buckets restricting queries per minute at both workspace and agent levels. |
| **Layer 0** | **Preflight & Anti-Pentest Canaries** | Detects zero-trust honeytoken traps (`__sec_canary`), automated fuzzing bursts, circular delegation loops, payload size limits, and cryptographic nonce replays (> 300s window). |
| **Layer 1** | **JSON Schema Validation** | Enforces strict type-safety and parameter bounds against registered task schemas matching `task_type`. |
| **Layer 2** | **Permissions Matrix & Scopes** | Validates sender-receiver trust relationships, capability bounds, and delegation depth attenuation. |
| **Layer 3** | **Rule Engine & SQL Guard** | Scans for forbidden prompt injection strings, SQL injection (`UNION SELECT`, tautologies, stacked queries), offshore beneficiary flags, and Base64/Hex obfuscated payloads. |
| **Layer 4** | **Groq Semantic Guard** | Uses Llama-3.1-8B-Instant inference to evaluate semantic intent drift, confused-deputy redirection, and indirect prompt injection attempts. |
| **Layer 5** | **Declarative Policy Synthesis** | Priority-ranked policy evaluation rules with customizable action gates (`BLOCK`, `REVIEW`, `ALLOW`). |

---

## 🔒 Advanced Security Capabilities

### 1. Anti-Agentic Pentest Immunity Subsystem
- **Honeytoken Canary Traps**: Decoy canary markers (`__sec_canary`, `_admin_override`, `__probe_eval__`) automatically quarantine malicious reconnaissance agents.
- **Fuzzing Storm Defense**: Detects high-frequency parameter mutations and prompt fuzzing seeds within short burst windows.
- **Introspection Blocker**: Rejects prompt directives attempting to leak internal firewall rule definitions, system prompts, or tool manifests.
- **Dynamic Quarantine**: Offending agents are immediately isolated with session nonces revoked and latency tarpits applied.

### 2. SQL Injection Defense Engine
- Detects `UNION SELECT` credential dumps, tautologies (`OR '1'='1'`, `OR 1=1`), stacked queries (`; DROP TABLE`), comment obfuscations, and time-based blind SQL delays (`PG_SLEEP`, `BENCHMARK`).

### 3. Confused-Deputy & Delegation-Chain Trust Defense
- **Macaroon Caveat Attenuation**: Sub-agent capabilities must be a strict subset of delegator permissions; privilege amplification is strictly blocked.
- **Intent-Binding & Drift Verification**: Multi-hop payloads are scored against root task intent. Drift exceeding threshold (0.7) is immediately blocked.
- **Ed25519 Cryptographic Identity**: Outgoing agent messages carry cryptographic signatures verified against registered public keys.

---

## 🎮 Interactive Live Demo & Mesh Simulation

### 1. Live Attack Demo (`/dashboard/demo`)
- Visual 8-stage interactive wire graph with real-time animated packet traversal.
- Live cumulative risk gauge meter ($0.0 \to 1.0$) and layer-by-layer latency breakdown.
- Pre-packaged attack scenarios: Clean Baseline, Prompt Injection, Suspicious Export, SQL Injection Attack, and Anti-Pentest Probe.

### 2. Agent Mesh Simulation & Prior Knowledge (`/dashboard/simulation`)
- **Agent Prior Knowledge Inspector**: Inspect each agent's assigned role, trust tier, accessible tools, known memory records, strict prohibitions, and Ed25519 signing key before running simulations.
- **Realistic KYC Fraud Scenario**: Multi-step attack demonstrating Synthetic Identity submission ➔ KYC verification anomaly alert ➔ Injected wire bypass attempt ➔ Firewall interception at Layer 3/4.

### 3. Firewall Policy Visualizer & Auto-Complete (`/dashboard/policies`)
- Visual sequential evaluation flow and policy impact indicators.
- Real-time task type autocomplete with fuzzy matching.
- One-click security presets: Anti-Pentest Guard, SQL Injection Shield, High-Value Wire Boundary ($100k+), Customer PII Review Gate, and Synthetic KYC Bypass Prevention.
- Interactive Policy Simulation Sandbox.

### 4. Real-Time Command Center (`/dashboard`)
- Live streaming interception feed with Pause/Resume toggle, manual refresh, and verdict filters (`ALL`, `BLOCK`, `REVIEW`, `ALLOW`).
- Click-to-filter hero verdict KPI cards and expandable inline diagnostics.

---

## 📊 Observability (OpenTelemetry)

A2A Firewall includes native OpenTelemetry instrumentation for distributed lineage tracing:

### Local Dev Tracing (Jaeger)
* **Dashboard**: [http://localhost:16686](http://localhost:16686)
* **Configuration** (`.env`):
  ```ini
  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
  OTEL_SERVICE_NAME=a2a-firewall
  ```

### Cloud Monitoring (Grafana Cloud / Tempo)
```ini
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-<your-region>.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20<your-base64-credentials>
```

---

## 🚀 Quickstart

### 1. Start the Stack via Docker Compose
```bash
docker compose up --build -d
```

* **Frontend Web Dashboard**: [http://localhost:3000](http://localhost:3000) (Next.js 16)
* **Backend REST API**: [http://localhost:8000](http://localhost:8000) (FastAPI)
* **API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI)
* **Jaeger Tracing**: [http://localhost:16686](http://localhost:16686) (OpenTelemetry)

### 2. Run Backend Tests
```bash
cd backend
.venv/Scripts/pytest -v
```

### 3. Build & Run Frontend
```bash
cd frontend
npm install
npm run build
npm run dev
```

---

## 🔌 Python SDK Usage

```python
from a2a_firewall.client import A2AFirewall, FirewallConfig, FirewallBlockedError

config = FirewallConfig(
    firewall_url="http://localhost:8000",
    workspace_id="your-workspace-uuid",
    agent_id="planner-agent-uuid",
    agent_api_key="agt_planner_key",
    fail_mode="closed"
)
firewall = A2AFirewall(config)

try:
    response = firewall.send(
        receiver_agent_id="researcher-agent-uuid",
        task_type="research",
        payload={"query": "Summarize renewable energy trends."}
    )
    print(f"Message Allowed! Decision: {response.decision}, Risk: {response.risk_score}")
except FirewallBlockedError as e:
    print(f"Blocked! Task: {e.task_id}, Reason: {e.reason}, Violations: {e.violations}")
```

---

## 📄 License
Apache-2.0 License.
