# A2A Firewall — n8n Proxy Sidecar Recipe

This recipe deploys **n8n** alongside the **A2A Transparent Proxy Sidecar** using Docker Compose. Outbound traffic (such as LLM requests, tool executions, and external HTTP calls) is transparently routed through the firewall proxy for real-time inspection, DLP, and policy governance with zero code modifications to your n8n workflows.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│                  Docker Host                 │
│                                              │
│  ┌──────────────┐         ┌───────────────┐  │
│  │     n8n      │ HTTPS   │   a2a-proxy   │  │    Outbound HTTPS
│  │ (Automation) │────────▶│   (Sidecar)   │──┼───────────────────▶  External APIs
│  └──────────────┘         └───────┬───────┘  │                      (OpenAI, Claude,
│         ▲                         │          │                       Webhooks, etc.)
│         │ NO_PROXY                ▼          │
│         │                ┌────────────────┐  │
│         └────────────────│  a2a-backend   │  │
│                          │ (Inspection)   │  │
│                          └────────────────┘  │
└──────────────────────────────────────────────┘
```

---

## Key Considerations & Reality Checks

### 1. Which n8n nodes honour `HTTPS_PROXY`
- **HTTP Request node (`n8n-nodes-base.httpRequest`)**: Fully honours `HTTP_PROXY`, `HTTPS_PROXY`, and `NODE_EXTRA_CA_CERTS`.
- **LangChain / AI Agent nodes (OpenAI, Anthropic, HuggingFace models)**: Standard Node.js `undici`/`https` clients honour `NODE_EXTRA_CA_CERTS` and global proxy settings.
- **Webhook trigger / Local execution**: Inbound triggers do not route through the proxy unless explicitly called externally.

### 2. Startup Ordering & Dynamic CA Certificate
- When `a2a-proxy` boots, it dynamically generates an internal root Certificate Authority (`ca.crt`) in the shared `ca-certs` volume.
- The `docker-compose.yml` uses a Docker healthcheck on `a2a-proxy` (`condition: service_healthy`) to ensure n8n does not start until `ca.crt` is written and the proxy is listening on port 8080.
- n8n loads this certificate via `NODE_EXTRA_CA_CERTS=/certs/ca.crt` to trust the MITM inspection certificates generated on the fly.

### 3. The `NO_PROXY` Requirement
- **Critical rule**: You **must** configure `NO_PROXY=localhost,127.0.0.1,backend,a2a-proxy`.
- If n8n attempts to call the A2A Firewall backend API directly (for instance, when also using the A2A Firewall community node for fine-grained guard points), those requests must NOT flow through the proxy, which would cause an infinite inspection loop or redundant double-inspection.

### 4. Secret & Header Protection
- The proxy inspects HTTP payloads (JSON, text) for prompts, tool calls, and PII.
- **Authorization headers (Bearer tokens, API keys)** are stripped from telemetry and audit logs by design and never recorded to disk or database.
- Treat `a2a-proxy` logs and the `ca-certs` volume with the same access controls as production secrets.

---

## Quickstart

1. **Configure Environment**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set `A2A_API_KEY` to your agent/workspace key.

2. **Launch Services**:
   ```bash
   docker compose up --build
   ```

3. **Verify Proxy Health**:
   ```bash
   curl http://localhost:8080/healthz
   ```

4. **Import Test Workflow**:
   - Open n8n in your browser at `http://localhost:5678`.
   - Complete initial setup.
   - Click **Workflows** -> **Import from File**, and select [`test-workflow.json`](./test-workflow.json).
   - Click **Execute Workflow**.
   - Check the A2A Firewall dashboard or logs to confirm the HTTP request was intercepted and inspected.
