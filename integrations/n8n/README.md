# n8n-a2a-firewall

Community node package for [A2A Firewall](https://github.com/mananjp/a2a-firewall) to govern, inspect, and protect AI agent workflows in n8n.

---

## Installation

### Self-Hosted n8n (UI)
1. Go to **Settings** → **Community Nodes** in your n8n instance.
2. Select **Install a community node**.
3. Enter `n8n-a2a-firewall` and accept the risks.

### Docker / Custom Build
In your n8n Docker image or volume root:
```bash
npm install n8n-a2a-firewall
```

---

## Credentials

Create an **A2A Firewall API** credential in n8n:
- **Firewall URL**: Base URL of your firewall backend (e.g. `http://a2a-backend:8000` or `https://firewall.internal.example.com`).
- **API Key**: Workspace API key (required for Detokenize and administrative actions) or agent API key (`Bearer` token).
- **Workspace ID**: The UUID of your workspace in A2A Firewall.
- **Default Agent ID** *(optional)*: Registered agent identity representing this workflow.

> **Note on Request Signing**: Ed25519 payload signing will land in v0.2.0 once end-to-end backend signature verification tests are finalized.

---

## Nodes Overview

| Node | Purpose | Outputs |
| :--- | :--- | :--- |
| **A2A Firewall Guard** | Inspect prompts, tool calls, and model inputs before they execute | `Allow` · `Block` · `Review` |
| **A2A Firewall Inspect Response** | Inspect and sanitize content returned to an agent (web scraping, DB rows, RAG chunks, LLM outputs) | `Allow` · `Block` · `Review` |
| **A2A Firewall DLP** | Cryptographically tokenize sensitive PII before LLM calls, and detokenize responses with audited purpose | `Main` (Success) |

---

## Recommended AI Agent Architecture

```
Webhook ─► Inspect Response ─(Allow)─► DLP: Tokenize ─► AI Agent ─► Guard(tool_call) ─(Allow)─► Tool
              │(Block)                                                  │(Block)
              ▼                                                         ▼
        Stop and Error                                            Stop and Error
```

1. **Pre-LLM Inspection**: Content fetched from external sources (web, customer tickets) is inspected via **Inspect Response** for prompt injections.
2. **DLP Tokenization**: Sensitive customer identifiers (SSNs, cards, emails) are tokenized via **DLP Tokenize** before being sent to cloud LLM providers.
3. **Guard Step**: Outgoing tool actions (e.g. `execute_sql`, `refund_payment`) pass through **Guard** against fine-grained policies.
4. **Post-Processing**: Upon completion, **DLP Detokenize** restores required fields with an audited reason.

---

## Human Approval Flow (Review output)

1. In the **Guard** node, expand **Options** → set **Review Callback URL** to `{{ $execution.resumeUrl }}`.
2. Connect the **Review** output of the Guard node to a **Wait** node set to **Resume: On Webhook Call**.
3. When the firewall Flags a high-risk action for human review, the request holds. Once an analyst approves or rejects the item in the A2A Firewall web dashboard, the firewall dispatches an async POST webhook back to n8n:
   ```json
   {
     "decision": "approve",
     "reason": "Verified legitimate transaction",
     "review_token": "tok-...",
     "task_id": "..."
   }
   ```
4. Connect an **IF** node after the Wait node to route based on `{{ $json.body.decision }} === 'approve'`.

---

## Security Notes

- **Fail-Closed by Default**: When the firewall cannot be reached or returns an unexpected error, nodes route to **Block** unless explicitly configured to fail open.
- **NO_PROXY Setting**: When running n8n alongside the A2A Transparent Proxy sidecar, configure `NO_PROXY=localhost,127.0.0.1,backend,a2a-proxy` to ensure node API traffic is never looped through the proxy.
- **Detokenize Permissions**: Detokenize operations require a Workspace API key (agent API keys are rejected) and an explicit `purpose` parameter. Every detokenization is permanently logged for compliance.

---

## License

MIT © 2026 Manan Jayeshkumar Panchal. See the [LICENSE](LICENSE) file for details.

