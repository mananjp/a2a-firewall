# Copyright (c) 2026 Manan Jayeshkumar Panchal.
# Licensed under the Apache License, Version 2.0.
"""Secure DLP token vault with AES-256-GCM encryption and HMAC-SHA256 lookup.

Replaces the in-memory ``TokenVault`` in ``dlp_tokenizer.py`` with a
production-grade vault that:

- Generates random tokens (``tok_<entity_type>_<random>``) that never encode
  the plaintext value.
- Encrypts values at rest with **AES-256-GCM** using per-record 96-bit nonces,
  and ``workspace_id|token`` as Additional Authenticated Data (AAD).
- Uses a deterministic **HMAC-SHA256(index_key, entity_type:value)** lookup
  index so the same value within a workspace always maps to the same token
  (useful for joins / correlation), without leaking the plaintext.
- Supports key rotation via a ``KeyProvider`` abstraction (env key now,
  KMS/Vault in a future phase).
- Audits every ``detokenize`` call via an ``AuditSink`` protocol.

Storage is pluggable via the ``VaultStore`` protocol — an in-memory
implementation is included for dev; a Postgres-backed implementation can
be added by implementing ``VaultStore``.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

# ── Protocols for pluggable components ───────────────────────────────────


class KeyProvider(Protocol):
    """Provide data-encryption and index keys for a workspace."""

    def current(self, workspace_id: str) -> tuple[str, bytes]:
        """Return ``(key_id, 32-byte data key)`` used for new writes."""
        ...

    def get(self, workspace_id: str, key_id: str) -> bytes:
        """Return the data key for a historical ``key_id`` (rotation)."""
        ...

    def index_key(self, workspace_id: str) -> bytes:
        """Return a separate 32-byte key for the deterministic lookup index."""
        ...


class VaultStore(Protocol):
    """Persist and retrieve encrypted vault records."""

    def find_by_index(self, workspace_id: str, value_index: str) -> VaultRecord | None:
        """Find an existing record by its deterministic HMAC index."""
        ...

    def get(self, workspace_id: str, token: str) -> VaultRecord | None:
        """Retrieve a record by its token."""
        ...

    def put(self, record: VaultRecord) -> None:
        """Persist a new vault record."""
        ...


class AuditSink(Protocol):
    """Record audit events for DLP operations."""

    def record(self, event: str, **fields: object) -> None:
        """Log a DLP audit event."""
        ...


# ── Data structures ─────────────────────────────────────────────────────


@dataclass
class VaultRecord:
    """An encrypted value stored in the vault."""

    token: str
    workspace_id: str
    entity_type: str
    ciphertext: bytes
    nonce: bytes
    key_id: str
    value_index: str
    classification: str
    created_at: datetime
    expires_at: datetime


# ── In-memory implementations (dev / test) ───────────────────────────────


class EnvKeyProvider:
    """Derive keys from an environment secret (dev / single-node only).

    Production deployments should replace this with a KMS-backed provider.
    """

    def __init__(self, master_secret: str) -> None:
        self._master = master_secret.encode("utf-8")

    def _derive(self, workspace_id: str, purpose: str) -> bytes:
        """HKDF-like derivation using HMAC-SHA256 (simplified)."""
        return hmac.new(
            self._master,
            f"{workspace_id}:{purpose}".encode(),
            hashlib.sha256,
        ).digest()

    def current(self, workspace_id: str) -> tuple[str, bytes]:
        return "env-v1", self._derive(workspace_id, "data-key")

    def get(self, workspace_id: str, key_id: str) -> bytes:
        # For the env provider, all key_ids resolve to the same derived key.
        return self._derive(workspace_id, "data-key")

    def index_key(self, workspace_id: str) -> bytes:
        return self._derive(workspace_id, "index-key")


class InMemoryVaultStore:
    """In-memory vault store for development and testing."""

    def __init__(self) -> None:
        self._by_index: dict[str, VaultRecord] = {}
        self._by_token: dict[str, VaultRecord] = {}

    def find_by_index(self, workspace_id: str, value_index: str) -> VaultRecord | None:
        key = f"{workspace_id}:{value_index}"
        return self._by_index.get(key)

    def get(self, workspace_id: str, token: str) -> VaultRecord | None:
        key = f"{workspace_id}:{token}"
        return self._by_token.get(key)

    def put(self, record: VaultRecord) -> None:
        self._by_index[f"{record.workspace_id}:{record.value_index}"] = record
        self._by_token[f"{record.workspace_id}:{record.token}"] = record


class LogAuditSink:
    """Audit sink that logs to Python's logging framework."""

    def __init__(self) -> None:
        import logging

        self._logger = logging.getLogger("a2a_firewall.dlp.audit")

    def record(self, event: str, **fields: object) -> None:
        self._logger.info("DLP audit: %s %s", event, fields)


class NullAuditSink:
    """No-op audit sink for testing."""

    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, object]]] = []

    def record(self, event: str, **fields: object) -> None:
        self.events.append((event, dict(fields)))


# ── Core vault ───────────────────────────────────────────────────────────


class SecureTokenVault:
    """AES-256-GCM encrypted token vault with HMAC-SHA256 lookup index.

    This is the production replacement for the in-memory ``TokenVault``
    in ``dlp_tokenizer.py``.
    """

    def __init__(
        self,
        store: VaultStore,
        keys: KeyProvider,
        audit: AuditSink,
        default_ttl_days: int = 30,
    ) -> None:
        self.store = store
        self.keys = keys
        self.audit = audit
        self.default_ttl_days = default_ttl_days

    def tokenize(
        self,
        *,
        workspace_id: str,
        entity_type: str,
        value: str,
        classification: str = "sensitive",
        actor: str = "system",
        ttl_days: int | None = None,
    ) -> str:
        """Encrypt and store ``value``, returning a stable opaque token.

        If the same ``(workspace_id, entity_type, value)`` is tokenized again
        before expiry, the existing token is returned (deterministic via HMAC
        lookup index).
        """
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        now = datetime.now(UTC)
        ttl = ttl_days if ttl_days is not None else self.default_ttl_days

        # Deterministic index for dedup
        index = hmac.new(
            self.keys.index_key(workspace_id),
            f"{entity_type}:{value}".encode(),
            hashlib.sha256,
        ).hexdigest()

        # Check for existing unexpired record
        existing = self.store.find_by_index(workspace_id, index)
        if existing is not None and existing.expires_at > now:
            return existing.token

        # Mint a new token (random, never derived from value)
        token = f"tok_{entity_type}_{secrets.token_urlsafe(16)}"
        key_id, key = self.keys.current(workspace_id)
        nonce = os.urandom(12)
        aad = f"{workspace_id}|{token}".encode()
        ciphertext = AESGCM(key).encrypt(nonce, value.encode("utf-8"), aad)

        self.store.put(
            VaultRecord(
                token=token,
                workspace_id=workspace_id,
                entity_type=entity_type,
                ciphertext=ciphertext,
                nonce=nonce,
                key_id=key_id,
                value_index=index,
                classification=classification,
                created_at=now,
                expires_at=now + timedelta(days=ttl),
            )
        )
        self.audit.record(
            "dlp.tokenize",
            actor=actor,
            token=token,
            entity_type=entity_type,
            workspace_id=workspace_id,
        )
        return token

    def detokenize(
        self,
        *,
        workspace_id: str,
        token: str,
        actor: str,
        purpose: str,
    ) -> str:
        """Decrypt and return the original value for ``token``.

        Raises ``KeyError`` if the token is unknown or expired.
        Every call is audited.
        """
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        record = self.store.get(workspace_id, token)
        if record is None or record.expires_at <= datetime.now(UTC):
            self.audit.record(
                "dlp.detokenize.denied",
                actor=actor,
                token=token,
                purpose=purpose,
                workspace_id=workspace_id,
                reason="unknown_or_expired",
            )
            raise KeyError("unknown or expired token")

        key = self.keys.get(workspace_id, record.key_id)
        aad = f"{workspace_id}|{token}".encode()
        plaintext = AESGCM(key).decrypt(record.nonce, record.ciphertext, aad).decode("utf-8")

        self.audit.record(
            "dlp.detokenize",
            actor=actor,
            token=token,
            purpose=purpose,
            workspace_id=workspace_id,
        )
        return plaintext


# ── Factory helper ───────────────────────────────────────────────────────


def create_dev_vault(master_secret: str | None = None) -> SecureTokenVault:
    """Create a vault suitable for development with in-memory storage."""
    secret = master_secret or os.environ.get("DLP_VAULT_SECRET", "dev-vault-secret-change-me")
    return SecureTokenVault(
        store=InMemoryVaultStore(),
        keys=EnvKeyProvider(secret),
        audit=LogAuditSink(),
    )
