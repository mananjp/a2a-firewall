# Task Completion — System-Wide Transparent Proxy Upgrade

## Objective
Upgrade the A2A Firewall backend from process-wrapping (`proxy run -- cmd`) to a
Linux-first, install-once **system-wide transparent proxy**: iptables REDIRECT +
loop exclusion, systemd daemon, OS CA auto-trust, and wiring of previously
disconnected components (eBPF loader, detection pipeline, process watcher).

## Decisions Applied
- Linux first (macOS/Windows network-layer interception is tracked as follow-up).
- Full integration of the 5-layer detection pipeline into the proxy,
  flag-gated behind `A2A_INSPECT_ENABLED`.
- Best-effort eBPF compile/attach with graceful fallback to
  `ProcessEgressWatcher`.
- System-wide capture, opt-in via installer flag.
- Dev machine is **Windows (win32)** — kernel bits (eBPF attach, iptables,
  systemd) cannot execute here. All code is dry-run safe and the unit suite
  stays green on Windows; real kernel verification is deferred to a Linux CI
  job.

## What Was Delivered (by module)

| Layer | Module | Change |
|---|---|---|
| L1 | `egress_guard/ebpf_program.c` | Added `A2A_FWMARK 0xA2A1` macro, `exempt_pids` map, `ctx->mark` check + exempt-PID check before the monitoring check so the proxy's own traffic is never looped. |
| L1 | `egress_guard/transparent_redirect.py` (new) | `TransparentRedirect` dataclass; iptables PREROUTING+OUTPUT REDIRECT for ports 80/443 with `! --mark 0xa2a1`; `SO_MARK`; dry-run default. |
| L1 | `egress_guard/ebpf_loader.py` | Now actually compiles (`clang`) and attaches (`bpftool`) the filter when Linux+root+tooling are present, otherwise falls back; never hard-fails the service. |
| L2 | `service/unit.py` (new) | `SystemdUnit` renderer; exports SSL/CURL/NODE CA vars and A2A_* vars. |
| L2 | `service/linux_installer.py` (new) | `LinuxInstaller` (install/uninstall/status, dry-run default) using `HostTrust.install_to_system()`. |
| L3 | `proxy/trust.py` (new) | `Capability` + `HostTrust`: install/remove root CA into `/usr/local/share/ca-certificates` + `update-ca-certificates`, dry-run. |
| L4 | `proxy/cli.py` | New subcommands `install`/`uninstall`/`status`/`daemon`; `run_proxy_server` gains `enable_egress_guard`/`mark_socket`/`inspect_enabled`; `_inspect_callback` async; ASYNC110 fixed. |
| L4 | `detection/pipeline_bridge.py` (new) | Async bridge `inspect_from_proxy` → `_to_enterprise_request` → `_resolve_context` (first Agent/Workspace) → `run_inspection()`. |
| L4 | `proxy/server.py` | Transparent-mode host resolution (prefer HTTP `Host` header when CONNECT target is loopback); SIM105 + mypy fixes. |
| L4 | `proxy/normalizer.py` | Added `host: str \| None = None` to `NormalizedAIRequest`. |
| L5 | `core/config.py` | Added `A2A_FW_MARK`, `A2A_REDIRECT_ENABLED`, `A2A_INSPECT_ENABLED`, `A2A_DEFAULT_DRY_RUN`. |
| L5 | `scripts/install-linux.sh`, `scripts/uninstall-linux.sh` | Shell installers. |

## Tests
All new/updated modules have dedicated unit tests. Full unit suite:

```
190 passed  (tests/unit)   — all green
tests/integration/test_proxy_server.py — 2 passed (transparent host-resolution
regression check)
```

Key coverage: `pipeline_bridge` 91%, `transparent_redirect` 64%, `unit` 100%,
`ebpf_loader` 71%, `trust` 76%.

## Verified Clean (this task's scope)
- `ruff check` — clean on all new + modified source and test files.
- `ruff format --check` — all formatted.
- `mypy --strict` — `Success: no issues found in 10 source files` (all touched
  modules).

## Pre-Existing Baseline (NOT introduced by this task, left as-is)
The full-tree `make pipeline` targets still fail on pre-existing issues in
**unrelated** files, none of which are this task's scope:

- `ruff check src tests`: **136 pre-existing errors** (`F401` unused imports,
  etc.) across `api/routes/*`, `rbac.py`, `main.py`, `demo.py`, etc.
- `mypy src`: **124 pre-existing errors** across **19 files** (e.g.
  `process_watcher.py` psutil stubs, `layer4_groq.py` no-any-return,
  `ips_signatures.py` undefined `Any`, `demo.py:583`, `main.py:102`).

These were verified to exist before this task's changes and are tracked as
baseline cleanup / a follow-up.

## Follow-ups
- macOS `NETransparentProxyProvider` and Windows WFP callout driver.
- Linux CI job exercising real iptables/systemd/eBPF attach end-to-end
  (kernel-level verification could not run on the Windows dev machine).
- Baseline lint/mypy cleanup across the ~19 unrelated files.
