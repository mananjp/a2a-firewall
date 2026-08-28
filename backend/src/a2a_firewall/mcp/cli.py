"""CLI wrapper for MCP Stdio and HTTP gateways.

Usage:
    python -m a2a_firewall.mcp wrap -- npx -y @modelcontextprotocol/server-filesystem /path
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from a2a_firewall.mcp.models import MCPPolicy
from a2a_firewall.mcp.stdio_gateway import MCPStdioGateway


def main() -> None:
    parser = argparse.ArgumentParser(description="A2A Firewall MCP Gateway CLI")
    subparsers = parser.add_subparsers(dest="command")

    wrap_parser = subparsers.add_parser(
        "wrap", help="Wrap a stdio MCP server subprocess with A2A governance"
    )
    wrap_parser.add_argument(
        "--read-only", action="store_true", help="Enforce read-only mode for tools"
    )
    wrap_parser.add_argument(
        "--allowed-path", action="append", help="Allowed sandbox directory (can specify multiple)"
    )
    wrap_parser.add_argument(
        "cmd", nargs=argparse.REMAINDER, help="Target MCP server command to run"
    )

    args = parser.parse_args()

    if args.command == "wrap":
        cmd = args.cmd
        if cmd and cmd[0] == "--":
            cmd = cmd[1:]
        if not cmd:
            print("Error: No MCP command specified.", file=sys.stderr)
            sys.exit(1)

        policy = MCPPolicy(
            read_only_mode=args.read_only,
            allowed_paths=args.allowed_path or [],
        )
        gateway = MCPStdioGateway(server_cmd=cmd, policy=policy)
        code = asyncio.run(gateway.run())
        sys.exit(code)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
