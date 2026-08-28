# a2a-firewall-sdk (TypeScript / Node.js)

**TypeScript SDK for the [A2A Firewall](https://github.com/mananjp/a2a-firewall)** — an inter-agent governance mesh that inspects, signs, and attenuates every message between AI agents.

[![npm version](https://img.shields.io/npm/v/a2a-firewall-sdk)](https://www.npmjs.com/package/a2a-firewall-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## What It Does

The A2A Firewall sits between agents in any multi-agent system and enforces security policies on every inter-agent message:

- **6-layer detection pipeline** — schema validation, permission checks, rule engine, CVE risk, LLM semantic analysis, and policy decisions
- **Ed25519 message signing** — every message is cryptographically signed via [tweetnacl](https://tweetnacl.js.org), creating a tamper-evident hash chain
- **Macaroon-style delegation** — capabilities attenuate (narrow) at each hop, never widen
- **< 20ms p99 deterministic latency** — crypto and rule layers run without LLM calls

This SDK handles all of that automatically.

## Installation

```bash
npm install a2a-firewall-sdk
```

## Quick Start

```typescript
import { A2AFirewall } from 'a2a-firewall-sdk';

const firewall = new A2AFirewall({
  firewallUrl: 'https://a2a-firewall-backend.onrender.com',
  workspaceId: 'your-workspace-uuid',
  agentId: 'your-agent-uuid',
  agentApiKey: 'your_workspace_api_key',
  agentPrivateKey: 'ed25519-private-key-hex',  // optional: enables signing
  failMode: 'closed',
});

const response = await firewall.send({
  receiverAgentId: 'target-agent-uuid',
  taskType: 'research',
  payload: { query: 'What are the latest fraud trends?' },
});

console.log(`Decision: ${response.decision}`);  // "allow" | "block" | "review"
console.log(`Risk score: ${response.riskScore}`);
```

## Delegation Tokens

```typescript
import { mintDelegationToken, attenuateToken, tokenToCompact } from '@a2a-firewall/sdk';

// Mint a root token
const rootToken = mintDelegationToken(
  rootKeyHex,
  'workspace-id',
  'agent-a-id',
  ['task_type=research', 'max_risk=0.5'],
);

// Attenuate for delegation (can only narrow, never widen)
const childToken = attenuateToken(rootToken, rootKeyHex, ['max_risk=0.3']);

// Serialize for transport
const compact = tokenToCompact(childToken);
```

## Ed25519 Signing

```typescript
import { generateEd25519Keypair, signMessage, verifyEd25519 } from '@a2a-firewall/sdk';

// Generate a keypair
const { publicKey, privateKey } = generateEd25519Keypair();

// Sign a message hash
const signature = signMessage(privateKey, messageHashHex);

// Verify
const valid = verifyEd25519(publicKey, signature, messageHashHex);
```

## Crypto Utilities

All crypto functions are exported for direct use:

```typescript
import {
  sha256Hex,
  computeMessageHash,
  computeChainHash,
  mintDelegationToken,
  verifyDelegationToken,
} from '@a2a-firewall/sdk';
```

## API Reference

### `FirewallConfig`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `firewallUrl` | `string` | required | Base URL of the A2A Firewall backend |
| `agentApiKey` | `string` | required | Workspace API key |
| `workspaceId` | `string` | `""` | Workspace identifier |
| `agentId` | `string` | `""` | This agent's identifier |
| `agentPrivateKey` | `string` | `""` | Ed25519 private key (hex) for signing |
| `timeoutMs` | `number` | `5000` | HTTP request timeout in milliseconds |
| `failMode` | `"closed" \| "open"` | `"closed"` | Behavior when firewall is unreachable |

### `FirewallResponse`

| Field | Type | Description |
|-------|------|-------------|
| `taskId` | `string` | Unique task identifier |
| `decision` | `string` | `"allow"`, `"block"`, or `"review"` |
| `allowed` | `boolean` | Whether the message proceeds |
| `riskScore` | `number` | Risk score (0.0–1.0) |
| `violations` | `object[]` | Detected violations |
| `latencyMs` | `number` | Inspection latency |

## Links

- **GitHub**: [github.com/mananjp/a2a-firewall](https://github.com/mananjp/a2a-firewall)
- **Live Demo**: [a2a-firewall.onrender.com](https://a2a-firewall.onrender.com)
- **Python SDK**: [a2a-firewall-sdk on PyPI](https://pypi.org/project/a2a-firewall-sdk/)

## License

MIT
