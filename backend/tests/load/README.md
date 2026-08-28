# Load Testing Guide

## Prerequisites

Install [k6](https://k6.io/docs/get-started/installation/):

```bash
# macOS
brew install k6

# Windows (via Chocolatey)
choco install k6

# Docker
docker run --rm -i grafana/k6 run -
```

## Running Tests

### Against local docker-compose

```bash
# Start the backend
docker-compose up -d

# Run the load test
cd backend
k6 run tests/load/k6_inspect.js
```

### Against production (Render)

```bash
cd backend
k6 run --env BASE_URL=https://a2a-firewall-backend.onrender.com \
       --env API_KEY=your_workspace_api_key \
       tests/load/k6_inspect.js
```

### Quick smoke test (lower load)

```bash
k6 run --vus 5 --duration 30s tests/load/k6_inspect.js
```

## Scenarios

The default test configuration runs through:

| Stage | Duration | Virtual Users | Purpose |
|---|---|---|---|
| Ramp-up | 30s | 1 → 10 | Warm up |
| Ramp to peak | 30s | 10 → 50 | Gradual increase |
| Sustained | 2m | 50 | Steady-state load |
| Burst | 30s | 50 → 100 | Spike test |
| Sustained burst | 30s | 100 | High load |
| Ramp down | 30s | 100 → 10 | Graceful decrease |
| Cooldown | 30s | 10 → 0 | Wind down |

## Thresholds

| Metric | Threshold | Rationale |
|---|---|---|
| `inspect_latency p95` | < 500ms | Deterministic layers should be fast |
| `inspect_latency p99` | < 2000ms | Including Groq timeout fallback |
| `error_rate` | < 5% | Backend stability |
| `http_req_duration p95` | < 2000ms | Overall response time |

## Custom Metrics

- **`inspect_latency`**: End-to-end latency of the inspect endpoint
- **`block_rate`**: Percentage of requests that were blocked
- **`error_rate`**: Percentage of 5xx errors

## Interpreting Results

After the test completes, k6 outputs a summary. Key things to look for:

1. **p99 latency** — should be under 2s (or under 20ms for deterministic-only path)
2. **Error rate** — should be near 0% under normal load
3. **Rate limit hits** (429s) — expected during burst; verify they recover
4. **Block rate** — should be roughly proportional to the malicious payload ratio (50%)

## Failure Scenarios to Test

1. **Groq rate-limited mid-burst**: Set `GROQ_API_KEY` to an invalid key and verify graceful degradation
2. **DB pool exhaustion**: Run with higher VU count and monitor connection errors
3. **Backend killed mid-inspection**: Kill the backend process during load and verify no half-written state
