"""Stdio Transparent Gateway for Model Context Protocol (MCP) servers.

Interprets and governs JSON-RPC 2.0 messages over standard I/O streams between AI agents
and MCP tool servers.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from collections.abc import Callable

from a2a_firewall.mcp.models import JSONRPCRequest, JSONRPCResponse, MCPPolicy, MCPToolCall
from a2a_firewall.mcp.policy_engine import MCPDecision, MCPPolicyEngine

logger = logging.getLogger("a2a_firewall.mcp.stdio")


class MCPStdioGateway:
    """Intercepts and enforces security policies on stdio-based MCP server subprocesses."""

    def __init__(
        self,
        server_cmd: list[str],
        policy: MCPPolicy | None = None,
        on_violation: Callable[[MCPToolCall, MCPDecision], None] | None = None,
    ):
        self.server_cmd = server_cmd
        self.policy_engine = MCPPolicyEngine(policy=policy)
        self.on_violation = on_violation
        self._proc: asyncio.subprocess.Process | None = None
        self._running = False

    async def handle_client_message(self, line: str) -> str | None:
        """Process an incoming JSON-RPC line from client.

        Returns synthetic JSON-RPC error response string if blocked,
        or None if allowed to forward to the backend process.
        """
        line_clean = line.strip()
        if not line_clean:
            return None

        try:
            req_dict = json.loads(line_clean)
        except Exception:
            # Not JSON, forward as-is
            return None

        if not isinstance(req_dict, dict) or req_dict.get("jsonrpc") != "2.0":
            return None

        req = JSONRPCRequest.from_dict(req_dict)

        # Intercept tool calls
        if req.method == "tools/call":
            params = req.params
            tool_name = params.get("name", "")
            tool_args = params.get("arguments", {})

            tool_call = MCPToolCall(name=tool_name, arguments=tool_args, rpc_id=req.id)
            decision = self.policy_engine.evaluate_tool_call(tool_call)

            if not decision.allowed:
                logger.warning(
                    f"A2A Firewall BLOCKED MCP Tool Call '{tool_name}': {decision.violation_type} ({decision.reason})"
                )
                if self.on_violation:
                    self.on_violation(tool_call, decision)

                # Return synthetic JSON-RPC error
                err_resp = JSONRPCResponse.error_response(
                    req_id=req.id,
                    code=-32000,
                    message=f"A2A Firewall Security Block: {decision.reason}",
                    data={
                        "violation_type": decision.violation_type,
                        "risk_score": decision.risk_score,
                        "details": decision.details,
                    },
                )
                return json.dumps(err_resp.to_dict())

        return None

    async def run(self) -> int:
        """Run the stdio bridge between stdin/stdout and the child MCP subprocess."""
        self._proc = await asyncio.create_subprocess_exec(
            *self.server_cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._running = True

        async def _forward_stderr() -> None:
            assert self._proc is not None and self._proc.stderr is not None
            while self._running:
                line = await self._proc.stderr.readline()
                if not line:
                    break
                sys.stderr.buffer.write(line)
                sys.stderr.buffer.flush()

        async def _forward_stdout() -> None:
            assert self._proc is not None and self._proc.stdout is not None
            while self._running:
                line = await self._proc.stdout.readline()
                if not line:
                    break
                sys.stdout.buffer.write(line)
                sys.stdout.buffer.flush()

        async def _forward_stdin() -> None:
            assert self._proc is not None and self._proc.stdin is not None
            loop = asyncio.get_running_loop()
            reader = asyncio.StreamReader()
            protocol = asyncio.StreamReaderProtocol(reader)
            await loop.connect_read_pipe(lambda: protocol, sys.stdin)

            while self._running:
                line_bytes = await reader.readline()
                if not line_bytes:
                    break

                line_str = line_bytes.decode("utf-8", errors="replace")
                blocked_response = await self.handle_client_message(line_str)

                if blocked_response is not None:
                    # Send blocked error response back to client directly
                    out_bytes = (blocked_response + "\n").encode("utf-8")
                    sys.stdout.buffer.write(out_bytes)
                    sys.stdout.buffer.flush()
                else:
                    # Forward to subprocess stdin
                    self._proc.stdin.write(line_bytes)
                    await self._proc.stdin.drain()

        stderr_task = asyncio.create_task(_forward_stderr())
        stdout_task = asyncio.create_task(_forward_stdout())
        stdin_task = asyncio.create_task(_forward_stdin())

        try:
            returncode = await self._proc.wait()
            self._running = False
            return returncode
        finally:
            self._running = False
            stderr_task.cancel()
            stdout_task.cancel()
            stdin_task.cancel()
