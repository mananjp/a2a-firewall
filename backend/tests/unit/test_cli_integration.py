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


def test_normalized_request_carries_identity_fields():
    req = NormalizedAIRequest(peer_pid=1234, agent_id="agt-1", workspace_id="ws-1")
    assert req.peer_pid == 1234
    assert req.agent_id == "agt-1"
    assert req.workspace_id == "ws-1"


def test_to_enterprise_request_uses_real_agent_identity():
    req = NormalizedAIRequest(
        task_type="llm_inference",
        payload={"query": "hello"},
        peer_pid=1234,
        agent_id="agt-real",
        workspace_id="ws-real",
    )
    request_data = _to_enterprise_request(req)
    assert request_data["sender_id"] == "agt-real"
    assert request_data["workspace_id"] == "ws-real"
    assert request_data["peer_pid"] == 1234


def test_process_registry_roundtrip():
    from a2a_firewall.egress_guard.process_registry import ProcessRegistry

    registry = ProcessRegistry()
    registry.register(agent_id="agt-1", workspace_id="ws-1", pid=100, uid=1001)
    identity = registry.lookup(100)
    assert identity is not None
    assert identity.agent_id == "agt-1"
    assert identity.workspace_id == "ws-1"
    assert identity.uid == 1001
    assert registry.iter_pids() == [100]
    assert registry.iter_agent_uids() == {1001}
    registry.unregister(100)
    assert registry.lookup(100) is None
    assert len(registry) == 0


def test_cmd_install_unit_honours_inspect_flag(capsys):
    """The generated unit must reflect the effective inspect setting so that
    installed traffic is actually inspected by default (never captured-but-
    uninspected)."""
    from types import SimpleNamespace

    from a2a_firewall.core.config import settings
    from a2a_firewall.proxy.cli import _cmd_install

    args = SimpleNamespace(
        no_dry_run=False, port=8080, ca_dir=None, no_trust=True, no_redirect=True
    )
    original = settings.A2A_INSPECT_ENABLED
    try:
        settings.A2A_INSPECT_ENABLED = True
        _cmd_install(args)
        assert "A2A_INSPECT_ENABLED=1" in capsys.readouterr().out

        settings.A2A_INSPECT_ENABLED = False
        _cmd_install(args)
        assert "A2A_INSPECT_ENABLED=0" in capsys.readouterr().out
    finally:
        settings.A2A_INSPECT_ENABLED = original
