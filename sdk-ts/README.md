# a2a-firewall-sdk (TypeScript / Node.js)

**TypeScript SDK for the [A2A Firewall](https://github.com/mananjp/a2a-firewall)** — the Zero-Trust Agent Runtime Security Fabric providing cryptographic governance, bidirectional response inspection, memory protection, and lineage-aware DLP for autonomous AI agents.

[![npm version](https://img.shields.io/npm/v/a2a-firewall-sdk)](https://www.npmjs.com/package/a2a-firewall-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## What It Does

The A2A Firewall enforces deterministic runtime security across multi-agent systems and LLM workflows:

- **Cryptographic Decision Evidence Envelopes** — Every decision is packaged into an Ed25519-signed bundle with input SHA-256 hashes, detector fingerprints, and offline audit verification (`evidenceId`).
- **Bidirectional Response & Tool Inspection** — Intercept and sanitize upstream LLM completions and tool execution results against indirect prompt injection, PII leakage, and output poisoning.
- **Agent Memory & RAG Firewall** — Guard vector databases and episodic memory with write-time injection scanning, semantic poisoning checks, and query retrieval screening.
- **Lineage-Aware DLP & Reversible Tokenization Vault** — Destination-based PII masking, hashing, blocking, and reversible HMAC-SHA256 tokenization with compliance lineage tags (RBI, DPDP, PCI-DSS, HIPAA, GDPR).
- **Inter-Agent Mesh Governance** — 6-layer detection pipeline, Macaroon-style capability attenuation, and deterministic < 20ms p99 latency.
- **Sidecar & Proxy Auto-Detection** — Automatically routes through `a2a-proxy` sidecars when containerized.

---

## Installation

```bash
npm install a2a-firewall-sdk
```

---

## Quick Start

```typescript
import { A2AFirewall } from 'a2a-firewall-sdk';

const firewall = new A2AFirewall({
  firewallUrl: 'https://api.a2afirewall.com',
  agentApiKey: 'your_agent_api_key',
  agentId: 'agent-planner-01',
  workspaceId: 'ws-primary',
  agentPrivateKey: 'ed25519-private-key-hex',  // optional: enables signing
  failMode: 'closed',
});

// 1. Send task through firewall
const response = await firewall.send({
  receiverAgentId: 'agent-analyst-02',
  taskType: 'financial_research',
  payload: { query: 'Evaluate Q3 market exposure.' },
});

console.log(`Decision: ${response.decision}`);       // "allow" | "block" | "review"
console.log(`Risk score: ${response.riskScore}`);   // 0.0 to 1.0
console.log(`Evidence ID: ${response.evidenceId}`); // Ed25519 signed decision envelope
```

---

## Agent Runtime Security Fabric (v0.4.x)

### 1. Bidirectional Response & Tool Result Scanning

Inspect untrusted upstream LLM completions or external tool results before passing them back into the agent context:

```typescript
const toolResult = { output: 'System prompt leaked: AWS_SECRET_KEY=AKIA...' };

const res = await firewall.inspectResponse(
  toolResult,
  'tool_result',  // 'tool_result' or 'llm_response'
  true            // redact PII
);

if (res.allowed_to_proceed) {
  const safeBody = res.redacted_body ?? toolResult;
} else {
  console.error(`Response blocked: ${JSON.stringify(res.violations)}`);
}
```

### 2. Memory & RAG Firewall

Screen memory writes before persisting into episodic memory or vector stores to prevent indirect injection and semantic poisoning:

```typescript
// Inspect candidate memory write
const inspection = await firewall.inspectMemory(
  'User prefers payment via card 4111-2222-3333-4444',
  true
);

// Inspect and safely store in one step
const storeRes = await firewall.storeMemory(
  'Meeting summary: roadmap alignment complete.',
  { sourceAgent: 'agent-planner-01' },
  true,
  true
);
console.log(`Persisted: ${storeRes.persisted}, Hash: ${storeRes.content_hash}`);

// Screen retrieval query before releasing memories to agent
const searchRes = await firewall.searchMemory('Find roadmap details', 5);
console.log(`Matched safe chunks:`, searchRes.results);
```

### 3. Lineage-Aware DLP & Reversible Tokenization

Protect sensitive data flowing to external LLM providers or third-party webhooks:

```typescript
const rawPrompt = 'Customer John Doe with PAN ABCDE1234F requested balance check.';

// Tokenize PII using reversible HMAC vault
const dlpRes = await firewall.inspectDlp(
  rawPrompt,
  'llm_provider',  // 'llm_provider' | 'external' | 'partner' | 'internal'
  undefined,
  true             // enable tokenization
);

console.log(`Action taken: ${dlpRes.action}`);                     // 'tokenize' | 'redact' | 'block'
console.log(`Transformed: ${dlpRes.transformed_text}`);           // 'Customer John Doe with PAN [TOKEN_PAN_...]...'
console.log(`Detected entities:`, dlpRes.findings);
```

### 4. Cryptographic Decision Evidence Envelopes

Retrieve and independently verify Ed25519-signed decision envelopes for zero-trust audits:

```typescript
// Fetch signed envelope by decision ID
const envelope = await firewall.getEvidence(response.evidenceId!);

// Cryptographically verify the Ed25519 signature offline
const verification = await firewall.verifyEvidence(response.evidenceId!);
console.assert(verification.valid === true);
```

---

## Delegation & Attenuation

Mint cryptographically attenuated Macaroon delegation tokens that narrow permissions at each delegation hop:

```typescript
import { mintDelegationToken, attenuateToken, tokenToCompact } from 'a2a-firewall-sdk';

// Mint a root token
const rootToken = mintDelegationToken(
  rootKeyHex,
  'ws-primary',
  'agent-root',
  ['task_type=financial_research', 'max_risk=0.5']
);

// Attenuate for delegation (can only narrow, never widen)
const childToken = attenuateToken(rootToken, rootKeyHex, ['max_risk=0.3']);

// Serialize for transport
const compact = tokenToCompact(childToken);
```

---

## Transparent Proxy Auto-Detection

When running inside a containerized agent mesh alongside an `a2a-proxy` sidecar, the SDK auto-discovers the proxy and Root CA from standard environment variables:

```typescript
const firewall = new A2AFirewall({
  firewallUrl: 'http://a2a-backend:8000',
  agentApiKey: 'your_api_key',
});

if (firewall.proxyDetected) {
  console.log('Zero-touch interception active via sidecar proxy');
}
```

| Variable | Purpose | Priority |
|:---|:---|:---|
| `A2A_PROXY_URL` / `HTTPS_PROXY` | Proxy endpoint (e.g. `http://a2a-proxy:8080`) | Auto-routed |
| `A2A_CA_CERT` / `SSL_CERT_FILE` | Path to Root CA certificate | Auto-trusted |

---

## Links

- **GitHub Repository**: [github.com/mananjp/a2a-firewall](https://github.com/mananjp/a2a-firewall)
- **Live SOC Dashboard**: [a2a-firewall.onrender.com](https://a2a-firewall.onrender.com)
- **Python SDK**: [a2a-firewall-sdk on PyPI](https://pypi.org/project/a2a-firewall-sdk/)
- **Documentation**: [docs/](https://github.com/mananjp/a2a-firewall/tree/main/docs)

---

## License

MIT © Manan Patel
