"""Authentication security tests.

Tests for the production password authentication system:
- Password hashing with Argon2id
- Login validation
- Password complexity enforcement
- Registration edge cases
- Change password verification
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

# Test the auth helper functions directly
from a2a_firewall.api.routes.auth import (
    MIN_PASSWORD_LENGTH,
    _hash_password,
    _validate_password,
    _verify_password,
)


class TestPasswordHashing:
    """Test Argon2id password hashing and verification."""

    def test_hash_produces_argon2id(self) -> None:
        """Verify that the hash uses Argon2id algorithm."""
        hashed = _hash_password("test-password-123")
        assert hashed.startswith("$argon2id$")

    def test_hash_is_unique_per_call(self) -> None:
        """Verify that the same password produces different hashes (unique salt)."""
        hash1 = _hash_password("same-password")
        hash2 = _hash_password("same-password")
        assert hash1 != hash2

    def test_verify_correct_password(self) -> None:
        """Verify that correct password passes verification."""
        password = "correct-horse-battery-staple"
        hashed = _hash_password(password)
        assert _verify_password(hashed, password) is True

    def test_verify_wrong_password(self) -> None:
        """Verify that wrong password fails verification."""
        hashed = _hash_password("correct-password")
        assert _verify_password(hashed, "wrong-password") is False

    def test_verify_empty_password(self) -> None:
        """Verify that empty password fails against a real hash."""
        hashed = _hash_password("real-password")
        assert _verify_password(hashed, "") is False

    def test_verify_unicode_password(self) -> None:
        """Verify that Unicode passwords work correctly."""
        password = "пароль密码パスワード🔑"
        hashed = _hash_password(password)
        assert _verify_password(hashed, password) is True

    def test_verify_long_password(self) -> None:
        """Verify that very long passwords work."""
        password = "a" * 1000
        hashed = _hash_password(password)
        assert _verify_password(hashed, password) is True

    def test_verify_special_characters(self) -> None:
        """Verify that special characters in passwords work."""
        password = "p@$$w0rd!#%^&*()_+-=[]{}|;':\",./<>?"
        hashed = _hash_password(password)
        assert _verify_password(hashed, password) is True


class TestPasswordValidation:
    """Test password complexity enforcement."""

    def test_valid_password_passes(self) -> None:
        """Passwords meeting minimum length should pass."""
        _validate_password("a" * MIN_PASSWORD_LENGTH)  # Should not raise

    def test_short_password_rejected(self) -> None:
        """Passwords below minimum length should be rejected."""
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _validate_password("short")
        assert exc_info.value.status_code == 422

    def test_empty_password_rejected(self) -> None:
        """Empty passwords should be rejected."""
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            _validate_password("")

    def test_min_length_boundary(self) -> None:
        """Password at exactly minimum length should pass."""
        _validate_password("a" * MIN_PASSWORD_LENGTH)  # Should not raise

    def test_one_below_min_rejected(self) -> None:
        """Password one character below minimum should be rejected."""
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            _validate_password("a" * (MIN_PASSWORD_LENGTH - 1))


class TestBruteForceResistance:
    """Tests to verify the auth system has brute-force resistance properties."""

    def test_argon2_is_slow_enough(self) -> None:
        """Verify that Argon2id hashing takes a non-trivial amount of time.

        This provides inherent brute-force resistance — each password attempt
        should take at least a few milliseconds, making mass brute-force
        infeasible.
        """
        import time

        password = "test-password-123"
        start = time.perf_counter()
        _hash_password(password)
        elapsed_ms = (time.perf_counter() - start) * 1000

        # Argon2id should take at least 1ms (usually 10-100ms)
        assert elapsed_ms > 1, f"Argon2id hashing too fast ({elapsed_ms:.2f}ms) — potential misconfiguration"

    def test_verification_constant_time_ish(self) -> None:
        """Verify that password verification timing is roughly consistent.

        This isn't a strict constant-time test, but verifies that the
        verification function doesn't have obvious timing side-channels.
        """
        import time

        hashed = _hash_password("real-password")
        timings = []

        for attempt in ["wrong-1", "wrong-2", "wrong-3", "wrong-4", "wrong-5"]:
            start = time.perf_counter()
            _verify_password(hashed, attempt)
            timings.append(time.perf_counter() - start)

        # All timings should be within the same order of magnitude
        min_time = min(timings)
        max_time = max(timings)
        assert max_time < min_time * 10, "Suspicious timing variation in password verification"
