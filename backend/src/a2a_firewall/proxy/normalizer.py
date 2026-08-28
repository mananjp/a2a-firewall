"""AI Protocol Normalizer for A2A Transparent Proxy.

Converts various AI API protocol requests (OpenAI ChatCompletions, Anthropic Messages,
Model Context Protocol JSON-RPC, generic REST) into the normalized schema expected
by the 5-layer detection engine.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class NormalizedAIRequest:
    """Standardized representation of an intercepted AI request."""

    task_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    task_type: str = "llm_inference"
    resource_type: str | None = None
    resource_id: str | None = None
    action: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    extracted_text: str = ""
    protocol: str = "generic_http"
    model: str | None = None
    is_streaming: bool = False
    host: str | None = None

    def to_orchestrator_dict(
        self,
        sender_id: str,
        receiver_id: str | None = None,
        trace_id: str | None = None,
    ) -> dict[str, Any]:
        """Convert to the request dictionary expected by orchestrator.run_inspection()."""
        return {
            "task_id": self.task_id,
            "sender_id": sender_id,
            "receiver_agent_id": receiver_id or sender_id,
            "task_type": self.task_type,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "action": self.action,
            "payload": self.payload,
            "schema_version": "v1",
            "trace_id": trace_id or uuid.uuid4().hex,
        }


class AIRequestNormalizer:
    """Detects protocol and normalizes incoming HTTP requests."""

    @classmethod
    def normalize(
        cls,
        method: str,
        path: str,
        headers: dict[str, str],
        body_bytes: bytes,
    ) -> NormalizedAIRequest:
        """Parse raw HTTP request into NormalizedAIRequest."""
        if not body_bytes:
            return NormalizedAIRequest(
                task_type="http_request",
                extracted_text=path,
                payload={"path": path, "method": method},
                protocol="generic_http",
            )

        # Try to parse JSON body
        try:
            body_json = json.loads(body_bytes.decode("utf-8", errors="replace"))
        except Exception:
            # Non-JSON payload
            text_preview = body_bytes[:4096].decode("utf-8", errors="replace")
            return NormalizedAIRequest(
                task_type="raw_bytes",
                extracted_text=text_preview,
                payload={"raw_content": text_preview, "size": len(body_bytes)},
                protocol="raw_http",
            )

        # 1. Detect Model Context Protocol (MCP) JSON-RPC
        if isinstance(body_json, dict) and body_json.get("jsonrpc") == "2.0":
            return cls._normalize_mcp(body_json, path)

        # 2. Detect Anthropic Messages format (claude model or anthropic path/system string)
        if isinstance(body_json, dict) and (
            "anthropic" in path
            or "claude" in str(body_json.get("model", "")).lower()
            or ("messages" in body_json and isinstance(body_json.get("system"), str))
        ):
            return cls._normalize_anthropic(body_json, path)

        # 3. Detect OpenAI Chat Completions format
        if isinstance(body_json, dict) and "messages" in body_json:
            return cls._normalize_openai(body_json, path)

        # 4. Fallback Generic JSON REST
        return cls._normalize_generic_json(body_json, path, method)

    @classmethod
    def _normalize_openai(cls, body: dict[str, Any], path: str) -> NormalizedAIRequest:
        """Normalize OpenAI Chat Completions payload."""
        messages = body.get("messages", [])
        model = body.get("model", "unknown-model")
        is_stream = bool(body.get("stream", False))

        text_parts: list[str] = []
        system_prompts: list[str] = []
        user_queries: list[str] = []

        for msg in messages:
            if not isinstance(msg, dict):
                continue
            role = msg.get("role", "")
            content = msg.get("content", "")

            # Content can be string or list of content parts
            if isinstance(content, list):
                extracted = []
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        extracted.append(part.get("text", ""))
                content_str = " ".join(extracted)
            else:
                content_str = str(content)

            if role == "system":
                system_prompts.append(content_str)
            elif role == "user":
                user_queries.append(content_str)
            text_parts.append(f"[{role}]: {content_str}")

        extracted_text = "\n".join(text_parts)
        query = user_queries[-1] if user_queries else (extracted_text or "")

        payload = {
            "query": query,
            "model": model,
            "system_prompt": "\n".join(system_prompts),
            "messages": messages,
            "tools": body.get("tools", []),
            "stream": is_stream,
            "raw_protocol": "openai",
        }

        return NormalizedAIRequest(
            task_type="llm_inference",
            resource_type="llm_model",
            resource_id=model,
            action="chat_completion",
            payload=payload,
            extracted_text=extracted_text,
            protocol="openai",
            model=model,
            is_streaming=is_stream,
        )

    @classmethod
    def _normalize_anthropic(cls, body: dict[str, Any], path: str) -> NormalizedAIRequest:
        """Normalize Anthropic Messages payload."""
        messages = body.get("messages", [])
        model = body.get("model", "claude-unknown")
        system_prompt = body.get("system", "")
        is_stream = bool(body.get("stream", False))

        text_parts: list[str] = []
        if system_prompt:
            text_parts.append(f"[system]: {system_prompt}")

        user_queries: list[str] = []
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            role = msg.get("role", "")
            content = msg.get("content", "")
            if isinstance(content, list):
                extracted = [
                    p.get("text", "")
                    for p in content
                    if isinstance(p, dict) and p.get("type") == "text"
                ]
                content_str = " ".join(extracted)
            else:
                content_str = str(content)

            if role == "user":
                user_queries.append(content_str)
            text_parts.append(f"[{role}]: {content_str}")

        extracted_text = "\n".join(text_parts)
        query = user_queries[-1] if user_queries else (extracted_text or "")

        payload = {
            "query": query,
            "model": model,
            "system_prompt": system_prompt,
            "messages": messages,
            "tools": body.get("tools", []),
            "stream": is_stream,
            "raw_protocol": "anthropic",
        }

        return NormalizedAIRequest(
            task_type="llm_inference",
            resource_type="llm_model",
            resource_id=model,
            action="messages",
            payload=payload,
            extracted_text=extracted_text,
            protocol="anthropic",
            model=model,
            is_streaming=is_stream,
        )

    @classmethod
    def _normalize_mcp(cls, body: dict[str, Any], path: str) -> NormalizedAIRequest:
        """Normalize Model Context Protocol (MCP) JSON-RPC request."""
        method = body.get("method", "")
        params = body.get("params", {})
        rpc_id = body.get("id")

        if method == "tools/call":
            tool_name = params.get("name", "unknown_tool")
            tool_args = params.get("arguments", {})
            args_str = json.dumps(tool_args)

            return NormalizedAIRequest(
                task_type="tool_execution",
                resource_type="mcp_tool",
                resource_id=tool_name,
                action="call",
                payload={
                    "tool": tool_name,
                    "arguments": tool_args,
                    "query": f"Execute tool {tool_name} with arguments: {args_str}",
                    "rpc_id": rpc_id,
                    "raw_protocol": "mcp",
                },
                extracted_text=f"MCP Tool Call: {tool_name} args={args_str}",
                protocol="mcp",
            )
        elif method == "resources/read":
            uri = params.get("uri", "")
            return NormalizedAIRequest(
                task_type="resource_access",
                resource_type="mcp_resource",
                resource_id=uri,
                action="read",
                payload={"uri": uri, "query": f"Read resource {uri}", "rpc_id": rpc_id},
                extracted_text=f"MCP Resource Read: {uri}",
                protocol="mcp",
            )
        else:
            return NormalizedAIRequest(
                task_type="mcp_rpc",
                resource_type="mcp_method",
                resource_id=method,
                action="rpc",
                payload={
                    "method": method,
                    "params": params,
                    "rpc_id": rpc_id,
                    "query": json.dumps(params),
                },
                extracted_text=f"MCP JSON-RPC method: {method}",
                protocol="mcp",
            )

    @classmethod
    def _normalize_generic_json(
        cls, body: dict[str, Any] | list[Any], path: str, method: str
    ) -> NormalizedAIRequest:
        """Normalize arbitrary JSON REST API payload."""
        body_str = json.dumps(body)
        query = ""
        if isinstance(body, dict):
            # Extract common prompt/query fields if present
            query = (
                body.get("query")
                or body.get("prompt")
                or body.get("input")
                or body.get("text")
                or body_str
            )
        else:
            query = body_str

        return NormalizedAIRequest(
            task_type="api_request",
            resource_type="api_endpoint",
            resource_id=path,
            action=method.lower(),
            payload={"data": body, "query": str(query), "raw_protocol": "rest_json"},
            extracted_text=str(query),
            protocol="generic_json",
        )
