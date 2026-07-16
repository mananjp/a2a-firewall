"""Tests for the identity, delegation, and signing core modules."""

from __future__ import annotations

import hashlib
import hmac
import json
import time

import pytest

from a2a_firewall.core.identity import (
    AgentCard,
    WorkspaceKeys,
    create_agent_card,
    generate_keypair,
    hex_to_private_key,
    hex_to_public_key,
    private_key_to_hex,
    public_key_to_hex,
    sign_card,
    verify_card,
)
from a2a_firewall.core.delegation import (
    DelegationToken,
    VerificationResult,
    _parse_caveats,
    attenuate_token,
    check_capability,
    generate_root_key,
    mint_token,
    token_from_compact,
    token_to_compact,
    verify_token,
)
from a2a_firewall.core.signing import (
    SignatureVerificationResult,
    TelemetryEvent,
    compute_chain_hash,
    compute_message_hash,
    sha256_hex,
    sign_message,
    verify_signature,
)


# ---------------------------------------------------------------------------
# Identity tests
# ---------------------------------------------------------------------------

class TestIdentity:
    def test_keypair_generation(self):
        priv, pub = generate_keypair()
        priv_hex = private_key_to_hex(priv)
        pub_hex = public_key_to_hex(pub)
        assert len(priv_hex) == 64  # 32 bytes = 64 hex chars
        assert len(pub_hex) == 64

    def test_key_roundtrip(self):
        priv, pub = generate_keypair()
        priv_hex = private_key_to_hex(priv)
        pub_hex = public_key_to_hex(pub)
        priv2 = hex_to_private_key(priv_hex)
        pub2 = hex_to_public_key(pub_hex)
        assert private_key_to_hex(priv2) == priv_hex
        assert public_key_to_hex(pub2) == pub_hex

    def test_card_creation_and_signing(self):
        ws_priv, ws_pub = generate_keypair()
        agent_priv, _ = generate_keypair()

        card = create_agent_card(
            agent_id="agent-1",
            name="test-agent",
            workspace_id="ws-1",
            capabilities=["research", "analysis"],
            private_key=agent_priv,
            ttl_seconds=3600,
        )
        assert card.signature != ""
        assert not card.is_expired()

        # Verify with workspace root key
        assert verify_card(card, ws_pub) is True

    def test_card_verification_wrong_key(self):
        _, ws_pub = generate_keypair()
        _, wrong_pub = generate_keypair()
        agent_priv, _ = generate_keypair()

        card = create_agent_card(
            agent_id="agent-1", name="test", workspace_id="ws-1",
            capabilities=[], private_key=agent_priv,
        )
        assert verify_card(card, wrong_pub) is False

    def test_card_expiry(self):
        _, ws_pub = generate_keypair()
        agent_priv, _ = generate_keypair()

        card = create_agent_card(
            agent_id="agent-1", name="test", workspace_id="ws-1",
            capabilities=[], private_key=agent_priv, ttl_seconds=-1,  # expired
        )
        assert card.is_expired()
        assert verify_card(card, ws_pub) is False

    def test_workspace_keys(self):
        keys = WorkspaceKeys.generate()
        assert len(keys.private_key_hex) == 64
        assert len(keys.public_key_hex) == 64
        assert keys.get_private_key() is not None
        assert keys.get_public_key() is not None


# ---------------------------------------------------------------------------
# Delegation tests
# ---------------------------------------------------------------------------

class TestDelegation:
    def setup_method(self):
        self.root_key = generate_root_key()

    def test_mint_token(self):
        token = mint_token(self.root_key, "ws-1", "agent-1", ["task_type=research"])
        assert token.location == "ws-1"
        assert token.identifier == "agent-1"
        assert "task_type=research" in token.caveats
        assert token.signature != ""

    def test_verify_token(self):
        token = mint_token(self.root_key, "ws-1", "agent-1")
        result = verify_token(token, self.root_key)
        assert result.valid is True

    def test_verify_wrong_key(self):
        token = mint_token(self.root_key, "ws-1", "agent-1")
        wrong_key = generate_root_key()
        result = verify_token(token, wrong_key)
        assert result.valid is False
        assert result.reason == "signature_mismatch"

    def test_attenuate_token(self):
        token = mint_token(self.root_key, "ws-1", "agent-1", ["task_type=research"])
        child = attenuate_token(token, self.root_key, ["max_risk=0.5"])

        assert len(child.caveats) == 2
        assert "max_risk=0.5" in child.caveats

        # Verify child
        result = verify_token(child, self.root_key)
        assert result.valid is True

    def test_attenuation_narrows(self):
        token = mint_token(self.root_key, "ws-1", "agent-1", ["max_risk=0.8"])
        child = attenuate_token(token, self.root_key, ["max_risk=0.5"])

        # Child should have lower max_risk
        parsed = _parse_caveats(child.caveats)
        assert float(parsed["max_risk"]) == 0.5

    def test_attenuation_cannot_widen(self):
        token = mint_token(self.root_key, "ws-1", "agent-1", ["max_risk=0.3"])
        with pytest.raises(ValueError, match="would widen"):
            attenuate_token(token, self.root_key, ["max_risk=0.8"])

    def test_attenuation_chain(self):
        root = mint_token(self.root_key, "ws-1", "agent-1")
        child1 = attenuate_token(root, self.root_key, ["task_type=research", "max_risk=0.7"])
        child2 = attenuate_token(child1, self.root_key, ["receiver=agent-2", "max_risk=0.5"])

        assert len(child2.caveats) == 3
        result = verify_token(child2, self.root_key)
        assert result.valid is True

    def test_check_capability(self):
        token = mint_token(self.root_key, "ws-1", "agent-1", ["task_type=research", "max_risk=0.7"])

        assert check_capability(token, "task_type=research") is True
        assert check_capability(token, "task_type=payments") is False
        assert check_capability(token, "max_risk=0.5") is True  # 0.7 >= 0.5
        assert check_capability(token, "max_risk=0.9") is False  # 0.7 < 0.9

    def test_token_compact_roundtrip(self):
        token = mint_token(self.root_key, "ws-1", "agent-1", ["x=1"])
        compact = token_to_compact(token)
        restored = token_from_compact(compact)
        assert restored.location == token.location
        assert restored.caveats == token.caveats
        assert restored.signature == token.signature

    def test_token_expiry(self):
        caveats = [f"expires={time.time() - 10}"]  # expired 10 seconds ago
        token = mint_token(self.root_key, "ws-1", "agent-1", caveats)
        result = verify_token(token, self.root_key)
        assert result.valid is False
        assert result.expired is True

    def test_root_key_generation(self):
        key1 = generate_root_key()
        key2 = generate_root_key()
        assert len(key1) == 32
        assert key1 != key2


# ---------------------------------------------------------------------------
# Signing tests
# ---------------------------------------------------------------------------

class TestSigning:
    def test_message_hash_deterministic(self):
        payload = {"query": "test"}
        h1 = compute_message_hash(payload, "sender-1", "recv-1", 1234567890.0)
        h2 = compute_message_hash(payload, "sender-1", "recv-1", 1234567890.0)
        assert h1 == h2
        assert len(h1) == 64

    def test_message_hash_different_inputs(self):
        h1 = compute_message_hash({"a": 1}, "s", "r", 1.0)
        h2 = compute_message_hash({"a": 2}, "s", "r", 1.0)
        assert h1 != h2

    def test_chain_hash(self):
        parent = sha256_hex(b"parent")
        msg_hash = sha256_hex(b"message")
        chain1 = compute_chain_hash(parent, msg_hash)
        assert len(chain1) == 64

        # Different parent = different chain
        chain2 = compute_chain_hash(sha256_hex(b"other"), msg_hash)
        assert chain1 != chain2

    def test_chain_hash_root(self):
        msg_hash = sha256_hex(b"message")
        chain = compute_chain_hash(None, msg_hash)
        assert len(chain) == 64

    def test_sign_and_verify(self):
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        priv = Ed25519PrivateKey.generate()
        pub_hex = public_key_to_hex(priv.public_key())

        msg = sign_message(
            task_id="task-1",
            sender_id="agent-1",
            receiver_id="agent-2",
            task_type="research",
            payload={"query": "test"},
            sender_private_key=priv,
        )

        assert msg.signature != ""
        assert msg.message_hash != ""
        assert msg.chain_hash != ""

        # Verify
        result = verify_signature(msg, pub_hex)
        assert result.signature_valid is True
        assert result.chain_valid is True

    def test_verify_tampered_payload(self):
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        priv = Ed25519PrivateKey.generate()
        pub_hex = public_key_to_hex(priv.public_key())

        msg = sign_message(
            task_id="task-1", sender_id="a", receiver_id="b",
            task_type="t", payload={"amount": 100}, sender_private_key=priv,
        )

        # Tamper with chain hash
        msg.chain_hash = sha256_hex(b"tampered")
        result = verify_signature(msg, pub_hex, expected_parent_chain_hash=None)
        assert result.signature_valid is True
        assert result.chain_valid is False

    def test_telemetry_event(self):
        event = TelemetryEvent(
            event_id="evt-1",
            event_type="a2a.inspection",
            timestamp="2026-07-15T10:00:00Z",
            workspace_id="ws-1",
            sender_agent_id="a",
            receiver_agent_id="b",
            task_type="research",
            decision="allow",
            risk_score=0.1,
            violations=[],
            delegation_chain=["a", "b"],
            delegation_depth=1,
            message_hash="abc123",
            chain_hash="def456",
            signature_valid=True,
        )
        d = event.to_dict()
        assert d["event_type"] == "a2a.inspection"
        assert d["decision"] == "allow"

        j = event.to_json()
        parsed = json.loads(j)
        assert parsed["event_id"] == "evt-1"
