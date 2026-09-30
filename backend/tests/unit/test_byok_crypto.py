"""Unit tests for BYOK cryptographic operations and key masking."""

from __future__ import annotations

import pytest
from cryptography.fernet import InvalidToken

from a2a_firewall.core.byok_crypto import (
    _derive_fernet_key,
    decrypt_api_key,
    encrypt_api_key,
    mask_api_key,
)


def test_derive_fernet_key_deterministic():
    key1 = _derive_fernet_key("secret", "salt")
    key2 = _derive_fernet_key("secret", "salt")
    assert key1 == key2
    assert len(key1) == 44  # Base64 of 32 bytes is 44 chars


def test_derive_fernet_key_different_inputs():
    key1 = _derive_fernet_key("secret1", "salt")
    key2 = _derive_fernet_key("secret2", "salt")
    assert key1 != key2


def test_encrypt_decrypt_roundtrip():
    raw = "gsk_test_api_key_1234567890_abcdef"
    encrypted = encrypt_api_key(raw)
    assert encrypted != raw
    decrypted = decrypt_api_key(encrypted)
    assert decrypted == raw


def test_encrypt_empty_string():
    assert encrypt_api_key("") == ""
    assert decrypt_api_key("") == ""


def test_decrypt_invalid_token_raises():
    with pytest.raises(InvalidToken):
        decrypt_api_key("not_a_valid_fernet_ciphertext")


def test_mask_api_key_standard():
    key = "gsk_1234567890abcdef"
    masked = mask_api_key(key)
    assert masked == "gsk_••••••••cdef"
    assert "1234567890" not in masked


def test_mask_api_key_short():
    assert mask_api_key("short") == "••••••••"
    assert mask_api_key("12345678") == "••••••••"


def test_mask_api_key_empty():
    assert mask_api_key("") == ""
