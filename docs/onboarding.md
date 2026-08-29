# Enterprise Onboarding & Architecture Guide — A2A Firewall

Welcome to **A2A Firewall**, the zero-trust inter-agent security and governance mesh. This guide walks security engineering, platform, and AI development teams through onboarding enterprise agent fleets into the A2A mesh.

---

## 🏛️ System Topology

A2A Firewall operates as a centralized governance control plane and distributed edge enforcement mesh:

```
                                ╔══════════════════════════════════════════╗
                                ║    A2A SECURITY CONTROL PLANE (Next.js)  ║
                                ║  • Multi-Tenant RBAC & SCIM 2.0 Identity ║
                                ║  • Live SOC Alert & Review Queue         ║
                                ║  • Compliance Posture (RBI/DPDP/HIPAA)   ║
                                ║  • Central Token Spend & Ledger Records  ║
                                ╚══════════════════════════════════════════╝
                                                     ▲
                                                     │ Telemetry / Approvals
                                                     ▼
    ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
    │                            A2A DISTRIBUTED INTERCEPTION TIERS                               │
    │                                                                                             │
    │  [Tier A: Container Sidecars]       [Tier B: Kernel eBPF Filters]     [MCP Tool Gateways]   │
    │  • docker-compose / k8s pods        • Linux cgroup/connect4 filter     • stdio / SSE bridge │
    │  • Zero agent code changes          • Impossible to bypass socket drop • Claude / Cursor    │
    └─────────────────────────────────────────────────────────────────────────────────────────────┘
                                                     ▲
                                                     │ Intercept
                                                     ▼
                                      ┌─────────────────────────────┐
                                      │    AUTONOMOUS AI AGENTS     │
                                      │ LangGraph • CrewAI • AutoGen│
                                      └─────────────────────────────┘
```

---

## 🚀 5-Step Enterprise Onboarding

### Step 1: Identity & SCIM 2.0 Integration
Connect your enterprise Identity Provider (**Okta**, **Microsoft Entra ID / Azure AD**, or **OneLogin**) to automatically sync users, SOC analysts, and security admins:

1. Navigate to **Dashboard &rarr; SCIM Integration** (`/dashboard/scim`).
2. Generate an encrypted SCIM OAuth Bearer Token.
3. Configure the SCIM Base URL (`https://your-firewall-domain.com/scim/v2`) and Bearer Token in your IdP application settings.
4. Verify user synchronization under **Dashboard &rarr; Team & RBAC** (`/dashboard/rbac`).

---

### Step 2: Register Agents & Provision Ed25519 Keys
Every autonomous agent requires a cryptographic identity within its workspace:

1. Under **Dashboard &rarr; Agents**, click **Register New Agent**.
2. Generate an Ed25519 keypair:
   ```python
   from a2a_firewall import A2AFirewall
   keypair = A2AFirewall.generate_keypair()
   print("Public Key:", keypair["public_key"])
   print("Private Key:", keypair["private_key"])
   ```
3. Store the `private_key` securely in your secret manager (HashiCorp Vault, AWS Secrets Manager, or Kubernetes Secrets).
4. Register the `public_key` with A2A Firewall to enable non-repudiable multi-hop message signing.

---

### Step 3: Configure Role-Based Access Control (RBAC) & Capabilities
Assign minimum required capabilities to agent personas:

| Agent Persona | Recommended Role | Permitted Capabilities |
| :--- | :--- | :--- |
| **Supervisor / Planner** | `agent_coordinator` | `task:dispatch`, `delegation:mint`, `tool:read` |
| **Research Worker** | `worker_read_only` | `tool:search`, `db:select` |
| **Execution Worker** | `worker_restricted` | `tool:write_sandbox`, `api:post_internal` |
| **SOC Security Analyst** | `soc_analyst` | `review:approve`, `review:reject`, `quarantine:view` |

---

### Step 4: Set Monthly Spend Limits & Token Quotas
Prevent runaway agent loops and unexpected LLM billing spikes:

1. Navigate to **Dashboard &rarr; Spend Limits** (`/dashboard/spend`).
2. Set workspace-wide and per-agent monthly dollar budgets (e.g. `$500.00 / month`).
3. Select enforcement action:
   - **`block`**: Instantly returns `403 SPEND_LIMIT_EXCEEDED` on quota breach.
   - **`warn`**: Generates high-priority SOC alert while keeping service online.

---

### Step 5: Recommended 3-Phase Rollout Strategy

To onboard production fleets without breaking existing agent workflows, follow this gradual enablement strategy:

```
  PHASE 1: MONITOR & LEARN (Week 1)
  • Deploy A2A in "Fail-Open" mode with audit logging.
  • Gather baseline traffic, token consumption, and edge-case patterns.
  • Fine-tune regex rules and false-positive thresholds.
       │
       ▼
  PHASE 2: HUMAN-IN-THE-LOOP REVIEW (Week 2)
  • Enable "Review Mode" for medium-risk traffic (0.5 <= Risk <= 0.8).
  • Flagged requests route to SOC Review Queue for 1-click analyst approval.
  • Train analysts on honeypot canary alerts and delegation lineage graphs.
       │
       ▼
  PHASE 3: FULL ZERO-TRUST ENFORCEMENT (Week 3+)
  • Enable "Fail-Closed" mode.
  • Deterministic gates block prompt injections and SQLi in < 1ms.
  • Macaroon caveat attenuation prevents privilege amplification across all hops.
```

---

## 🔍 Continuous Auditing & Regulatory Evidence Bundles

When preparing for SOC 2 Type II, ISO 27001, RBI, DPDP, HIPAA, or PCI-DSS audits:

1. Navigate to **Dashboard &rarr; Compliance Posture** (`/dashboard/compliance`).
2. Review the live readiness score across all 6 compliance frameworks.
3. Click **Export Audit Evidence Bundle** to download pre-compiled JSON/CSV reports containing:
   - Cryptographic Ed25519 hash chains
   - Policy change histories with admin user attribution
   - PII redaction verification records
   - Data retention purge proof certificates

---

## 🆘 Support & Resources

- **GitHub Repository**: [github.com/mananjp/a2a-firewall](https://github.com/mananjp/a2a-firewall)
- **Deployment Guide**: [docs/deployment-guide.md](file:///d:/git/a2a_firewall/a2a-firewall/docs/deployment-guide.md)
- **Framework Integrations**: [LangGraph](file:///d:/git/a2a_firewall/a2a-firewall/docs/integrations/langgraph.md) · [CrewAI](file:///d:/git/a2a_firewall/a2a-firewall/docs/integrations/crewai.md) · [AutoGen](file:///d:/git/a2a_firewall/a2a-firewall/docs/integrations/autogen.md) · [MCP](file:///d:/git/a2a_firewall/a2a-firewall/docs/integrations/mcp.md)
