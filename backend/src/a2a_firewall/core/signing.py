"""Message signing and hash-chained provenance.

Every inter-agent message is:
1. Signed by the sender's Ed25519 private key (non-repudiation).
2. Hash-chained to its parent task (tamper-evident lineage).

The chain hash is: SHA-256(parent_chain_hash || message_hash)
where message_hash = SHA-256(payload_json || sender_id || receiver_id || timestamp)

If anyone modifies a payload anywhere in the chain, all downstream chain hashes
break — making tampering immediately detectable.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from a2a_firewall.core.identity import hex_to_public_key


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------

def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compute_message_hash(
    payload: dict[str, Any],
    sender_id: str,
    receiver_id: str,
    timestamp: float,
) -> str:
    """Compute a deterministic hash of the message contents."""
    canonical = json.dumps(
        {"payload": payload, "sender": sender_id, "receiver": receiver_id, "ts": timestamp},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return sha256_hex(canonical)


def compute_chain_hash(parent_chain_hash: str | None, message_hash: str) -> str:
    """Extend the hash chain with a new message.

    If parent_chain_hash is None (root message), use a zero hash.
    """
    parent = parent_chain_hash or sha256_hex(b"\x00" * 32)
    return sha256_hex(bytes.fromhex(parent) + bytes.fromhex(message_hash))


# ---------------------------------------------------------------------------
# Signed message
# ---------------------------------------------------------------------------

@dataclass
class SignedMessage:
    """A fully signed and chain-hashed inter-agent message."""
    task_id: str
    sender_id: str
    receiver_id: str
    task_type: str
    payload: dict[str, Any]
    timestamp: float
    message_hash: str
    chain_hash: str
    signature: str  # Ed25519 signature over message_hash
    parent_task_id: str | None = None
    root_task_id: str | None = None
    depth: int = 0
    delegation_token: str | None = None  # compact serialized DelegationToken

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "sender_id": self.sender_id,
            "receiver_id": self.receiver_id,
            "task_type": self.task_type,
            "payload": self.payload,
            "timestamp": self.timestamp,
            "message_hash": self.message_hash,
            "chain_hash": self.chain_hash,
            "signature": self.signature,
            "parent_task_id": self.parent_task_id,
            "root_task_id": self.root_task_id,
            "depth": self.depth,
            "delegation_token": self.delegation_token,
        }

    def signing_bytes(self) -> bytes:
        """Bytes that are signed by the sender."""
        return bytes.fromhex(self.message_hash)


# ---------------------------------------------------------------------------
# Sign and verify
# ---------------------------------------------------------------------------

def sign_message(
    task_id: str,
    sender_id: str,
    receiver_id: str,
    task_type: str,
    payload: dict[str, Any],
    sender_private_key: Ed25519PrivateKey,
    parent_chain_hash: str | None = None,
    parent_task_id: str | None = None,
    root_task_id: str | None = None,
    depth: int = 0,
    delegation_token: str | None = None,
) -> SignedMessage:
    """Create a signed, chain-hashed message."""
    now = time.time()
    msg_hash = compute_message_hash(payload, sender_id, receiver_id, now)
    chain_hash = compute_chain_hash(parent_chain_hash, msg_hash)
    signature = sender_private_key.sign(bytes.fromhex(msg_hash)).hex()

    return SignedMessage(
        task_id=task_id,
        sender_id=sender_id,
        receiver_id=receiver_id,
        task_type=task_type,
        payload=payload,
        timestamp=now,
        message_hash=msg_hash,
        chain_hash=chain_hash,
        signature=signature,
        parent_task_id=parent_task_id,
        root_task_id=root_task_id or task_id,
        depth=depth,
        delegation_token=delegation_token,
    )


@dataclass
class SignatureVerificationResult:
    """Result of verifying a signed message."""
    signature_valid: bool
    chain_valid: bool
    reason: str = ""


def verify_signature(
    message: SignedMessage,
    sender_public_key_hex: str,
    expected_parent_chain_hash: str | None = None,
) -> SignatureVerificationResult:
    """Verify a message's Ed25519 signature and chain hash integrity.

    Checks:
    1. Ed25519 signature matches the message hash.
    2. Chain hash was computed correctly from parent chain hash.
    """
    # 1. Verify Ed25519 signature
    try:
        pub_key = hex_to_public_key(sender_public_key_hex)
        pub_key.verify(bytes.fromhex(message.signature), message.signing_bytes())
    except Exception:
        return SignatureVerificationResult(
            signature_valid=False,
            chain_valid=False,
            reason="signature_verification_failed",
        )

    # 2. Verify chain hash
    expected_chain = compute_chain_hash(expected_parent_chain_hash, message.message_hash)
    if message.chain_hash != expected_chain:
        return SignatureVerificationResult(
            signature_valid=True,
            chain_valid=False,
            reason="chain_hash_mismatch",
        )

    return SignatureVerificationResult(signature_valid=True, chain_valid=True)


# ---------------------------------------------------------------------------
# Telemetry event (structured JSON for correlation engine)
# ---------------------------------------------------------------------------

@dataclass
class TelemetryEvent:
    """Structured telemetry event emitted on every inspection.

    This is the bridge between the A2A firewall and the correlation engine —
    every decision, violation, and identity check produces one of these.
    """
    event_id: str
    event_type: str  # "a2a.inspection" | "a2a.identity_failure" | "a2a.scope_violation" | "a2a.delegation"
    timestamp: str  # ISO 8601
    workspace_id: str
    sender_agent_id: str
    receiver_agent_id: str
    task_type: str
    decision: str  # "allow" | "block" | "review"
    risk_score: float
    violations: list[dict[str, Any]]
    delegation_chain: list[str]
    delegation_depth: int
    message_hash: str
    chain_hash: str
    signature_valid: bool
    cipher_suite: str = "TLS_AES_256_GCM_SHA384"
    key_exchange: str = "X25519Kyber768"
    otel_trace_id: str | None = None
    otel_span_id: str | None = None
    latency_ms: int = 0
    groq_called: bool = False
    groq_rationale: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items() if v is not None or k in ("event_id", "event_type", "timestamp")}

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"))
