"""Signing and delegation security edge-case tests.

Tests for the Ed25519 signing and Macaroon-style delegation system to verify:
- Forged signatures are rejected
- Tampered payloads are rejected
- Wrong keys are rejected
- Chain hash integrity is verified
- Tampered delegation tokens are detected
- Attenuated delegation tokens are verified
"""

from __future__ import annotations

import hashlib
import uuid

import pytest

from a2a_firewall.core.delegation import (
    attenuate_token,
    mint_token,
    token_to_compact,
    verify_token,
)
from a2a_firewall.core.identity import (
    generate_keypair,
    public_key_to_hex,
)
from a2a_firewall.core.signing import (
    compute_message_hash,
    sign_message,
    verify_signature,
)


class TestSigningEdgeCases:
    """Ed25519 signing security tests."""

    def test_forged_signature_rejected(self) -> None:
        """Verify that a payload with a forged signature is rejected."""
        priv, pub = generate_keypair()
        pub_hex = public_key_to_hex(pub)

        msg = sign_message(
            task_id=str(uuid.uuid4()),
            sender_id="sender-1",
            receiver_id="receiver-1",
            task_type="research",
            payload={"query": "safe payload"},
            sender_private_key=priv,
        )

        # Tamper with signature
        msg.signature = "a" * len(msg.signature)

        res = verify_signature(msg, pub_hex)
        assert res.signature_valid is False

    def test_tampered_payload_rejected(self) -> None:
        """Verify that modifying the payload after signing invalidates the signature."""
        priv, pub = generate_keypair()
        pub_hex = public_key_to_hex(pub)

        msg = sign_message(
            task_id=str(uuid.uuid4()),
            sender_id="sender-1",
            receiver_id="receiver-1",
            task_type="research",
            payload={"query": "safe payload"},
            sender_private_key=priv,
        )

        # Tamper with payload
        msg.payload["query"] = "malicious payload"
        # Recomputed message hash wouldn't match signed message hash if caller recomputes
        # If message_hash is updated, signature will fail verification:
        msg.message_hash = compute_message_hash(
            msg.payload, msg.sender_id, msg.receiver_id, msg.timestamp
        )

        res = verify_signature(msg, pub_hex)
        assert res.signature_valid is False

    def test_wrong_key_rejected(self) -> None:
        """Verify that a payload signed with key A is rejected when verified with key B."""
        priv_a, _ = generate_keypair()
        _, pub_b = generate_keypair()
        pub_b_hex = public_key_to_hex(pub_b)

        msg = sign_message(
            task_id=str(uuid.uuid4()),
            sender_id="sender-1",
            receiver_id="receiver-1",
            task_type="research",
            payload={"query": "safe payload"},
            sender_private_key=priv_a,
        )

        res = verify_signature(msg, pub_b_hex)
        assert res.signature_valid is False

    def test_empty_payload_signed_and_verified(self) -> None:
        """Verify that empty payloads can be signed and verified."""
        priv, pub = generate_keypair()
        pub_hex = public_key_to_hex(pub)

        msg = sign_message(
            task_id=str(uuid.uuid4()),
            sender_id="sender-1",
            receiver_id="receiver-1",
            task_type="research",
            payload={},
            sender_private_key=priv,
        )

        res = verify_signature(msg, pub_hex)
        assert res.signature_valid is True
        assert res.chain_valid is True

    def test_unicode_payload_signed_and_verified(self) -> None:
        """Verify that Unicode payloads are handled correctly."""
        priv, pub = generate_keypair()
        pub_hex = public_key_to_hex(pub)

        unicode_payload = {"text": "こんにちは世界 🌍 مرحبا 你好 Привет"}
        msg = sign_message(
            task_id=str(uuid.uuid4()),
            sender_id="sender-1",
            receiver_id="receiver-1",
            task_type="research",
            payload=unicode_payload,
            sender_private_key=priv,
        )

        res = verify_signature(msg, pub_hex)
        assert res.signature_valid is True
        assert res.chain_valid is True


class TestChainHashSecurity:
    """Hash chain integrity tests."""

    def test_valid_chain_hash_accepted(self) -> None:
        """Verify that a correctly computed chain hash passes verification."""
        priv, pub = generate_keypair()
        pub_hex = public_key_to_hex(pub)

        parent_chain_hash = hashlib.sha256(b"parent").hexdigest()
        msg = sign_message(
            task_id=str(uuid.uuid4()),
            sender_id="sender-1",
            receiver_id="receiver-1",
            task_type="research",
            payload={"data": "test"},
            sender_private_key=priv,
            parent_chain_hash=parent_chain_hash,
        )

        res = verify_signature(msg, pub_hex, expected_parent_chain_hash=parent_chain_hash)
        assert res.signature_valid is True
        assert res.chain_valid is True

    def test_forged_chain_hash_rejected(self) -> None:
        """Verify that a forged chain hash is rejected."""
        priv, pub = generate_keypair()
        pub_hex = public_key_to_hex(pub)

        parent_chain_hash = hashlib.sha256(b"parent").hexdigest()
        msg = sign_message(
            task_id=str(uuid.uuid4()),
            sender_id="sender-1",
            receiver_id="receiver-1",
            task_type="research",
            payload={"data": "test"},
            sender_private_key=priv,
            parent_chain_hash=parent_chain_hash,
        )

        # Modify chain hash
        msg.chain_hash = "deadbeef" * 8

        res = verify_signature(msg, pub_hex, expected_parent_chain_hash=parent_chain_hash)
        assert res.signature_valid is True
        assert res.chain_valid is False
        assert res.reason == "chain_hash_mismatch"


class TestDelegationTokenSecurity:
    """Macaroon-style delegation token security tests."""

    def _root_key(self) -> bytes:
        return hashlib.sha256(b"test-root-key").digest()

    def test_valid_token_accepted(self) -> None:
        """Verify that a properly minted token passes verification."""
        root_key = self._root_key()
        token = mint_token(root_key, "ws-1", "agent-1", ["task_type=research"])
        res = verify_token(token, root_key)
        assert res.valid is True

    def test_tampered_signature_rejected(self) -> None:
        """Verify that a token with a corrupted signature is rejected."""
        root_key = self._root_key()
        token = mint_token(root_key, "ws-1", "agent-1", ["task_type=research"])
        token.signature = "deadbeef" * 8
        res = verify_token(token, root_key)
        assert res.valid is False
        assert res.reason == "signature_mismatch"

    def test_tampered_caveats_rejected(self) -> None:
        """Verify that modifying caveats after minting invalidates the token."""
        root_key = self._root_key()
        token = mint_token(root_key, "ws-1", "agent-1", ["task_type=research"])
        token.caveats.append("task_type=admin")
        res = verify_token(token, root_key)
        assert res.valid is False

    def test_removed_caveats_rejected(self) -> None:
        """Verify that removing caveats invalidates the token."""
        root_key = self._root_key()
        token = mint_token(root_key, "ws-1", "agent-1", ["task_type=research", "max_risk=0.5"])
        token.caveats = ["task_type=research"]  # Remove max_risk caveat
        res = verify_token(token, root_key)
        assert res.valid is False

    def test_attenuated_token_valid(self) -> None:
        """Verify that properly attenuated tokens are accepted."""
        root_key = self._root_key()
        parent = mint_token(root_key, "ws-1", "agent-1", ["task_type=research", "max_risk=0.5"])
        child = attenuate_token(parent, root_key, ["max_risk=0.3"])
        res = verify_token(child, root_key)
        assert res.valid is True

    def test_attenuated_token_cannot_widen_numeric(self) -> None:
        """Verify that attenuation cannot widen numeric bounds."""
        root_key = self._root_key()
        parent = mint_token(root_key, "ws-1", "agent-1", ["max_risk=0.5"])
        with pytest.raises(ValueError, match="would widen"):
            attenuate_token(parent, root_key, ["max_risk=0.8"])

    def test_wrong_root_key_rejected(self) -> None:
        """Verify that a token verified with wrong root key fails."""
        root_key_a = hashlib.sha256(b"key-a").digest()
        root_key_b = hashlib.sha256(b"key-b").digest()
        token = mint_token(root_key_a, "ws-1", "agent-1", ["task_type=research"])
        res = verify_token(token, root_key_b)
        assert res.valid is False

    def test_compact_round_trip(self) -> None:
        """Verify that compact serialization preserves token integrity."""
        root_key = self._root_key()
        token = mint_token(root_key, "ws-1", "agent-1", ["task_type=research"])
        compact = token_to_compact(token)
        assert isinstance(compact, str)
        assert len(compact) > 0
