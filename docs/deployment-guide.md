# A2A Firewall — Deployment Guide

This guide covers every deployment pattern for the A2A Firewall transparent proxy, from local development to production Kubernetes clusters.

---

## Architecture Overview

The Tier A transparent proxy intercepts AI agent HTTP/HTTPS traffic **without requiring any agent code changes**. It works by:

1. Generating a local Root CA certificate
2. Running a TLS-intercepting proxy on a known port
3. Configuring agents to route traffic through the proxy via standard environment variables

```
┌──────────────┐      ┌──────────────────┐      ┌───────────────┐
│  AI Agent     │─────►│  A2A Proxy        │─────►│  OpenAI /      │
│               │      │  (TLS MITM)       │      │  Anthropic /   │
│  HTTPS_PROXY  │      │                   │      │  Any HTTPS     │
│  = proxy:8080 │      │  ✓ IPS Signatures │      └───────────────┘
│               │      │  ✓ PII Detection  │
│  SSL_CERT_FILE│      │  ✓ SQLi Guard     │      ┌───────────────┐
│  = /ca/ca.crt │      │  ✓ Prompt Inject  │──X──►│  BLOCKED       │
└──────────────┘      └──────────────────┘      │  (403)         │
                                                 └───────────────┘
```

---

## 1. Standalone CLI (Local Development)

The simplest way to run the proxy — wraps a single command:

```bash
# Install the proxy
pip install -e ./backend

# Run your agent through the proxy
python -m a2a_firewall.proxy run -- python my_agent.py
```

This automatically:
- Starts the proxy on `127.0.0.1:8080`
- Generates a Root CA in `~/.a2a/ca/`
- Sets `HTTPS_PROXY`, `SSL_CERT_FILE`, and `REQUESTS_CA_BUNDLE` for the child process
- Stops the proxy when the agent exits

### Start the proxy as a standalone server:

```bash
# Interactive mode
python -m a2a_firewall.proxy start --host 127.0.0.1 --port 8080

# View CA certificate path
python -m a2a_firewall.proxy ca-info
```

---

## 2. Docker Sidecar

Deploy the proxy as a sidecar container alongside your agent. This is the recommended pattern for Docker Compose deployments.

### Quick Start

```bash
cd examples/docker-sidecar
docker compose up --build
```

### Adapt for Your Agent

In your `docker-compose.yml`, add the proxy sidecar and shared CA volume:

```yaml
services:
  a2a-proxy:
    build:
      context: ./backend
      dockerfile: ../docker/Dockerfile.proxy
    volumes:
      - ca-certs:/data/ca
    ports:
      - "8080:8080"
    healthcheck:
      test: ["CMD", "python", "-c",
             "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz')"]
      interval: 5s
      timeout: 3s
      start_period: 5s

  my-agent:
    image: my-registry/my-agent:latest
    depends_on:
      a2a-proxy:
        condition: service_healthy
    environment:
      HTTPS_PROXY: "http://a2a-proxy:8080"
      SSL_CERT_FILE: "/certs/ca.crt"
      REQUESTS_CA_BUNDLE: "/certs/ca.crt"
      NODE_EXTRA_CA_CERTS: "/certs/ca.crt"
    volumes:
      - ca-certs:/certs:ro

volumes:
  ca-certs:
```

**That's it.** No SDK installation, no agent code changes.

---

## 3. Kubernetes Sidecar

Deploy the proxy as a sidecar container in your Kubernetes Pod.

### Quick Start

```bash
kubectl apply -f examples/kubernetes/deployment.yaml
kubectl logs -f deployment/governed-agent -c a2a-proxy
```

### Pod Spec Pattern

```yaml
spec:
  initContainers:
    - name: a2a-ca-init
      image: ghcr.io/mananjp/a2a-proxy:latest
      command: ["python", "-c",
        "from a2a_firewall.proxy.ca import CertificateAuthority; CertificateAuthority(ca_dir='/data/ca')"]
      env:
        - { name: A2A_CA_DIR, value: /data/ca }
        - { name: PYTHONPATH, value: /app/src }
      volumeMounts:
        - { name: ca-certs, mountPath: /data/ca }

  containers:
    - name: a2a-proxy
      image: ghcr.io/mananjp/a2a-proxy:latest
      ports: [{ containerPort: 8080 }]
      readinessProbe:
        httpGet: { path: /healthz, port: 8080 }
        initialDelaySeconds: 3
      volumeMounts:
        - { name: ca-certs, mountPath: /data/ca, readOnly: true }

    - name: my-agent
      image: my-registry/my-agent:latest
      env:
        - { name: HTTPS_PROXY, value: "http://127.0.0.1:8080" }
        - { name: SSL_CERT_FILE, value: /certs/ca.crt }
        - { name: REQUESTS_CA_BUNDLE, value: /certs/ca.crt }
        - { name: NODE_EXTRA_CA_CERTS, value: /certs/ca.crt }
      volumeMounts:
        - { name: ca-certs, mountPath: /certs, readOnly: true }

  volumes:
    - name: ca-certs
      emptyDir: {}
```

---

## 4. MCP Tool Governance

For agents using Model Context Protocol (MCP) tools via Claude Desktop, Cursor, or LangChain:

```bash
# Wrap an MCP server with security governance
python -m a2a_firewall.mcp wrap -- npx @anthropic/mcp-server-filesystem /workspace
```

This intercepts all `tools/call` JSON-RPC requests and blocks:
- Path traversal (`../etc/shadow`)
- Destructive commands (`rm -rf /`, `curl | sh`)
- SQL injection in tool arguments
- Blacklisted tools

---

## 5. SDK Auto-Detection

Both the Python and TypeScript SDKs automatically detect the transparent proxy from environment variables.

### Python SDK

```python
from a2a_firewall import A2AFirewall, FirewallConfig

firewall = A2AFirewall(FirewallConfig(
    firewall_url="http://backend:8000",
    agent_api_key="agt_xxx",
))

# Automatically detected:
print(firewall.proxy_detected)  # True (when HTTPS_PROXY is set)
```

### TypeScript SDK

```typescript
import { A2AFirewall } from '@a2a-firewall/sdk';

const firewall = new A2AFirewall({
  firewallUrl: 'http://backend:8000',
  agentApiKey: 'agt_xxx',
});

console.log(firewall.proxyDetected);  // true (when HTTPS_PROXY is set)
```

### Detected Environment Variables

| Variable | Purpose | Consumed By |
|:---|:---|:---|
| `A2A_PROXY_URL` | A2A-specific proxy URL (highest priority) | Python SDK, TS SDK |
| `HTTPS_PROXY` | Standard HTTPS proxy | Python `httpx`/`requests`, Node.js, Go, curl |
| `HTTP_PROXY` | Standard HTTP proxy | Python, Node.js, Go, curl |
| `A2A_CA_CERT` | A2A-specific CA cert path (highest priority) | Python SDK, TS SDK |
| `SSL_CERT_FILE` | OpenSSL CA cert | Python `ssl` |
| `REQUESTS_CA_BUNDLE` | Python `requests` CA | Python `requests` |
| `NODE_EXTRA_CA_CERTS` | Node.js CA | Node.js `https` |
| `CURL_CA_BUNDLE` | curl CA | curl |

---

## 6. Platform Support Matrix

| Platform | Proxy Mechanism | Setup Complexity | Code Changes |
|:---|:---|:---|:---|
| **Docker Compose** | Sidecar container + shared volume | 2-line env var change | None |
| **Kubernetes** | Sidecar + init container + emptyDir | Pod spec addition | None |
| **Local CLI** | `proxy run -- <cmd>` | Single command | None |
| **Linux Host** | systemd + iptables REDIRECT + eBPF (Tier B) | Root required | None |
| **macOS / Windows** | Per-process CLI wrapper | Single command | None |

---

## 7. Health & Monitoring

### Proxy Health Endpoint

```bash
curl http://127.0.0.1:8080/healthz
# {"status": "healthy", "ca_ready": true, "proxy_running": true}
```

### Performance Overhead

| Layer | Operation | Latency (p50) | Latency (p99) |
|:---|:---|:---|:---|
| Protocol Normalizer | Request parsing | 0.006 ms | 0.014 ms |
| MCP Policy Engine | Tool argument inspection | 0.682 ms | 0.804 ms |
| Full TLS MITM Proxy | TCP + TLS + Policy Gate | 4.450 ms | 70.878 ms |

The total overhead is **<5ms p50** — imperceptible vs. upstream LLM inference latency (200–800ms TTFT).

---

## 8. Environment Variable Reference

| Variable | Default | Description |
|:---|:---|:---|
| `A2A_CA_DIR` | `~/.a2a/ca` | Directory to store Root CA cert and key |
| `A2A_INSPECT_ENABLED` | `true` | Route proxy traffic through full detection pipeline |
| `A2A_FW_MARK` | `0xA2A1` | Socket mark for iptables loop exclusion (Tier B) |
| `A2A_REDIRECT_ENABLED` | `false` | Enable iptables PREROUTING REDIRECT (Tier B) |
| `A2A_DEFAULT_DRY_RUN` | `true` | Installer commands are no-ops unless forced off (Tier B) |
