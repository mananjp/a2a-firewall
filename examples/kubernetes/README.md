# Kubernetes Sidecar Deployment

Deploy the A2A Firewall transparent proxy as a sidecar container in your Kubernetes Pod.

## Architecture

```
┌─────────────── Pod: governed-agent ──────────────────┐
│                                                      │
│  ┌────────────────┐                                  │
│  │ Init Container  │  Generates Root CA cert/key     │
│  │ a2a-ca-init     │  into emptyDir volume           │
│  └───────┬────────┘                                  │
│          │ /data/ca/ca.crt                           │
│          ▼                                           │
│  ┌────────────────┐      ┌────────────────────────┐  │
│  │ Sidecar         │◄─────│ Main Container          │  │
│  │ a2a-proxy       │      │ your-agent              │  │
│  │ :8080           │      │                         │  │
│  │                 │      │ HTTPS_PROXY=127.0.0.1   │  │
│  │ Reads CA from   │      │ SSL_CERT_FILE=          │  │
│  │ /data/ca (ro)   │      │   /certs/ca.crt         │  │
│  └────────────────┘      └────────────────────────┘  │
│                                                      │
│  Volume: ca-certs (emptyDir)                         │
└──────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Apply the manifest
kubectl apply -f deployment.yaml

# Watch proxy logs
kubectl logs -f deployment/governed-agent -c a2a-proxy

# Watch agent logs
kubectl logs -f deployment/governed-agent -c agent

# Verify health
kubectl exec deployment/governed-agent -c agent -- \
    curl -s http://127.0.0.1:8080/healthz
```

## How It Works

1. **Init container** (`a2a-ca-init`) generates a Root CA into an `emptyDir` volume
2. **Sidecar** (`a2a-proxy`) reads the CA and runs the proxy on `127.0.0.1:8080`
3. **Agent** mounts the CA at `/certs/ca.crt` and sets `HTTPS_PROXY=http://127.0.0.1:8080`
4. All agent HTTPS traffic flows through the proxy — transparently intercepted and governed

## Adapt for Your Agent

Replace the `agent` container in `deployment.yaml`:

```yaml
- name: agent
  image: my-registry/my-agent:latest
  env:
    - name: HTTPS_PROXY
      value: "http://127.0.0.1:8080"
    - name: SSL_CERT_FILE
      value: /certs/ca.crt
    - name: REQUESTS_CA_BUNDLE
      value: /certs/ca.crt
    - name: NODE_EXTRA_CA_CERTS
      value: /certs/ca.crt
  volumeMounts:
    - name: ca-certs
      mountPath: /certs
      readOnly: true
```

## Resource Requirements

| Container | CPU Request | CPU Limit | Memory Request | Memory Limit |
|:---|:---|:---|:---|:---|
| `a2a-proxy` | 50m | 200m | 64Mi | 128Mi |
| `agent` | 100m | 500m | 128Mi | 256Mi |

The proxy is lightweight — p50 latency overhead is **<5ms** per request.
