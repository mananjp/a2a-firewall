# ADR-0003: System-Wide Transparent Proxy via iptables REDIRECT + systemd Daemon

## Status
Accepted

## Context
The A2A Firewall previously required the user to change how they launch their
agent tools: `proxy run -- opencode` set `HTTP_PROXY`/`HTTPS_PROXY` env vars for a
single child process and bound the proxy to `127.0.0.1:8080`. This is process
*wrapping*, not system-wide governance. VPN clients, corporate web security
gateways, and endpoint agents solve the same problem by installing a background
service once and redirecting at the OS network layer, so **every** app on the
machine is transparently routed with zero per-app configuration.

Additionally several components already present in the repo were not wired to
the running proxy: the eBPF loader was a stub (never compiled/attached), the
full 5-layer detection pipeline in `detection/orchestrator.py` was never invoked
from the proxy (`inspect_callback` was defined but unused), the process egress
watcher was never started, and there was no OS CA trust-store installation.

## Decision
Move from process-wrapping to **install-once, system-wide transparent
proxying**, targeting Linux first:

1. **Kernel-level redirection** — `TransparentRedirect` installs iptables
   `nat` `PREROUTING` + `OUTPUT` `REDIRECT` rules that send all outbound TCP
   80/443 to the local proxy, matching the mitmproxy transparent mode pattern.
2. **Loop-avoidance** — every redirect rule carries
   `--match mark ! --mark 0xA2A1`, and the daemon sets `SO_MARK` on its own
   sockets. The eBPF program also exempts the proxy's PID (`exempt_pids` map)
   and any socket whose mark equals `A2A_FWMARK`, so the proxy's upstream
   traffic never re-enters itself.
3. **Background service** — a systemd unit rendered by `service/unit.py` runs
   `a2a-proxy daemon` with process egress guard enabled and the OS CA trust env
   vars exported.
4. **OS CA auto-trust** — `proxy/trust.py` installs the root cert into
   `/usr/local/share/ca-certificates` + `update-ca-certificates`, plus
   `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`, `CURL_CA_BUNDLE`,
   `NODE_EXTRA_CA_CERTS`.
5. **Best-effort eBPF with fallback** — the loader now actually compiles
   (`clang`) and attaches (`bpftool`) the filter when tooling is present and
   Linux+root, otherwise falls back to the user-space `ProcessEgressWatcher`.
   It never hard-fails the service.
6. **Flag-gated full pipeline** — when `A2A_INSPECT_ENABLED=1`, the proxy
   routes normalized requests into `run_inspection()` via
   `detection/pipeline_bridge.py`; otherwise the fast built-in gate is used.
7. **Transparent host resolution** — the proxy prefers the HTTP `Host` header
   to resolve the true origin when iptables has redirected a connection, since
   the CONNECT target in transparent mode is the proxy itself.

## Consequences
### Positive
- True "install once, works forever" for Linux/Docker/K8s deployments.
- Reuses the existing dynamic CA, eBPF source, process watcher, and detection
  pipeline rather than replacing them.
- Dry-run everywhere: every install/assert command logs without mutating the
  system unless explicitly enabled, so the tooling is safe to exercise on any
  host (including Windows/CI) and in unprivileged containers.

### Negative / Trade-offs
- **Linux-only network-layer interception.** macOS (Network Extension) and
  Windows (WFP driver) require platform-specific mechanisms and are tracked as
  follow-up work.
- Quiet failure risk: if eBPF tooling is missing the guard silently runs in
  user-space mode (still safe, minus kernel-enforced dropping).
- Transparent HTTPS interception requires the OS to trust the A2A root CA,
  which is a security decision the administrator explicitly opts into.

## Follow-ups
- macOS `NETransparentProxyProvider` and Windows WFP callout driver.
- Linux CI job to exercise real `iptables`/`systemd`/eBPF attach end-to-end.
