from __future__ import annotations

import hashlib
import secrets

from a2a_firewall.core.config import settings


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(f"{settings.API_KEY_SALT}{raw_key}".encode()).hexdigest()


def generate_api_key(prefix: str = "agt") -> tuple[str, str]:
    raw = f"{prefix}_{secrets.token_urlsafe(32)}"
    return raw, hash_api_key(raw)


def derive_workspace_signing_seed(workspace_id: str) -> bytes:
    """Derive a deterministic 32-byte seed for a workspace's root Ed25519 key.

    The seed is a PBKDF2-HMAC-SHA256 function of ``API_KEY_SALT`` (a server-side
    secret) plus the workspace UUID. This means the private key can be
    reproduced on demand (never stored in the database) but is NOT derivable by
    anyone who merely knows the workspace UUID — closing the forgeability hole
    in the previous scheme, which used a raw, unsalted SHA-256 of the public ID.
    """
    material = f"{settings.API_KEY_SALT}:{workspace_id}".encode()
    return hashlib.pbkdf2_hmac(
        "sha256",
        material,
        b"a2a-firewall-workspace-root-v1",
        iterations=100_000,
        dklen=32,
    )
