"""Unit tests for AIRequestNormalizer across OpenAI, Anthropic, MCP, and REST protocols."""

import json

from a2a_firewall.proxy.normalizer import AIRequestNormalizer


def test_normalize_openai_chat():
    """Verify OpenAI chat completions payload parsing."""
    body = {
        "model": "gpt-4o",
        "messages": [
            {"role": "system", "content": "You are a financial advisor."},
            {"role": "user", "content": "Analyze portfolio risk."},
        ],
        "temperature": 0.7,
    }
    body_bytes = json.dumps(body).encode("utf-8")

    normalized = AIRequestNormalizer.normalize(
        method="POST",
        path="/v1/chat/completions",
        headers={"content-type": "application/json", "host": "api.openai.com"},
        body_bytes=body_bytes,
    )

    assert normalized.protocol == "openai"
    assert normalized.model == "gpt-4o"
    assert normalized.task_type == "llm_inference"
    assert "Analyze portfolio risk." in normalized.payload["query"]
    assert "financial advisor" in normalized.payload["system_prompt"]


def test_normalize_anthropic_messages():
    """Verify Anthropic messages payload parsing."""
    body = {
        "model": "claude-3-5-sonnet",
        "system": "Strict security policy.",
        "messages": [{"role": "user", "content": "Check database query."}],
    }
    body_bytes = json.dumps(body).encode("utf-8")

    normalized = AIRequestNormalizer.normalize(
        method="POST",
        path="/v1/messages",
        headers={"content-type": "application/json", "host": "api.anthropic.com"},
        body_bytes=body_bytes,
    )

    assert normalized.protocol == "anthropic"
    assert normalized.model == "claude-3-5-sonnet"
    assert "Check database query." in normalized.payload["query"]
    assert normalized.payload["system_prompt"] == "Strict security policy."


def test_normalize_mcp_tool_call():
    """Verify Model Context Protocol (MCP) JSON-RPC tools/call parsing."""
    body = {
        "jsonrpc": "2.0",
        "id": 42,
        "method": "tools/call",
        "params": {
            "name": "execute_query",
            "arguments": {"sql": "SELECT * FROM users WHERE active=1"},
        },
    }
    body_bytes = json.dumps(body).encode("utf-8")

    normalized = AIRequestNormalizer.normalize(
        method="POST",
        path="/mcp/jsonrpc",
        headers={"content-type": "application/json"},
        body_bytes=body_bytes,
    )

    assert normalized.protocol == "mcp"
    assert normalized.task_type == "tool_execution"
    assert normalized.resource_id == "execute_query"
    assert normalized.payload["tool"] == "execute_query"
    assert "SELECT * FROM users" in normalized.payload["query"]


def test_normalize_generic_json():
    """Verify generic REST JSON fallback parsing."""
    body = {"prompt": "Summarize this article.", "max_tokens": 100}
    body_bytes = json.dumps(body).encode("utf-8")

    normalized = AIRequestNormalizer.normalize(
        method="POST",
        path="/api/custom/agent",
        headers={"content-type": "application/json"},
        body_bytes=body_bytes,
    )

    assert normalized.protocol == "generic_json"
    assert "Summarize this article." in normalized.extracted_text
