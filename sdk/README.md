# a2a-firewall-sdk

**Python SDK for the [A2A Firewall](https://github.com/mananjp/a2a-firewall)** — an inter-agent governance mesh that inspects, signs, and attenuates every message between AI agents.

[![PyPI version](https://img.shields.io/pypi/v/a2a-firewall-sdk)](https://pypi.org/project/a2a-firewall-sdk/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)

## What It Does

The A2A Firewall sits between agents in any multi-agent system and enforces security policies on every inter-agent message:

- **6-layer detection pipeline** — schema validation, permission checks, rule engine, CVE risk scoring, LLM semantic analysis, and policy decisions
- **Ed25519 message signing** — every message is cryptographically signed, creating a tamper-evident hash chain
- **Macaroon-style delegation** — capabilities attenuate (narrow) at each delegation hop, never widen
- **< 20ms p99 deterministic latency** — crypto and rule layers run without LLM calls

This SDK handles all of that automatically: signing, chain hashing, delegation token management, and OpenTelemetry tracing.

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

## Quick Start

```python
from a2a_firewall import A2AFirewall, FirewallConfig

# Configure the SDK
firewall = A2AFirewall(FirewallConfig(
    firewall_url="https://a2a-firewall-backend.onrender.com",
    agent_api_key="your_workspace_api_key",
    agent_id="your-agent-uuid",
    workspace_id="your-workspace-uuid",
    agent_private_key="ed25519-private-key-hex",  # optional: enables message signing
    fail_mode="closed",  # "closed" = block on error, "open" = allow on error
))

# Send a message through the firewall
response = firewall.send(
    receiver_agent_id="target-agent-uuid",
    task_type="research",
    payload={"query": "What are the latest fraud trends?"},
)

print(f"Decision: {response.decision}")  # "allow" | "block" | "review"
print(f"Risk score: {response.risk_score}")
print(f"Task ID: {response.task_id}")
```

## Delegation Tokens

Create attenuable delegation tokens when forwarding tasks between agents:

```python
# Agent A delegates to Agent B with narrowed permissions
delegation_token = firewall.create_delegation_token(
    root_key_hex="workspace-root-key-hex",
    receiver_agent_id="agent-b-uuid",
    task_type="research",    # restrict to research tasks only
    max_risk=0.5,            # cap risk threshold
)

# The token carries caveats that can only narrow, never widen
response = firewall.send(
    receiver_agent_id="agent-b-uuid",
    task_type="research",
    payload={"query": "Summarize findings"},
)
```

## Verify Incoming Messages

```python
# Verify a message received from another agent
result = firewall.verify_message(
    sender_public_key="sender-ed25519-public-key-hex",
    message_hash="sha256-message-hash",
    signature="ed25519-signature-hex",
    expected_parent_chain_hash="previous-chain-hash",  # optional
)
assert result["signature_valid"]
assert result["chain_valid"]
```

## Fail Modes

| Mode | Behavior |
|------|----------|
| `closed` (default) | Raises `FirewallBlockedError` if the firewall is unreachable |
| `open` | Allows the message through if the firewall is unreachable |

## OpenTelemetry

When `opentelemetry-api` is installed, the SDK automatically creates spans for every `firewall.inspect` call with `task_type`, `decision`, and `risk_score` attributes. No configuration needed.

```bash
pip install "a2a-firewall-sdk[otel]"
```

## API Reference

### `FirewallConfig`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `firewall_url` | `str` | required | Base URL of the A2A Firewall backend |
| `agent_api_key` | `str` | required | Workspace API key for authentication |
| `workspace_id` | `str` | `""` | Workspace identifier |
| `agent_id` | `str` | `""` | This agent's identifier |
| `agent_private_key` | `str` | `""` | Ed25519 private key (hex) for message signing |
| `timeout_seconds` | `float` | `5.0` | HTTP request timeout |
| `fail_mode` | `str` | `"closed"` | `"closed"` or `"open"` |

### `FirewallResponse`

| Field | Type | Description |
|-------|------|-------------|
| `task_id` | `str` | Unique task identifier |
| `decision` | `str` | `"allow"`, `"block"`, or `"review"` |
| `allowed` | `bool` | Whether the message is allowed to proceed |
| `risk_score` | `float` | Risk score (0.0 to 1.0) |
| `violations` | `list[dict]` | List of detected violations |
| `latency_ms` | `int` | Inspection latency in milliseconds |

### `FirewallBlockedError`

Raised when `raise_on_block=True` (default) and the message is blocked.

```python
try:
    firewall.send(...)
except FirewallBlockedError as e:
    print(f"Blocked: {e.reason}, risk: {e.risk_score}")
    print(f"Violations: {e.violations}")
```

## Links

- **GitHub**: [github.com/mananjp/a2a-firewall](https://github.com/mananjp/a2a-firewall)
- **Live Demo**: [a2a-firewall.onrender.com](https://a2a-firewall.onrender.com)
- **TypeScript SDK**: [@a2a-firewall/sdk on npm](https://www.npmjs.com/package/@a2a-firewall/sdk)

## License

MIT
