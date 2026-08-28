"""CLI entrypoints and transparent process wrapper for A2A Proxy.

Commands:
- `python -m a2a_firewall.proxy start --port 8080`
- `python -m a2a_firewall.proxy daemon --port 8080`
- `python -m a2a_firewall.proxy install [--with-systemd --with-redirect --dry-run]`
- `python -m a2a_firewall.proxy uninstall [--dry-run]`
- `python -m a2a_firewall.proxy status`
- `python -m a2a_firewall.proxy run -- python my_agent.py`
- `python -m a2a_firewall.proxy ca-info`
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from collections.abc import Callable
from typing import Any

from a2a_firewall.egress_guard.ebpf_loader import EgressGuardLoader
from a2a_firewall.egress_guard.transparent_redirect import (
    TransparentRedirect,
    mark_own_socket,
    ratelimit_info,
)
from a2a_firewall.proxy.ca import CertificateAuthority
from a2a_firewall.proxy.server import A2AProxyServer


def get_default_ca() -> CertificateAuthority:
    return CertificateAuthority()


async def _inspect_callback(req: Any) -> dict[str, Any]:
    """Adapter: route a normalized request into the full detection pipeline.

    Used when A2A_INSPECT_ENABLED=1. Delegates to the orchestrator bridge when
    it can be imported; otherwise returns allow so the built-in gate remains
    authoritative. Kept as a standalone async function so it is trivially
    testable and does not hard-depend on DB/Groq.
    """
    try:
        from a2a_firewall.detection import pipeline_bridge

        return await pipeline_bridge.inspect_from_proxy(req)
    except Exception as e:  # noqa: BLE001
        logging.getLogger("a2a_firewall.proxy").warning(
            "Full inspect pipeline unavailable (%s) — allowing built-in gate", e
        )
        return {"decision": "allow", "risk_score": 0.0, "violations": []}


def _inspect_enabled() -> bool:
    return os.environ.get("A2A_INSPECT_ENABLED", "0").lower() in ("1", "true", "yes")


async def run_proxy_server(
    host: str,
    port: int,
    ca_dir: str | None = None,
    enable_egress_guard: bool = False,
    mark_socket: bool = False,
    inspect_enabled: bool = False,
    process_registry: Any = None,
) -> None:
    """Run the proxy with optional egress guard, socket marking, and inspection.

    This is the shared implementation for both the interactive ``start`` and
    the background ``daemon`` entry points. ``process_registry`` (if given) is
    used to attribute intercepted traffic to a real agent identity.
    """
    ca = CertificateAuthority(ca_dir=ca_dir)
    inspect_cb: Callable[[Any], Any] | None = _inspect_callback if inspect_enabled else None
    server = A2AProxyServer(
        host=host,
        port=port,
        ca=ca,
        inspect_callback=inspect_cb,
        process_registry=process_registry,
    )
    await server.start()
    print(f"[A2A Proxy] Running on http://{host}:{port}")
    print(f"[A2A Proxy] Root CA Certificate: {ca.root_cert_path}")
    if inspect_enabled:
        print("[A2A Proxy] Full detection pipeline: ENABLED")
    print("[A2A Proxy] Press Ctrl+C to stop.")

    guard_task: asyncio.Task[None] | None = None
    if enable_egress_guard:
        guard = EgressGuardLoader(proxy_port=port)
        guard.start()
        guard_task = asyncio.create_task(guard.watcher.run_loop(interval_seconds=1.0))
        print(
            f"[A2A Proxy] Egress guard: {'kernel eBPF' if guard.ebpf_active else 'user-space process watcher'}"
        )

    if mark_socket:
        mark_own_socket(enable=True)

    try:
        stop_event = asyncio.Event()
        await stop_event.wait()
    except (asyncio.CancelledError, KeyboardInterrupt):
        if guard_task:
            guard_task.cancel()
        await server.stop()
        print("\n[A2A Proxy] Stopped.")


async def start_proxy_main(host: str, port: int, ca_dir: str | None = None) -> None:
    """Run the proxy server until interrupted (interactive `start` command)."""
    await run_proxy_server(
        host=host,
        port=port,
        ca_dir=ca_dir,
        enable_egress_guard=False,
        mark_socket=False,
        inspect_enabled=_inspect_enabled(),
    )


async def daemon_main(host: str, port: int, ca_dir: str | None = None) -> None:
    """Run the proxy as a background daemon (systemd ExecStart target)."""
    from a2a_firewall.egress_guard.process_registry import ProcessRegistry

    registry: Any = ProcessRegistry() if _inspect_enabled() else None
    await run_proxy_server(
        host=host,
        port=port,
        ca_dir=ca_dir,
        enable_egress_guard=True,
        mark_socket=True,
        inspect_enabled=_inspect_enabled(),
        process_registry=registry,
    )


def run_with_proxy(
    cmd: list[str],
    proxy_host: str = "127.0.0.1",
    proxy_port: int = 8080,
    ca_dir: str | None = None,
) -> int:
    """Start background proxy and execute child command with proxy env vars."""
    ca = CertificateAuthority(ca_dir=ca_dir)
    ca_cert_path = ca.root_cert_path

    env = dict(os.environ)
    proxy_url = f"http://{proxy_host}:{proxy_port}"

    # Set proxy variables for Python, Node.js, Go, Rust, curl
    env["HTTP_PROXY"] = proxy_url
    env["HTTPS_PROXY"] = proxy_url
    env["http_proxy"] = proxy_url
    env["https_proxy"] = proxy_url
    env["SSL_CERT_FILE"] = ca_cert_path
    env["REQUESTS_CA_BUNDLE"] = ca_cert_path
    env["CURL_CA_BUNDLE"] = ca_cert_path
    env["NODE_EXTRA_CA_CERTS"] = ca_cert_path

    print(f"[A2A Proxy] Launching governed command: {' '.join(cmd)}")
    print(f"[A2A Proxy] Injected HTTPS_PROXY={proxy_url} and SSL_CERT_FILE={ca_cert_path}")

    # Start proxy in background thread/process or loop
    async def _run_all() -> int:
        server = A2AProxyServer(host=proxy_host, port=proxy_port, ca=ca)
        await server.start()

        # Run child process
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            env=env,
        )
        returncode = await proc.wait()
        await server.stop()
        return returncode

    return asyncio.run(_run_all())


def _run_installer_dry_run(flag: bool) -> bool:
    return flag or os.environ.get("A2A_DEFAULT_DRY_RUN", "1").lower() in ("1", "true", "yes")


def main() -> None:
    parser = argparse.ArgumentParser(description="A2A Firewall Transparent Proxy CLI")
    subparsers = parser.add_subparsers(dest="command")

    # `start` command
    start_parser = subparsers.add_parser("start", help="Start the transparent proxy server")
    start_parser.add_argument("--host", default="127.0.0.1", help="Host address to bind")
    start_parser.add_argument("--port", type=int, default=8080, help="Port to bind")
    start_parser.add_argument("--ca-dir", default=None, help="Directory to store CA cert and key")

    # `daemon` command (background service target)
    daemon_parser = subparsers.add_parser("daemon", help="Run proxy as background daemon")
    daemon_parser.add_argument("--host", default="127.0.0.1", help="Host address to bind")
    daemon_parser.add_argument("--port", type=int, default=8080, help="Port to bind")
    daemon_parser.add_argument("--ca-dir", default=None, help="Directory to store CA cert and key")

    # `install` / `uninstall` / `status` commands
    install_parser = subparsers.add_parser(
        "install", help="Install as system-wide service (systemd + redirect + CA trust)"
    )
    install_parser.add_argument(
        "--port", type=int, default=8080, help="Proxy port for redirect rules"
    )
    install_parser.add_argument(
        "--ca-dir", default=None, help="CA directory to install to the system trust store"
    )
    install_parser.add_argument(
        "--no-systemd", action="store_true", help="Skip systemd unit install"
    )
    install_parser.add_argument(
        "--no-redirect", action="store_true", help="Skip iptables REDIRECT rules"
    )
    install_parser.add_argument(
        "--no-trust", action="store_true", help="Skip OS CA trust installation"
    )
    install_parser.add_argument(
        "--no-dry-run", action="store_true", help="Actually apply changes (requires root / Linux)"
    )

    uninstall_parser = subparsers.add_parser(
        "uninstall", help="Remove the system-wide service install"
    )
    uninstall_parser.add_argument(
        "--port", type=int, default=8080, help="Proxy port the redirect rules target"
    )
    uninstall_parser.add_argument(
        "--ca-dir", default=None, help="CA directory that was trusted system-wide"
    )
    uninstall_parser.add_argument(
        "--no-dry-run", action="store_true", help="Actually apply changes"
    )

    subparsers.add_parser("status", help="Report install / redirect / trust state")

    # `run` command
    run_parser = subparsers.add_parser("run", help="Run a command governed through A2A Proxy")
    run_parser.add_argument("--host", default="127.0.0.1", help="Proxy host")
    run_parser.add_argument("--port", type=int, default=8080, help="Proxy port")
    run_parser.add_argument("--ca-dir", default=None, help="CA directory")
    run_parser.add_argument("cmd", nargs=argparse.REMAINDER, help="Command to execute")

    # `ca-info` command
    subparsers.add_parser("ca-info", help="Display Root CA certificate path and details")

    args = parser.parse_args()

    if args.command == "start":
        asyncio.run(start_proxy_main(host=args.host, port=args.port, ca_dir=args.ca_dir))
    elif args.command == "daemon":
        asyncio.run(daemon_main(host=args.host, port=args.port, ca_dir=args.ca_dir))
    elif args.command == "install":
        _cmd_install(args)
    elif args.command == "uninstall":
        _cmd_uninstall(args)
    elif args.command == "status":
        _cmd_status()
    elif args.command == "run":
        cmd = args.cmd
        if cmd and cmd[0] == "--":
            cmd = cmd[1:]
        if not cmd:
            print("Error: No command specified to run.")
            sys.exit(1)
        exit_code = run_with_proxy(
            cmd, proxy_host=args.host, proxy_port=args.port, ca_dir=args.ca_dir
        )
        sys.exit(exit_code)
    elif args.command == "ca-info":
        ca = get_default_ca()
        print(f"A2A Local Root CA Certificate: {ca.root_cert_path}")
        print(f"A2A Local Root CA Private Key: {ca.ca_key_path}")
    else:
        parser.print_help()


def _cmd_install(args: argparse.Namespace) -> None:
    """Handle the `install` subcommand."""
    dry_run = _run_installer_dry_run(not args.no_dry_run)
    results: dict[str, object] = {}

    from a2a_firewall.proxy.trust import Capability, HostTrust
    from a2a_firewall.service.unit import SystemdUnit

    if not args.no_trust:
        cap = Capability(sys_name=os.name if not dry_run else "POSIX", proc_libc_ver="0")
        trust = HostTrust(capability=cap, ca_dir=args.ca_dir, dry_run=dry_run)
        results["ca_trust"] = trust.install_to_system()

    unit = SystemdUnit()
    results["unit"] = unit.render()

    if not args.no_redirect:
        from a2a_firewall.core.config import settings

        uid_owner: int | None = settings.A2A_AGENT_UID
        redirect = TransparentRedirect(proxy_port=args.port, dry_run=dry_run, uid_owner=uid_owner)
        results["redirect_rules"] = redirect.apply_rules()
        results["redirect_uid_owner"] = uid_owner

    print(json.dumps(results, indent=2, default=str))
    if dry_run:
        print("\n[dry-run] No changes applied. Re-run with --no-dry-run to install.")


def _cmd_uninstall(args: argparse.Namespace) -> None:
    """Handle the `uninstall` subcommand (mirror of `install`'s side effects)."""
    dry_run = _run_installer_dry_run(not args.no_dry_run)
    results: dict[str, object] = {}
    redirect = TransparentRedirect(proxy_port=args.port, dry_run=dry_run)
    results["redirect_rules_removed"] = redirect.remove_rules()

    # Reverse the CA trust that `install` applied — never leave the A2A root
    # CA in the OS trust store after uninstall.
    from a2a_firewall.proxy.trust import Capability, HostTrust

    cap = Capability(sys_name=os.name if not dry_run else "POSIX", proc_libc_ver="0")
    trust = HostTrust(capability=cap, ca_dir=args.ca_dir, dry_run=dry_run)
    results["ca_trust_removed"] = trust.remove_from_system()

    print(json.dumps(results, indent=2, default=str))
    if dry_run:
        print("\n[dry-run] No changes applied. Re-run with --no-dry-run to uninstall.")


def _cmd_status() -> None:
    """Handle the `status` subcommand."""
    from a2a_firewall.core.config import settings

    status: dict[str, object] = {
        "supported": TransparentRedirect.is_supported(),
        "agent_uid": settings.A2A_AGENT_UID,
    }
    status["redirect"] = ratelimit_info(uid_owner=settings.A2A_AGENT_UID)
    status["ca_trust"] = {
        "cert_path": CertificateAuthority().root_cert_path,
        "trust_dir": "/usr/local/share/ca-certificates",
    }
    print(json.dumps(status, indent=2, default=str))


if __name__ == "__main__":
    main()
