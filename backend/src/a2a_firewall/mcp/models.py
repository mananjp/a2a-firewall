"""Data models for Model Context Protocol (MCP) JSON-RPC and tool governance policies."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class JSONRPCRequest:
    """JSON-RPC 2.0 Request structure."""

    method: str
    id: Any = None
    params: dict[str, Any] = field(default_factory=dict)
    jsonrpc: str = "2.0"

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> JSONRPCRequest:
        return cls(
            jsonrpc=data.get("jsonrpc", "2.0"),
            id=data.get("id"),
            method=data.get("method", ""),
            params=data.get("params", {}) or {},
        )

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"jsonrpc": self.jsonrpc, "method": self.method}
        if self.id is not None:
            d["id"] = self.id
        if self.params:
            d["params"] = self.params
        return d


@dataclass
class JSONRPCResponse:
    """JSON-RPC 2.0 Response structure."""

    id: Any = None
    result: Any = None
    error: dict[str, Any] | None = None
    jsonrpc: str = "2.0"

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"jsonrpc": self.jsonrpc, "id": self.id}
        if self.error is not None:
            d["error"] = self.error
        else:
            d["result"] = self.result
        return d

    @classmethod
    def error_response(cls, req_id: Any, code: int, message: str, data: Any = None) -> JSONRPCResponse:
        err_obj: dict[str, Any] = {"code": code, "message": message}
        if data is not None:
            err_obj["data"] = data
        return cls(id=req_id, error=err_obj)


@dataclass
class MCPToolCall:
    """Parsed MCP tools/call request."""

    name: str
    arguments: dict[str, Any]
    rpc_id: Any = None


@dataclass
class MCPPolicy:
    """Security governance policy for MCP tool and resource execution."""

    allowed_tools: list[str] | None = None  # None = allow all by default
    blocked_tools: list[str] = field(
        default_factory=lambda: [
            "execute_raw_bash",
            "eval_python_code",
            "format_hard_drive",
            "modify_system_credentials",
        ]
    )
    allowed_paths: list[str] = field(default_factory=list)  # Sandbox directories for file tools
    blocked_commands_regex: list[str] = field(
        default_factory=lambda: [
            r"\brm\s+-rf\b",
            r"\bcurl\b.*\|\s*(ba)?sh",
            r"\bwget\b.*\|\s*(ba)?sh",
            r"\bnc\s+-[e|c]\b",
            r"\bmkfifo\b",
            r"\b(chmod\s+777|chown\s+root)\b",
            r"\bcat\s+/etc/(shadow|passwd|sudoers)\b",
            r"\b(DROP\s+DATABASE|TRUNCATE\s+TABLE)\b",
        ]
    )
    read_only_mode: bool = False
    scan_arguments_for_attacks: bool = True
