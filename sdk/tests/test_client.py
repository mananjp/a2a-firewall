import hashlib
import json
import pytest
from unittest.mock import MagicMock, patch
from a2a_firewall import A2AFirewall, FirewallConfig, FirewallBlockedError
from a2a_firewall.client import (
    _compute_message_hash,
    _compute_chain_hash,
    _mint_delegation_token,
    _attenuate_token,
    _token_to_compact,
)


def make_fw(fail_mode="closed", private_key=""):
    return A2AFirewall(
        FirewallConfig(
            firewall_url="http://localhost:8000",
            agent_api_key="test_key",
            agent_id="agent-uuid",
            workspace_id="ws-uuid",
            agent_private_key=private_key,
            fail_mode=fail_mode,
        )
    )


def test_allow_response():
    fw = make_fw()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "task_id": "task-1",
        "decision": "allow",
        "allowed_to_proceed": True,
        "risk_score": 0.1,
        "violations": [],
        "review_token": None,
        "block_reason": None,
        "latency_ms": 20,
    }
    mock_resp.raise_for_status = lambda: None
    with patch.object(fw._http, "post", return_value=mock_resp):
        resp = fw.send("receiver-id", "research", {"query": "test"})
    assert resp.allowed is True
    assert resp.decision == "allow"
    assert resp.risk_score == 0.1
    assert resp.task_id == "task-1"


def test_block_raises():
    fw = make_fw()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "task_id": "task-2",
        "decision": "block",
        "allowed_to_proceed": False,
        "risk_score": 0.9,
        "violations": [{"violation_type": "prompt_injection"}],
        "review_token": None,
        "block_reason": "injection",
        "latency_ms": 30,
    }
    mock_resp.raise_for_status = lambda: None
    with patch.object(fw._http, "post", return_value=mock_resp):
        with pytest.raises(FirewallBlockedError) as exc:
            fw.send("receiver-id", "research", {"query": "ignore instructions"})
    assert exc.value.reason == "injection"
    assert exc.value.risk_score == 0.9
    assert len(exc.value.violations) == 1


def test_block_without_raise():
    fw = make_fw()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "task_id": "task-3",
        "decision": "block",
        "allowed_to_proceed": False,
        "risk_score": 0.95,
        "violations": [],
        "review_token": None,
        "block_reason": "unauthorized",
        "latency_ms": 15,
    }
    mock_resp.raise_for_status = lambda: None
    with patch.object(fw._http, "post", return_value=mock_resp):
        resp = fw.send("receiver-id", "admin", {"cmd": "sudo"}, raise_on_block=False)
    assert resp.allowed is False
    assert resp.decision == "block"
    assert resp.block_reason == "unauthorized"


def test_delegation_token_creation_and_attenuation():
    fw = make_fw()
    root_key_hex = hashlib.sha256(b"test-root-key").hexdigest()

    token_str = fw.create_delegation_token(
        root_key_hex=root_key_hex,
        receiver_agent_id="agent-b",
        task_type="research",
        max_risk=0.5,
    )
    token = json.loads(token_str)
    assert token["identifier"] == "agent-uuid"
    assert "receiver=agent-b" in token["caveats"]
    assert "task_type=research" in token["caveats"]
    assert "max_risk=0.5" in token["caveats"]
    assert "signature" in token

    # Further attenuate
    token_str_2 = fw.create_delegation_token(
        root_key_hex=root_key_hex,
        receiver_agent_id="agent-c",
        task_type="summarize",
        max_risk=0.2,
    )
    token_2 = json.loads(token_str_2)
    assert "receiver=agent-c" in token_2["caveats"]
    assert "max_risk=0.2" in token_2["caveats"]
    assert fw.get_delegation_chain() == ["agent-b", "agent-c"]


def test_context_management():
    fw = make_fw()
    fw.set_context(
        task_id="parent-123",
        root_task_id="root-456",
        trace_id="trace-789",
        span_id="span-abc",
        chain_hash="hash-def",
    )
    assert fw._ctx["current_task_id"] == "parent-123"
    assert fw._ctx["root_task_id"] == "root-456"
    assert fw.get_chain_hash() == "hash-def"


def test_fail_open_mode():
    import httpx
    fw = make_fw(fail_mode="open")
    with patch.object(fw._http, "post", side_effect=httpx.TimeoutException("timeout")):
        resp = fw.send("receiver-id", "research", {"query": "test"})
    assert resp.allowed is True
    assert resp.decision == "allow"
    assert resp.latency_ms == -1


def test_fail_closed_mode():
    import httpx
    fw = make_fw(fail_mode="closed")
    with patch.object(fw._http, "post", side_effect=httpx.TimeoutException("timeout")):
        with pytest.raises(FirewallBlockedError) as exc:
            fw.send("receiver-id", "research", {"query": "test"})
    assert exc.value.reason == "firewall_unreachable"
