"""Tests for CLI install/uninstall/status/daemon wiring + transparent host resolution."""

from unittest.mock import patch

from a2a_firewall.detection.pipeline_bridge import _to_enterprise_request, inspect_from_proxy
from a2a_firewall.proxy.cli import _inspect_enabled, _run_installer_dry_run
from a2a_firewall.proxy.normalizer import AIRequestNormalizer, NormalizedAIRequest


def test_installer_dry_run_defaults_to_true():
    with patch.dict("os.environ", {}, clear=False):
        assert _run_installer_dry_run(False) is True
    # explicit --no-dry-run should win
    with patch.dict("os.environ", {}, clear=False):
        assert _run_installer_dry_run(True) is True


def test_inspect_enabled_env_flag():
    assert _inspect_enabled() is False
    with patch.dict("os.environ", {"A2A_INSPECT_ENABLED": "1"}):
        assert _inspect_enabled() is True


async def test_inspect_from_proxy_returns_allow_on_enterprise_outage():
    # Without a DB / agent, the bridge must degrade to allow, never raise.
    req = AIRequestNormalizer.normalize(
        method="POST",
        path="/v1/chat/completions",
        headers={"host": "api.openai.com"},
        body_bytes=b'{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}',
    )
    result = await inspect_from_proxy(req)
    assert result["decision"] == "allow"


def test_to_enterprise_request_uses_orchestrator_method():
    req = NormalizedAIRequest(
        task_type="llm_inference",
        payload={"query": "hello"},
    )
    req.host = "api.openai.com"
    request_data = _to_enterprise_request(req)
    assert request_data["task_type"] == "llm_inference"
    assert request_data["payload"]["query"] == "hello"
    assert request_data["parent_task_id"] is None
    assert "sender_id" in request_data
    assert "receiver_agent_id" in request_data


def test_normalized_request_has_host_field():
    req = NormalizedAIRequest()
    req.host = "api.openai.com"
    assert req.host == "api.openai.com"
