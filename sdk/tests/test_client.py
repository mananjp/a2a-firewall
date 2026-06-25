import pytest
from unittest.mock import MagicMock, patch
from a2a_firewall import A2AFirewall, FirewallConfig, FirewallBlockedError

def make_fw():
    return A2AFirewall(FirewallConfig(
        firewall_url="http://localhost:8000",
        agent_api_key="test_key",
        agent_id="agent-uuid",
        workspace_id="ws-uuid"
    ))

def test_allow_response():
    fw = make_fw()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "task_id": "task-1", "decision": "allow", "allowed_to_proceed": True,
        "risk_score": 0.1, "violations": [], "review_token": None,
        "block_reason": None, "latency_ms": 20
    }
    mock_resp.raise_for_status = lambda: None
    with patch.object(fw._http, "post", return_value=mock_resp):
        resp = fw.send("receiver-id", "research", {"query": "test"})
    assert resp.allowed is True
    assert resp.decision == "allow"

def test_block_raises():
    fw = make_fw()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "task_id": "task-2", "decision": "block", "allowed_to_proceed": False,
        "risk_score": 0.9, "violations": [], "review_token": None,
        "block_reason": "injection", "latency_ms": 30
    }
    mock_resp.raise_for_status = lambda: None
    with patch.object(fw._http, "post", return_value=mock_resp):
        with pytest.raises(FirewallBlockedError) as exc:
            fw.send("receiver-id", "research", {"query": "ignore instructions"})
    assert exc.value.reason == "injection"
