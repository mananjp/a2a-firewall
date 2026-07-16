"""Ed25519-based agent identity layer.

Every agent gets a long-term Ed25519 keypair. The public key is embedded in a
signed "agent card" — a JSON document attesting the agent's identity, workspace,
and capabilities. Any party can verify the card with the workspace root public key.

Design rationale:
- Ed25519 over RSA: 32-byte keys, fast sign/verify, constant-time, no padding oracle.
- Cards are short-lived (24h default) to limit exposure from key compromise.
- Cards map cleanly to SPIFFE SVIDs for future enterprise interop.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field, asdict
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)


# ---------------------------------------------------------------------------
# Key management
# ---------------------------------------------------------------------------

def generate_keypair() -> tuple[Ed25519PrivateKey, Ed25519PublicKey]:
    """Generate a fresh Ed25519 keypair."""
    private_key = Ed25519PrivateKey.generate()
    return private_key, private_key.public_key()


def private_key_to_hex(key: Ed25519PrivateKey) -> str:
    raw = key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
    return raw.hex()


def public_key_to_hex(key: Ed25519PublicKey) -> str:
    raw = key.public_bytes(Encoding.Raw, PublicFormat.Raw)
    return raw.hex()


def hex_to_private_key(hex_str: str) -> Ed25519PrivateKey:
    raw = bytes.fromhex(hex_str)
    return Ed25519PrivateKey.from_private_bytes(raw)


def hex_to_public_key(hex_str: str) -> Ed25519PublicKey:
    raw = bytes.fromhex(hex_str)
    return Ed25519PublicKey.from_public_bytes(raw)


# ---------------------------------------------------------------------------
# Agent Card
# ---------------------------------------------------------------------------

@dataclass
class AgentCard:
    """Cryptographically signed identity document for an agent."""
    agent_id: str
    name: str
    workspace_id: str
    capabilities: list[str]
    public_key: str  # hex-encoded Ed25519 public key
    issued_at: float  # epoch seconds
    expires_at: float  # epoch seconds
    signature: str = ""  # hex-encoded Ed25519 signature over card bytes

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_canonical_bytes(self) -> bytes:
        """Deterministic JSON serialization for signing/verification.

        Keys are sorted, no whitespace — ensures identical bytes across
        implementations (Python, TypeScript, etc.).
        """
        d = {k: v for k, v in self.to_dict().items() if k != "signature"}
        return json.dumps(d, sort_keys=True, separators=(",", ":")).encode()

    def is_expired(self) -> bool:
        return time.time() > self.expires_at


def sign_card(
    card: AgentCard,
    private_key: Ed25519PrivateKey,
) -> AgentCard:
    """Sign an agent card in-place and return it."""
    card.signature = private_key.sign(card.to_canonical_bytes()).hex()
    return card


def verify_card(
    card: AgentCard,
    workspace_root_public_key: Ed25519PublicKey,
) -> bool:
    """Verify a card's signature against the workspace root public key.

    Returns True only if:
    1. The signature is valid.
    2. The card has not expired.
    """
    if card.is_expired():
        return False
    try:
        sig_bytes = bytes.fromhex(card.signature)
        workspace_root_public_key.verify(sig_bytes, card.to_canonical_bytes())
        return True
    except Exception:
        return False


def create_agent_card(
    agent_id: str,
    name: str,
    workspace_id: str,
    capabilities: list[str],
    private_key: Ed25519PrivateKey,
    ttl_seconds: float = 86400.0,
) -> AgentCard:
    """Create and sign a new agent card."""
    now = time.time()
    card = AgentCard(
        agent_id=agent_id,
        name=name,
        workspace_id=workspace_id,
        capabilities=capabilities,
        public_key=public_key_to_hex(private_key.public_key()),
        issued_at=now,
        expires_at=now + ttl_seconds,
    )
    return sign_card(card, private_key)


# ---------------------------------------------------------------------------
# Workspace root keypair helpers
# ---------------------------------------------------------------------------

@dataclass
class WorkspaceKeys:
    """Workspace-level Ed25519 keypair for signing agent cards."""
    private_key_hex: str
    public_key_hex: str

    @classmethod
    def generate(cls) -> WorkspaceKeys:
        priv, pub = generate_keypair()
        return cls(
            private_key_hex=private_key_to_hex(priv),
            public_key_hex=public_key_to_hex(pub),
        )

    def get_private_key(self) -> Ed25519PrivateKey:
        return hex_to_private_key(self.private_key_hex)

    def get_public_key(self) -> Ed25519PublicKey:
        return hex_to_public_key(self.public_key_hex)
