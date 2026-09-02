"""HTTP and SSE Gateway for remote Model Context Protocol (MCP) servers."""

from __future__ import annotations

from typing import Any, cast

import httpx

from a2a_firewall.mcp.models import JSONRPCRequest, JSONRPCResponse, MCPPolicy, MCPToolCall
from a2a_firewall.mcp.policy_engine import MCPPolicyEngine


class MCPHTTPGateway:
    """HTTP/SSE Endpoint Gateway for Model Context Protocol governance."""

    def __init__(self, policy: MCPPolicy | None = None):
        self.policy_engine = MCPPolicyEngine(policy=policy)

    async def handle_jsonrpc_payload(
        self,
        payload: dict[str, Any],
        upstream_url: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Inspect and forward or block an incoming MCP JSON-RPC message."""
        if payload.get("jsonrpc") != "2.0":
            return JSONRPCResponse.error_response(
                req_id=payload.get("id"),
                code=-32600,
                message="Invalid Request: jsonrpc must be '2.0'",
            ).to_dict()

        req = JSONRPCRequest.from_dict(payload)

        # Inspect tools/call
        if req.method == "tools/call":
            params = req.params
            tool_name = params.get("name", "")
            tool_args = params.get("arguments", {})

            tool_call = MCPToolCall(name=tool_name, arguments=tool_args, rpc_id=req.id)
            decision = self.policy_engine.evaluate_tool_call(tool_call)

            if not decision.allowed:
                return JSONRPCResponse.error_response(
                    req_id=req.id,
                    code=-32000,
                    message=f"A2A Firewall Security Block: {decision.reason}",
                    data={
                        "violation_type": decision.violation_type,
                        "risk_score": decision.risk_score,
                        "details": decision.details,
                    },
                ).to_dict()

        # If clean and upstream URL provided, forward to real server
        if upstream_url:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    upstream_url,
                    json=payload,
                    headers={k: v for k, v in (headers or {}).items() if k.lower() != "host"},
                )
                # ---- Response inspection: tool result returning to the agent ----
                from a2a_firewall.proxy.response_scanner import scan_response_body

                response_decision = scan_response_body(resp.content)
                if response_decision.get("decision") == "block":
                    return JSONRPCResponse.error_response(
                        req_id=req.id,
                        code=-32001,
                        message="A2A Firewall Security Block: tool result failed response inspection",
                        data=response_decision.get("findings", {}),
                    ).to_dict()
                return cast("dict[str, Any]", resp.json())

        # Clean standalone pass
        return JSONRPCResponse(
            id=req.id,
            result={"status": "governance_passed", "tool": req.params.get("name")},
        ).to_dict()
