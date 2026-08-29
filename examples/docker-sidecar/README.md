# Docker Sidecar Deployment Example

Deploy the A2A Firewall transparent proxy as a sidecar container alongside your AI agent — **zero code changes required**.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Docker Network: a2a-governed                        │
│                                                      │
│  ┌──────────────────┐     ┌──────────────────────┐   │
│  │  a2a-proxy        │◄────│  your-agent          │   │
│  │  (sidecar)        │     │                      │   │
│  │  :8080            │     │  HTTPS_PROXY=http://  │   │
│  │                   │     │    a2a-proxy:8080     │   │
│  │  • TLS MITM       │     │  SSL_CERT_FILE=      │   │
│  │  • IPS Signatures  │     │    /certs/ca.crt     │   │
│  │  • PII Detection   │     │                      │   │
│  │  • SQLi Guard      │     │  (no code changes)   │   │
│  └──────────────────┘     └──────────────────────┘   │
│           │                                          │
│           │ Shared Volume: ca-certs                   │
│           │ /data/ca/ca.crt ──► /certs/ca.crt        │
└──────────────────────────────────────────────────────┘
```

## Quick Start

```bash
cd examples/docker-sidecar
docker compose up --build
```

The sample agent will:
1. Send a clean request → **ALLOWED**
2. Send a prompt injection → **BLOCKED**
3. Send a SQL injection → **BLOCKED**
4. Send a PII exfiltration attempt → **BLOCKED**

## How It Works

### 1. Proxy Sidecar Generates a Local Root CA

On first start, the `a2a-proxy` container generates a Root CA certificate at `/data/ca/ca.crt`. This CA is shared with agent containers via a Docker volume.

### 2. Agent Container Trusts the CA

The agent container mounts the CA volume at `/certs/` (read-only) and sets standard environment variables:

| Variable | Value | Consumed By |
|:---|:---|:---|
| `HTTPS_PROXY` | `http://a2a-proxy:8080` | Python `httpx`/`requests`, Node.js, Go, curl |
| `SSL_CERT_FILE` | `/certs/ca.crt` | Python `ssl`, OpenSSL |
| `REQUESTS_CA_BUNDLE` | `/certs/ca.crt` | Python `requests` |
| `NODE_EXTRA_CA_CERTS` | `/certs/ca.crt` | Node.js |
| `CURL_CA_BUNDLE` | `/certs/ca.crt` | curl |

### 3. Traffic Is Transparently Intercepted

When the agent makes any HTTPS call (OpenAI, Anthropic, custom APIs), the proxy:
1. Terminates the TLS connection using a dynamically-generated leaf certificate
2. Inspects the decrypted payload for threats (injection, PII, SQLi)
3. Forwards clean traffic to the real upstream, or returns `403` for violations

## Adapt for Your Agent

Replace `sample-agent` in `docker-compose.yml` with your own image:

```yaml
  my-agent:
    image: my-registry/my-agent:latest
    depends_on:
      a2a-proxy:
        condition: service_healthy
    environment:
      HTTP_PROXY: "http://a2a-proxy:8080"
      HTTPS_PROXY: "http://a2a-proxy:8080"
      SSL_CERT_FILE: "/certs/ca.crt"
      REQUESTS_CA_BUNDLE: "/certs/ca.crt"
      NODE_EXTRA_CA_CERTS: "/certs/ca.crt"
    volumes:
      - ca-certs:/certs:ro
```

That's it. No SDK installation, no agent code changes, no API key for the firewall.
