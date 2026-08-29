# Production Monitoring & Observability Guide — A2A Firewall

This guide outlines production observability standards for **A2A Firewall**, including OpenTelemetry distributed tracing, Prometheus metric definitions, Grafana dashboard setups, and recommended alert thresholds.

---

## 📊 Observability Architecture

A2A Firewall exports rich telemetry at every inspection hop using the **OpenTelemetry (OTel)** standard:

```
┌──────────────────────────────────────────────────────────┐
│                      A2A Mesh Nodes                      │
│                                                          │
│   ┌─────────────────────┐        ┌───────────────────┐   │
│   │ A2A Ingress Gateway │        │ A2A Proxy Sidecar │   │
│   │ (Port 8000)         │        │ (Port 8080)       │   │
│   └──────────┬──────────┘        └─────────┬─────────┘   │
│              │                             │             │
│              ▼                             ▼             │
│      OTLP gRPC (Port 4317) / OTLP HTTP (Port 4318)       │
│                                                          │
│              ▼                             ▼             │
│   ┌─────────────────────┐        ┌───────────────────┐   │
│   │   Prometheus /      │        │ Jaeger / Datadog  │   │
│   │   Grafana (Metrics) │        │ (Distributed Spans│   │
│   └─────────────────────┘        └───────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## 📈 Prometheus Metrics Reference

| Metric Name | Type | Labels | Description |
| :--- | :--- | :--- | :--- |
| `a2a_requests_total` | Counter | `decision` (allow/block/review), `workspace_id`, `task_type` | Total number of inter-agent inspection requests. |
| `a2a_inspection_duration_seconds` | Histogram | `layer` (layer0_preflight, layer3_rules, layer4_semantic) | Latency distribution of individual firewall inspection layers. |
| `a2a_violations_total` | Counter | `violation_type`, `severity` (low/med/high/critical) | Total security violations flagged (e.g. prompt_injection, sqli, pii). |
| `a2a_spend_tokens_total` | Counter | `agent_id`, `model` | Cumulative tokens consumed by agent workloads. |
| `a2a_spend_cost_usd_total` | Counter | `workspace_id`, `agent_id` | Estimated inference spend based on model rate cards. |
| `a2a_quarantine_agents_active` | Gauge | `workspace_id` | Number of malicious/honeypot-quarantined agents currently isolated. |
| `a2a_proxy_connections_active` | Gauge | `host` | Active TCP client connections handled by the transparent proxy. |

---

## 🔭 OpenTelemetry Tracing Spans

Every governed request produces a structured span hierarchy:

```
[CLIENT] firewall.inspect (SDK Send)
  ├── [SERVER] a2a.gateway.ingress
  │     ├── [INTERNAL] layer0.preflight_canary_scan
  │     ├── [INTERNAL] layer1.schema_validation
  │     ├── [INTERNAL] layer2.macaroon_attenuation_check
  │     ├── [INTERNAL] layer3.rule_and_ips_signatures
  │     ├── [INTERNAL] layer4.groq_semantic_intent_drift
  │     └── [INTERNAL] layer5.decision_synthesis
  └── [AUDIT] audit_log.commit
```

### Key Span Attributes:
- `a2a.task_id`: Unique UUID of the message.
- `a2a.root_task_id`: Root task identifier across multi-hop delegation chains.
- `a2a.decision`: Final verdict (`allow`, `block`, `review`).
- `a2a.risk_score`: Aggregated threat score from `0.0` to `1.0`.
- `a2a.violations_count`: Number of policy breaches identified.

---

## 🚨 Production Alert Thresholds & Runbooks

Configure the following alerts in Prometheus Alertmanager or Datadog:

| Alert Name | Severity | Condition | Recommended Action |
| :--- | :--- | :--- | :--- |
| **HighRiskViolationSurge** | 🔴 Critical | Rate of `violations_total{severity="critical"}` > `5 / min` | Potential coordinated prompt injection or reconnaissance attack. Check SOC queue and review quarantined agents. |
| **SpendBudgetThresholdBreach** | 🟡 Warning | Workspace spend reaches `> 85%` of monthly quota | Notify workspace admin to allocate additional budget or optimize prompt token sizes. |
| **P99LatencyDegradation** | 🟡 Warning | `p99(a2a_inspection_duration_seconds) > 50ms` | Check database connection pool health and Groq semantic API response times. |
| **ProxyHealthProbeFailure** | 🔴 Critical | `up{job="a2a-proxy"} == 0` for `> 1m` | Proxy sidecar container crashed or port 8080 unavailable. Check container logs. |
| **DatabaseConnectionExhaustion** | 🔴 Critical | Active DB pool connections `> 90%` of max pool size | Scale backend replicas or increase PostgreSQL connection pool limit. |

---

## 🖥️ Health & Readiness Endpoints

- **Backend API Health**: `GET http://localhost:8000/health` &rarr; `200 OK` `{"status": "healthy"}`
- **Transparent Proxy Health**: `GET http://localhost:8080/healthz` &rarr; `200 OK` `{"status": "healthy", "ca_ready": true}`
- **OpenTelemetry Export**: `POST http://localhost:4318/v1/traces`
