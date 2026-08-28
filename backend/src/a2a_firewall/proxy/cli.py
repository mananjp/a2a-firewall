"""CLI entrypoints and transparent process wrapper for A2A Proxy.

Commands:
- `python -m a2a_firewall.proxy start --port 8080`
- `python -m a2a_firewall.proxy run -- python my_agent.py`
- `python -m a2a_firewall.proxy ca-info`
"""

from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import sys
from pathlib import Path

from a2a_firewall.proxy.ca import CertificateAuthority
from a2a_firewall.proxy.server import A2AProxyServer


def get_default_ca() -> CertificateAuthority:
    return CertificateAuthority()


async def start_proxy_main(host: str, port: int, ca_dir: str | None = None) -> None:
    """Run the proxy server until interrupted."""
    ca = CertificateAuthority(ca_dir=ca_dir)
    server = A2AProxyServer(host=host, port=port, ca=ca)
    await server.start()
    print(f"[A2A Proxy] Running on http://{host}:{port}")
    print(f"[A2A Proxy] Root CA Certificate: {ca.root_cert_path}")
    print("[A2A Proxy] Press Ctrl+C to stop.")

    try:
        while True:
            await asyncio.sleep(3600)
    except (asyncio.CancelledError, KeyboardInterrupt):
        await server.stop()
        print("\n[A2A Proxy] Stopped.")


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


def main() -> None:
    parser = argparse.ArgumentParser(description="A2A Firewall Transparent Proxy CLI")
    subparsers = parser.add_subparsers(dest="command")

    # `start` command
    start_parser = subparsers.add_parser("start", help="Start the transparent proxy server")
    start_parser.add_argument("--host", default="127.0.0.1", help="Host address to bind")
    start_parser.add_argument("--port", type=int, default=8080, help="Port to bind")
    start_parser.add_argument("--ca-dir", default=None, help="Directory to store CA cert and key")

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
    elif args.command == "run":
        cmd = args.cmd
        if cmd and cmd[0] == "--":
            cmd = cmd[1:]
        if not cmd:
            print("Error: No command specified to run.")
            sys.exit(1)
        exit_code = run_with_proxy(cmd, proxy_host=args.host, proxy_port=args.port, ca_dir=args.ca_dir)
        sys.exit(exit_code)
    elif args.command == "ca-info":
        ca = get_default_ca()
        print(f"A2A Local Root CA Certificate: {ca.root_cert_path}")
        print(f"A2A Local Root CA Private Key: {ca.ca_key_path}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
