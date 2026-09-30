"""BYOK (Bring Your Own Key) cryptographic helper module.

Provides authenticated symmetric encryption (Fernet / AES-128-CBC + HMAC-SHA256)
for user-provided LLM API keys stored at rest.

If BYOK_ENCRYPTION_KEY is not configured in settings, a deterministic key
is derived using PBKDF2-HMAC-SHA256 from SECRET_KEY and API_KEY_SALT.
"""

from __future__ import annotations

import base64

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from a2a_firewall.core.config import settings

_fernet_instance: Fernet | None = None


def _derive_fernet_key(secret: str, salt: str) -> bytes:
    """Derive a URL-safe base64-encoded 32-byte key for Fernet."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt.encode(),
        iterations=100_000,
    )
    key_bytes = kdf.derive(secret.encode())
    return base64.urlsafe_b64encode(key_bytes)


def get_fernet() -> Fernet:
    """Return the cached Fernet cipher instance."""
    global _fernet_instance
    if _fernet_instance is None:
        raw_key = (settings.BYOK_ENCRYPTION_KEY or "").strip()
        if raw_key:
            try:
                # Test validity of configured key
                fernet_key = raw_key.encode() if isinstance(raw_key, str) else raw_key
                _fernet_instance = Fernet(fernet_key)
            except Exception:
                # Fall back to derived key if invalid format
                fernet_key = _derive_fernet_key(settings.SECRET_KEY, settings.API_KEY_SALT)
                _fernet_instance = Fernet(fernet_key)
        else:
            fernet_key = _derive_fernet_key(settings.SECRET_KEY, settings.API_KEY_SALT)
            _fernet_instance = Fernet(fernet_key)
    return _fernet_instance


def encrypt_api_key(raw_key: str) -> str:
    """Encrypt a raw API key for database storage.

    Returns a URL-safe base64 string.
    """
    if not raw_key:
        return ""
    fernet = get_fernet()
    return fernet.encrypt(raw_key.strip().encode("utf-8")).decode("utf-8")


def decrypt_api_key(encrypted_key: str) -> str:
    """Decrypt a stored ciphertext back to the original raw API key.

    Raises InvalidToken if the key or ciphertext was tampered with.
    """
    if not encrypted_key:
        return ""
    fernet = get_fernet()
    return fernet.decrypt(encrypted_key.strip().encode("utf-8")).decode("utf-8")


def mask_api_key(key: str) -> str:
    """Mask an API key for safe display in the dashboard or API responses.

    Examples:
        "gsk_1234567890abcdef" -> "gsk_••••••••cdef"
        "short" -> "••••"
    """
    if not key:
        return ""
    clean = key.strip()
    if len(clean) <= 8:
        return "••••••••"
    prefix = clean[:4]
    suffix = clean[-4:]
    return f"{prefix}••••••••{suffix}"
