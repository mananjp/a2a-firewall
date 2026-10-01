"""JWT session token utilities for self-serve authentication.

Provides token generation, expiration enforcement, and signature verification
for dashboard user sessions using python-jose.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from jwt.exceptions import PyJWTError

from a2a_firewall.core.config import settings


def _get_signing_key() -> str:
    """Return the JWT secret key, falling back to SECRET_KEY."""
    return settings.JWT_SECRET_KEY or settings.SECRET_KEY


def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    now = datetime.now(UTC)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"iat": now, "exp": expire})
    return jwt.encode(to_encode, _get_signing_key(), algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode and verify a signed JWT token.

    Returns the claims payload dictionary if valid, or None if invalid/expired.
    """
    try:
        payload = jwt.decode(
            token,
            _get_signing_key(),
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except (PyJWTError, Exception):
        return None
