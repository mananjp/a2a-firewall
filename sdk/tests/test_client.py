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


def test_proxy_auto_detection(monkeypatch):
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:8080")
    fw = make_fw()
    assert fw.proxy_detected is True
    assert fw._proxy_url == "http://127.0.0.1:8080"


def test_proxy_not_detected_when_no_env(monkeypatch):
    for key in ("A2A_PROXY_URL", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
        monkeypatch.delenv(key, raising=False)
    fw = make_fw()
    assert fw.proxy_detected is False
    assert fw._proxy_url is None


def test_ca_cert_auto_detection(monkeypatch, tmp_path):
    from datetime import datetime, timezone, timedelta
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    # Generate a quick valid self-signed cert
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Test CA")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=1))
        .sign(key, hashes.SHA256())
    )

    cert_file = tmp_path / "ca.crt"
    from cryptography.hazmat.primitives import serialization
    cert_file.write_bytes(cert.public_bytes(serialization.Encoding.PEM))

    monkeypatch.setenv("SSL_CERT_FILE", str(cert_file))
    fw = make_fw()
    assert fw._ca_cert_path == str(cert_file)


def test_evidence_id_in_response():
    fw = make_fw()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "task_id": "task-ev-1",
        "decision": "allow",
        "allowed_to_proceed": True,
        "risk_score": 0.05,
        "violations": [],
        "latency_ms": 15,
        "evidence_id": "decision-task-ev-1",
    }
    mock_resp.raise_for_status = lambda: None
    with patch.object(fw._http, "post", return_value=mock_resp):
        resp = fw.send("receiver-id", "research", {"query": "test"})
    assert resp.evidence_id == "decision-task-ev-1"


def test_inspect_response():
    fw = make_fw()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "decision": "allow",
        "allowed_to_proceed": True,
        "findings": {},
        "redacted_body": "Safe content",
    }
    mock_resp.raise_for_status = lambda: None
    with patch.object(fw._http, "post", return_value=mock_resp):
        res = fw.inspect_response("Safe content", context="tool_result")
    assert res["decision"] == "allow"
    assert res["allowed_to_proceed"] is True


def test_inspect_and_store_memory():
    fw = make_fw()
    mock_inspect = MagicMock()
    mock_inspect.json.return_value = {
        "inspection": {"action": "allow", "blocked": False},
        "store_policy": {"persist": True},
    }
    mock_inspect.raise_for_status = lambda: None
    with patch.object(fw._http, "post", return_value=mock_inspect):
        res = fw.inspect_memory("System user documentation chunk")
    assert res["store_policy"]["persist"] is True

    mock_store = MagicMock()
    mock_store.json.return_value = {"persisted": True, "content_hash": "hash123"}
    mock_store.raise_for_status = lambda: None
    with patch.object(fw._http, "post", return_value=mock_store):
        store_res = fw.store_memory("Chunk text", metadata={"source": "manual"})
    assert store_res["persisted"] is True


def test_search_memory():
    fw = make_fw()
    mock_search = MagicMock()
    mock_search.json.return_value = {
        "blocked": False,
        "result_count": 1,
        "results": [{"entry_id": "1", "content": "relevant doc", "score": 0.95}],
    }
    mock_search.raise_for_status = lambda: None
    with patch.object(fw._http, "post", return_value=mock_search):
        search_res = fw.search_memory("financial report", top_k=3)
    assert search_res["result_count"] == 1
    assert search_res["results"][0]["score"] == 0.95


def test_inspect_dlp():
    fw = make_fw()
    mock_dlp = MagicMock()
    mock_dlp.json.return_value = {
        "action": "redact",
        "blocked": False,
        "transformed_text": "Account [REDACTED:credit_card]",
        "findings": [{"pattern_type": "credit_card"}],
    }
    mock_dlp.raise_for_status = lambda: None
    with patch.object(fw._http, "post", return_value=mock_dlp):
        dlp_res = fw.inspect_dlp("Account 4111111111111111", destination="external")
    assert dlp_res["action"] == "redact"
    assert "REDACTED" in dlp_res["transformed_text"]


def test_get_and_verify_evidence():
    fw = make_fw()
    mock_ev = MagicMock()
    mock_ev.json.return_value = {"decision_id": "dec-1", "signature": "sig123"}
    mock_ev.raise_for_status = lambda: None

    mock_verify = MagicMock()
    mock_verify.json.return_value = {"decision_id": "dec-1", "valid": True}
    mock_verify.raise_for_status = lambda: None

    with patch.object(fw._http, "get", side_effect=[mock_ev, mock_verify]):
        ev = fw.get_evidence("dec-1")
        ver = fw.verify_evidence("dec-1")
    assert ev["decision_id"] == "dec-1"
    assert ver["valid"] is True



