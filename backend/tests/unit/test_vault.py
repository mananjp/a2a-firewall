# Copyright (c) 2026 Manan Jayeshkumar Panchal.
# Licensed under the Apache License, Version 2.0.
"""Unit tests for the secure DLP token vault (core/vault.py)."""

from __future__ import annotations

import pytest

from a2a_firewall.core.vault import (
    EnvKeyProvider,
    InMemoryVaultStore,
    NullAuditSink,
    SecureTokenVault,
)


@pytest.fixture()
def vault() -> SecureTokenVault:
    return SecureTokenVault(
        store=InMemoryVaultStore(),
        keys=EnvKeyProvider("test-master-secret"),
        audit=NullAuditSink(),
    )


class TestTokenize:
    def test_tokenize_returns_opaque_token(self, vault: SecureTokenVault) -> None:
        token = vault.tokenize(
            workspace_id="ws1",
            entity_type="credit_card",
            value="4111-1111-1111-1111",
        )
        assert token.startswith("tok_credit_card_")
        assert "4111" not in token

    def test_tokenize_same_value_returns_same_token(self, vault: SecureTokenVault) -> None:
        t1 = vault.tokenize(workspace_id="ws1", entity_type="email", value="test@example.com")
        t2 = vault.tokenize(workspace_id="ws1", entity_type="email", value="test@example.com")
        assert t1 == t2

    def test_tokenize_different_workspace_different_token(self, vault: SecureTokenVault) -> None:
        t1 = vault.tokenize(workspace_id="ws1", entity_type="ssn", value="123-45-6789")
        t2 = vault.tokenize(workspace_id="ws2", entity_type="ssn", value="123-45-6789")
        assert t1 != t2

    def test_tokenize_different_value_different_token(self, vault: SecureTokenVault) -> None:
        t1 = vault.tokenize(workspace_id="ws1", entity_type="email", value="a@test.com")
        t2 = vault.tokenize(workspace_id="ws1", entity_type="email", value="b@test.com")
        assert t1 != t2


class TestDetokenize:
    def test_detokenize_roundtrip(self, vault: SecureTokenVault) -> None:
        token = vault.tokenize(workspace_id="ws1", entity_type="pii", value="sensitive-data-123")
        result = vault.detokenize(
            workspace_id="ws1", token=token, actor="tester", purpose="unit-test"
        )
        assert result == "sensitive-data-123"

    def test_detokenize_unknown_token_raises(self, vault: SecureTokenVault) -> None:
        with pytest.raises(KeyError, match="unknown or expired"):
            vault.detokenize(
                workspace_id="ws1",
                token="tok_pii_nonexistent",
                actor="tester",
                purpose="test",
            )

    def test_detokenize_wrong_workspace_raises(self, vault: SecureTokenVault) -> None:
        token = vault.tokenize(workspace_id="ws1", entity_type="pii", value="secret")
        with pytest.raises(KeyError, match="unknown or expired"):
            vault.detokenize(workspace_id="ws2", token=token, actor="tester", purpose="test")


class TestAADTamper:
    def test_aad_prevents_cross_workspace_decryption(self, vault: SecureTokenVault) -> None:
        """Even if we manually move a record to another workspace's store,
        the AAD binding would cause decryption to fail."""
        token = vault.tokenize(workspace_id="ws1", entity_type="pii", value="secret")
        # Normal detokenize works
        assert (
            vault.detokenize(workspace_id="ws1", token=token, actor="tester", purpose="test")
            == "secret"
        )
        # Different workspace can't find the token
        with pytest.raises(KeyError):
            vault.detokenize(workspace_id="ws2", token=token, actor="tester", purpose="test")


class TestAuditSink:
    def test_tokenize_is_audited(self, vault: SecureTokenVault) -> None:
        audit = vault.audit
        assert isinstance(audit, NullAuditSink)
        vault.tokenize(workspace_id="ws1", entity_type="pii", value="test")
        assert len(audit.events) == 1
        assert audit.events[0][0] == "dlp.tokenize"

    def test_detokenize_is_audited(self, vault: SecureTokenVault) -> None:
        audit = vault.audit
        assert isinstance(audit, NullAuditSink)
        token = vault.tokenize(workspace_id="ws1", entity_type="pii", value="test")
        vault.detokenize(workspace_id="ws1", token=token, actor="tester", purpose="audit-check")
        assert any(e[0] == "dlp.detokenize" for e in audit.events)

    def test_denied_detokenize_is_audited(self, vault: SecureTokenVault) -> None:
        audit = vault.audit
        assert isinstance(audit, NullAuditSink)
        with pytest.raises(KeyError):
            vault.detokenize(
                workspace_id="ws1",
                token="tok_pii_bad",
                actor="tester",
                purpose="test",
            )
        assert any(e[0] == "dlp.detokenize.denied" for e in audit.events)


class TestExpiration:
    def test_expired_token_denied(self, vault: SecureTokenVault) -> None:
        # Tokenize with 0-day TTL (immediately expired)
        token = vault.tokenize(workspace_id="ws1", entity_type="pii", value="ephemeral", ttl_days=0)
        with pytest.raises(KeyError, match="unknown or expired"):
            vault.detokenize(workspace_id="ws1", token=token, actor="tester", purpose="test")
