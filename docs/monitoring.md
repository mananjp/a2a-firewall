# Production Monitoring & Observability Guide — A2A Firewall

This guide outlines production observability standards for **A2A Firewall**, including OpenTelemetry distributed tracing, Prometheus metric definitions, Grafana dashboard setups, and recommended alert thresholds.

> ## ✅ Wired-up free tiers (implemented, not intent)
>
> Two observability capabilities below are **actually wired into this
> codebase** and only need an account + a couple of env vars to go live:
>
> | Capability | Free tier | Status | Wiring |
> | :-- | :-- | :-- | :-- |
> | **Error tracking** | Sentry | ✅ live-ready | `SENTRY_DSN` env var → `backend/src/a2a_firewall/core/sentry.py:setup_sentry()` |
> | **Uptime / status monitoring** | UptimeRobot | ✅ live-ready | `GET /health` (liveness) + `GET /ready` (DB readiness) in `backend/src/a2a_firewall/main.py` |
>
> - **Sentry** activates only when `SENTRY_DSN` is set; it instruments FastAPI
>   (captures 4xx/5xx) and logging (ERROR→Event). Empty DSN ⇒ graceful no-op.
>   Configure it in the Render dashboard (`SENTRY_DSN`,
>   `SENTRY_ENVIRONMENT=production`, `SENTRY_TRACES_SAMPLE_RATE=0.1`) or via
>   `backend/.env.example`.
> - **UptimeRobot** points HTTP monitors at `/health` and `/ready`. `/ready`
>   returns `200 {"status":"ready"}` only when a real `SELECT 1` DB round-trip
>   succeeds, else `503` — so a silently broken connection pool trips a
>   monitor instead of a green-but-failing service. See
>   [`monitoring/uptimerobot.yml`](../monitoring/uptimerobot.yml) for the
>   declarative monitor set and
>   [`monitoring/README.md`](../monitoring/README.md) for the 2-minute setup.
> - The Prometheus/Grafana/Jaeger/Datadog content that follows remains the
>   **self-hosted** observability layer (additive, not required for the free
>   tiers). A full OpenTelemetry collector + Prometheus stack is optional
>   production hardening, not the default.

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

- **Backend API Liveness** (UptimeRobot target): `GET http://localhost:8000/health` &rarr; `200 OK` `{"status": "ok", "version": "0.2.0", "service": "a2a-firewall"}`
- **Backend API Readiness** (UptimeRobot target): `GET http://localhost:8000/ready` &rarr; `200 OK` `{"status": "ready", "checks": {"database": "ok"}}`; `503` `{"status": "unavailable", ...}` when the DB round-trip fails.
- **Transparent Proxy Health**: `GET http://localhost:8080/healthz` &rarr; `200 OK` `{"status": "healthy", "ca_ready": true}`
- **OpenTelemetry Export**: `POST http://localhost:4318/v1/traces`
- **Sentry ingestion**: POSTed by `sentry-sdk` to the DSN host; configured via `SENTRY_DSN`.

> **UptimeRobot wiring**: monitor `/health` for liveness and `/ready` for
> readiness. `/ready` fails fast (503) when `SELECT 1` cannot reach the
> database, so a degraded-but-200 service is surfaced. See
> [`monitoring/uptimerobot.yml`](../monitoring/uptimerobot.yml) for the exact
> monitor definitions (with keyword checks) and alert-contact setup.
