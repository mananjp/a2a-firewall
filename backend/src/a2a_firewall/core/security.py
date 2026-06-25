from __future__ import annotations

import hashlib
import secrets

from a2a_firewall.core.config import settings


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(f"{settings.API_KEY_SALT}{raw_key}".encode()).hexdigest()


def generate_api_key(prefix: str = "agt") -> tuple[str, str]:
    raw = f"{prefix}_{secrets.token_urlsafe(32)}"
    return raw, hash_api_key(raw)
