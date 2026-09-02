# a2a-firewall-sdk (Python)

**Python SDK for the [A2A Firewall](https://github.com/mananjp/a2a-firewall)** — the Zero-Trust Agent Runtime Security Fabric providing cryptographic governance, bidirectional response inspection, memory protection, and lineage-aware DLP for autonomous AI agents.

[![PyPI version](https://img.shields.io/pypi/v/a2a-firewall-sdk)](https://pypi.org/project/a2a-firewall-sdk/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)

---

## What It Does

The A2A Firewall enforces deterministic runtime security across multi-agent systems and LLM workflows:

- **Cryptographic Decision Evidence Envelopes** — Every decision is packaged into an Ed25519-signed bundle with input SHA-256 hashes, detector fingerprints, and offline audit verification (`evidence_id`).
- **Bidirectional Response & Tool Inspection** — Intercept and sanitize upstream LLM completions and tool execution results against indirect prompt injection, PII leakage, and output poisoning.
- **Agent Memory & RAG Firewall** — Guard vector databases and episodic memory with write-time injection scanning, semantic poisoning checks, and query retrieval screening.
- **Lineage-Aware DLP & Reversible Tokenization Vault** — Destination-based PII masking, hashing, blocking, and reversible HMAC-SHA256 tokenization with compliance lineage tags (RBI, DPDP, PCI-DSS, HIPAA, GDPR).
- **Inter-Agent Mesh Governance** — 6-layer detection pipeline, Macaroon-style capability attenuation, and deterministic < 20ms p99 latency.
- **Sidecar & Proxy Auto-Detection** — Automatically routes through `a2a-proxy` sidecars when containerized.

---

## Installation

```bash
pip install a2a-firewall-sdk
```

With Ed25519 signing support:
```bash
pip install "a2a-firewall-sdk[crypto]"
```

With OpenTelemetry tracing:
```bash
pip install "a2a-firewall-sdk[all]"
```

---

## Quick Start

```python
from a2a_firewall import A2AFirewall, FirewallConfig

firewall = A2AFirewall(FirewallConfig(
    firewall_url="https://api.a2afirewall.com",
    agent_api_key="your_agent_api_key",
    agent_id="agent-planner-01",
    workspace_id="ws-primary",
    agent_private_key="ed25519-private-key-hex",  # optional: enables message signing
    fail_mode="closed",  # "closed" = block on error, "open" = allow on error
))

# 1. Send task through firewall
response = firewall.send(
    receiver_agent_id="agent-analyst-02",
    task_type="financial_research",
    payload={"query": "Evaluate Q3 market exposure."},
)

print(f"Decision: {response.decision}")          # "allow" | "block" | "review"
print(f"Risk score: {response.risk_score}")      # 0.0 to 1.0
print(f"Evidence ID: {response.evidence_id}")    # Ed25519 signed decision envelope
```

---

## Agent Runtime Security Fabric (v0.4.x)

### 1. Bidirectional Response & Tool Result Scanning

Inspect untrusted upstream LLM completions or external tool results before passing them back into the agent context:

```python
tool_result = {"output": "System prompt leaked: AWS_SECRET_KEY=AKIA..."}

res = firewall.inspect_response(
    response_body=tool_result,
    context="tool_result",  # "tool_result" or "llm_response"
    redact_pii=True,
)

if res["allowed_to_proceed"]:
    safe_body = res.get("redacted_body", tool_result)
else:
    print(f"Response blocked: {res.get('violations')}")
```

### 2. Memory & RAG Firewall

Screen memory writes before persisting into episodic memory or vector stores to prevent indirect injection and semantic poisoning:

```python
# Inspect candidate memory write
inspection = firewall.inspect_memory(
    chunk="User prefers payment via card 4111-2222-3333-4444",
    redact_pii=True,
)

# Inspect and safely store in one step
store_res = firewall.store_memory(
    chunk="Meeting summary: roadmap alignment complete.",
    metadata={"source_agent": "agent-planner-01"},
    redact_pii=True,
    persist_only_if_clean=True,
)
print(f"Persisted: {store_res['persisted']}, Hash: {store_res['content_hash']}")

# Screen retrieval query before releasing memories to agent
search_res = firewall.search_memory(query="Find roadmap details", top_k=5)
print(f"Matched safe chunks: {search_res['results']}")
```

### 3. Lineage-Aware DLP & Reversible Tokenization

Protect sensitive data flowing to external LLM providers or third-party webhooks:

```python
raw_prompt = "Customer John Doe with PAN ABCDE1234F requested balance check."

# Tokenize PII using reversible HMAC vault
dlp_res = firewall.inspect_dlp(
    text=raw_prompt,
    destination="llm_provider",  # "llm_provider" | "external" | "partner" | "internal"
    tokenize=True,
)

print(f"Action taken: {dlp_res['action']}")                    # "tokenize" | "redact" | "block"
print(f"Transformed: {dlp_res.get('transformed_text')}")      # "Customer John Doe with PAN [TOKEN_PAN_...]..."
print(f"Detected entities: {dlp_res['findings']}")
```

### 4. Cryptographic Decision Evidence Envelopes

Retrieve and independently verify Ed25519-signed decision envelopes for zero-trust audits:

```python
# Fetch signed envelope by decision ID
envelope = firewall.get_evidence(response.evidence_id)

# Cryptographically verify the Ed25519 signature offline
verification = firewall.verify_evidence(response.evidence_id)
assert verification["valid"] is True
```

---

## Delegation & Identity Attenuation

Mint cryptographically attenuated Macaroon delegation tokens that narrow permissions at each delegation hop:

```python
# Create attenuated token
token = firewall.create_delegation_token(
    root_key_hex="workspace-root-key-hex",
    receiver_agent_id="agent-analyst-02",
    task_type="research",    # narrowed scope
    max_risk=0.4,            # lowered risk threshold
)

# Active delegation token will be attached to subsequent sends
response = firewall.send(
    receiver_agent_id="agent-analyst-02",
    task_type="research",
    payload={"query": "Analyze fraud indicators"},
)
```

---

## Transparent Proxy Auto-Detection

When running inside a Kubernetes pod or Docker network alongside the `a2a-proxy` sidecar, the SDK auto-discovers endpoints and certificates:

```python
# Automatically detects HTTPS_PROXY / A2A_PROXY_URL and SSL_CERT_FILE / A2A_CA_CERT
firewall = A2AFirewall(FirewallConfig(
    firewall_url="http://a2a-backend:8000",
    agent_api_key="your_api_key",
))

if firewall.proxy_detected:
    print("Zero-touch interception active via sidecar proxy")
```

---

## API Reference

### `FirewallResponse`

| Field | Type | Description |
|:---|:---|:---|
| `task_id` | `str` | Unique task evaluation identifier |
| `decision` | `str` | Final policy verdict: `"allow"`, `"block"`, or `"review"` |
| `allowed` | `bool` | Whether the message is permitted to proceed |
| `risk_score` | `float` | Cumulative multi-layer risk score ($0.0$ to $1.0$) |
| `evidence_id` | `Optional[str]` | Ed25519-signed decision envelope identifier |
| `violations` | `list[dict]` | Detected policy, schema, or rule violations |
| `latency_ms` | `int` | Inspection pipeline latency in milliseconds |
| `trace_id` | `Optional[str]` | OpenTelemetry trace identifier |

---

## Links

- **GitHub Repository**: [github.com/mananjp/a2a-firewall](https://github.com/mananjp/a2a-firewall)
- **Live SOC Dashboard**: [a2a-firewall.onrender.com](https://a2a-firewall.onrender.com)
- **TypeScript SDK**: [a2a-firewall-sdk on npm](https://www.npmjs.com/package/a2a-firewall-sdk)
- **Documentation**: [docs/](https://github.com/mananjp/a2a-firewall/tree/main/docs)

---

## License

MIT © Manan Patel
