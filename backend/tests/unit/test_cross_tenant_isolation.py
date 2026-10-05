"""Unit tests verifying cross-tenant isolation and remediation of CWE-639 / CWE-708."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from a2a_firewall.api.deps import (
    get_current_workspace,
    get_current_workspace_flexible,
)
from a2a_firewall.core.config import settings
from a2a_firewall.core.jwt_auth import create_access_token
from a2a_firewall.core.security import derive_workspace_signing_seed, hash_api_key
from a2a_firewall.db.models import AccountWorkspace, Workspace
from a2a_firewall.main import lifespan


@pytest.fixture
def account_a_id():
    return uuid.uuid4()


@pytest.fixture
def workspace_a():
    return Workspace(
        id=uuid.uuid4(),
        name="Workspace A",
        admin_email="alice@tenant-a.com",
        api_key_hash=hash_api_key("ws_key_a"),
        block_threshold=0.8,
        review_threshold=0.5,
        default_deny=False,
    )


@pytest.fixture
def workspace_b():
    return Workspace(
        id=uuid.uuid4(),
        name="Workspace B (Victim)",
        admin_email="bob@tenant-b.com",
        api_key_hash=hash_api_key("ws_key_b"),
        block_threshold=0.8,
        review_threshold=0.5,
        default_deny=False,
    )


@pytest.fixture
def token_account_a(account_a_id, workspace_a):
    return create_access_token(
        {
            "sub": str(account_a_id),
            "email": "alice@tenant-a.com",
            "workspace_id": str(workspace_a.id),
        }
    )


@pytest.mark.asyncio
async def test_jwt_cross_tenant_header_rejected_with_403(
    account_a_id, workspace_a, workspace_b, token_account_a
):
    """Attacker with valid JWT for Tenant A attempts to access Tenant B via X-Workspace-Id.
    Must raise 403 Forbidden.
    """
    mock_db = AsyncMock()

    # Membership query for (account_a, workspace_b) returns None (not a member)
    mock_mem_res = MagicMock()
    mock_mem_res.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_mem_res

    with pytest.raises(HTTPException) as exc_info:
        await get_current_workspace(
            authorization=f"Bearer {token_account_a}",
            x_session_token=None,
            x_workspace_key=None,
            x_workspace_id=str(workspace_b.id),
            db=mock_db,
        )

    assert exc_info.value.status_code == 403
    assert "Account does not belong to this workspace" in exc_info.value.detail


@pytest.mark.asyncio
async def test_jwt_invalid_x_workspace_id_format_rejected_with_400(token_account_a):
    """Supplying a non-UUID X-Workspace-Id with a JWT must raise 400 Bad Request."""
    mock_db = AsyncMock()

    with pytest.raises(HTTPException) as exc_info:
        await get_current_workspace(
            authorization=f"Bearer {token_account_a}",
            x_session_token=None,
            x_workspace_key=None,
            x_workspace_id="invalid-uuid-string",
            db=mock_db,
        )

    assert exc_info.value.status_code == 400
    assert "Invalid X-Workspace-Id header format" in exc_info.value.detail


@pytest.mark.asyncio
async def test_jwt_x_workspace_id_allowed_when_valid_member(
    account_a_id, workspace_b, token_account_a
):
    """Legitimate multi-tenant user who belongs to Workspace B can switch via X-Workspace-Id."""
    mock_db = AsyncMock()

    def mock_execute(stmt):
        sql = str(stmt)
        res = MagicMock()
        if "WHERE workspaces.api_key_hash" in sql:
            res.scalar_one_or_none.return_value = None
        elif "FROM account_workspaces" in sql:
            res.scalar_one_or_none.return_value = AccountWorkspace(
                account_id=account_a_id,
                workspace_id=workspace_b.id,
                role="member",
            )
        elif "WHERE workspaces.id" in sql:
            res.scalar_one_or_none.return_value = workspace_b
        return res

    mock_db.execute.side_effect = mock_execute

    resolved = await get_current_workspace(
        authorization=f"Bearer {token_account_a}",
        x_session_token=None,
        x_workspace_key=None,
        x_workspace_id=str(workspace_b.id),
        db=mock_db,
    )

    assert resolved.id == workspace_b.id
    assert resolved.name == "Workspace B (Victim)"


@pytest.mark.asyncio
async def test_jwt_flexible_cross_tenant_header_rejected_with_403(
    account_a_id, workspace_b, token_account_a
):
    """get_current_workspace_flexible must also reject unauthenticated X-Workspace-Id with 403."""
    mock_db = AsyncMock()

    def mock_execute(stmt):
        res = MagicMock()
        res.scalar_one_or_none.return_value = None
        return res

    mock_db.execute.side_effect = mock_execute

    with pytest.raises(HTTPException) as exc_info:
        await get_current_workspace_flexible(
            authorization=f"Bearer {token_account_a}",
            x_workspace_id=str(workspace_b.id),
            db=mock_db,
        )

    assert exc_info.value.status_code == 403
    assert "Account does not belong to this workspace" in exc_info.value.detail


@pytest.mark.asyncio
async def test_workspace_api_key_mismatched_x_workspace_id_rejected_with_403(
    workspace_a, workspace_b
):
    """A valid API key for Workspace A accompanied by X-Workspace-Id: Workspace B must raise 403."""
    mock_db = AsyncMock()

    mock_ws_res = MagicMock()
    mock_ws_res.scalar_one_or_none.return_value = workspace_a
    mock_db.execute.return_value = mock_ws_res

    with pytest.raises(HTTPException) as exc_info:
        await get_current_workspace(
            authorization="Bearer ws_key_a",
            x_session_token=None,
            x_workspace_key=None,
            x_workspace_id=str(workspace_b.id),
            db=mock_db,
        )

    assert exc_info.value.status_code == 403
    assert "Workspace API key does not match X-Workspace-Id" in exc_info.value.detail


@pytest.mark.asyncio
async def test_jwt_revoked_claim_falls_through_to_owned_workspace(
    account_a_id, workspace_a, workspace_b
):
    """If JWT claims workspace_b but account_a is not a member, it must not return workspace_b."""
    mock_db = AsyncMock()

    stale_token = create_access_token(
        {
            "sub": str(account_a_id),
            "email": "alice@tenant-a.com",
            "workspace_id": str(workspace_b.id),  # Stale or forged claim
        }
    )

    def mock_execute(stmt):
        sql = str(stmt)
        res = MagicMock()
        if "WHERE workspaces.api_key_hash" in sql:
            res.scalar_one_or_none.return_value = None
        elif "FROM account_workspaces" in sql and "JOIN" not in sql:
            # Direct check for workspace_b membership -> not a member
            res.scalar_one_or_none.return_value = None
        elif "JOIN account_workspaces" in sql:
            # 3c Join fallback to user's first workspace
            res.scalars.return_value.first.return_value = workspace_a
        else:
            res.scalar_one_or_none.return_value = None
            res.scalars.return_value.first.return_value = None
        return res

    mock_db.execute.side_effect = mock_execute

    resolved = await get_current_workspace(
        authorization=f"Bearer {stale_token}",
        x_session_token=None,
        x_workspace_key=None,
        x_workspace_id=None,
        db=mock_db,
    )

    assert resolved.id == workspace_a.id
    assert resolved.id != workspace_b.id


@pytest.mark.asyncio
async def test_delegation_root_key_derivation_is_pbkdf2_salted():
    """Verify that derive_workspace_signing_seed produces a 32-byte key that differs per workspace."""
    ws1 = str(uuid.uuid4())
    ws2 = str(uuid.uuid4())

    seed1 = derive_workspace_signing_seed(ws1)
    seed2 = derive_workspace_signing_seed(ws2)

    assert len(seed1) == 32
    assert len(seed2) == 32
    assert seed1 != seed2


@pytest.mark.asyncio
async def test_delegation_mint_and_orchestrator_verification_match(workspace_a):
    """Tokens minted via derive_workspace_signing_seed must verify successfully in orchestrator,
    while tokens minted with legacy truncated SHA-256 must fail verification.
    """
    from unittest.mock import patch

    from a2a_firewall.core.delegation import mint_token, token_to_compact, verify_token
    from a2a_firewall.db.models import Agent
    from a2a_firewall.detection.orchestrator import run_inspection

    ws_id = str(workspace_a.id)
    correct_seed = derive_workspace_signing_seed(ws_id)
    legacy_seed = hash_api_key(ws_id).encode()[:32]

    # Valid token minted with PBKDF2 seed
    token_valid = mint_token(correct_seed, ws_id, "agent-1", [f"workspace_id={ws_id}"])
    compact_valid = token_to_compact(token_valid)

    # Token minted with legacy SHA-256 seed
    token_legacy = mint_token(legacy_seed, ws_id, "agent-1", [f"workspace_id={ws_id}"])
    compact_legacy = token_to_compact(token_legacy)

    # 1. Direct cryptographic verification with orchestrator's derive_workspace_signing_seed
    res_valid = verify_token(token_valid, correct_seed)
    assert res_valid.valid is True

    res_mismatch = verify_token(token_legacy, correct_seed)
    assert res_mismatch.valid is False

    # 2. End-to-end check through orchestrator run_inspection
    mock_db = AsyncMock()
    mock_db.execute.return_value = MagicMock(
        scalar_one_or_none=MagicMock(return_value=None),
        scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[]))),
    )
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    sender = Agent(
        id=uuid.uuid4(),
        workspace_id=workspace_a.id,
        name="SenderAgent",
        api_key_hash="hash",
    )
    receiver_id = str(uuid.uuid4())

    req_valid = {
        "task_id": str(uuid.uuid4()),
        "receiver_agent_id": receiver_id,
        "task_type": "research",
        "schema_version": "v1",
        "payload": {"query": "safe test query"},
        "delegation_token": compact_valid,
    }

    with (
        patch("a2a_firewall.detection.orchestrator.check_agent", return_value=(True, 1)),
        patch("a2a_firewall.detection.orchestrator.preflight", return_value=None),
        patch(
            "a2a_firewall.detection.orchestrator.validate_schema", return_value={"violations": []}
        ),
        patch(
            "a2a_firewall.detection.orchestrator.check_permissions",
            return_value={"allowed": True, "check": "default_deny"},
        ),
        patch(
            "a2a_firewall.detection.orchestrator.run_rules",
            return_value={
                "violations": [],
                "risk_delta": 0.0,
                "matched_rule_id": None,
                "matched_rule_action": None,
            },
        ),
        patch(
            "a2a_firewall.detection.orchestrator.groq_inspect",
            new_callable=AsyncMock,
            return_value={
                "injection_detected": False,
                "injection_type": "none",
                "hallucination_flags": [],
                "risk_score_delta": 0.0,
                "rationale": "clean",
            },
        ),
    ):
        result_valid = await run_inspection(req_valid, sender, workspace_a, mock_db)
        violations_valid = [v["violation_type"] for v in result_valid.get("violations", [])]
        assert "invalid_delegation_token" not in violations_valid

        req_legacy = dict(req_valid)
        req_legacy["task_id"] = str(uuid.uuid4())
        req_legacy["delegation_token"] = compact_legacy

        result_legacy = await run_inspection(req_legacy, sender, workspace_a, mock_db)
        violations_legacy = [v["violation_type"] for v in result_legacy.get("violations", [])]
        assert "invalid_delegation_token" in violations_legacy
        assert result_legacy["risk_score"] == 1.0
        assert result_legacy["decision"] == "block"


@pytest.mark.asyncio
async def test_demo_personas_gated_by_enable_demo_personas(monkeypatch):
    """When ENABLE_DEMO_PERSONAS is False, demo personas cannot bypass authentication.
    When ENABLE_DEMO_PERSONAS is True, demo access is permitted.
    """
    from a2a_firewall.api.routes.auth import LoginRequest, _hash_password, login

    mock_db = AsyncMock()
    ws = Workspace(
        id=uuid.uuid4(),
        name="Admin Workspace",
        admin_email="admin@a2afirewall.dev",
        api_key_hash="hash",
        password_hash=_hash_password("admin12345"),
    )

    mock_ws_res = MagicMock()
    mock_ws_res.scalar_one_or_none.return_value = ws
    mock_db.execute.return_value = mock_ws_res

    # 1. When ENABLE_DEMO_PERSONAS is False (default)
    monkeypatch.setattr(settings, "ENABLE_DEMO_PERSONAS", False)

    # Calling with no password -> 401
    with pytest.raises(HTTPException) as exc_info:
        await login(LoginRequest(email="admin@a2afirewall.dev", password=None), db=mock_db)
    assert exc_info.value.status_code == 401

    # Calling with wrong password -> 401
    with pytest.raises(HTTPException) as exc_info:
        await login(
            LoginRequest(email="admin@a2afirewall.dev", password="wrongpassword"),
            db=mock_db,
        )
    assert exc_info.value.status_code == 401

    # Auditor persona without password -> 401
    with pytest.raises(HTTPException) as exc_info:
        await login(LoginRequest(email="auditor@a2afirewall.dev", password=None), db=mock_db)
    assert exc_info.value.status_code == 401

    # 2. When ENABLE_DEMO_PERSONAS is True
    monkeypatch.setattr(settings, "ENABLE_DEMO_PERSONAS", True)
    mock_agents_res = MagicMock()
    mock_agents_res.scalars.return_value.all.return_value = [MagicMock()]
    mock_db.execute.side_effect = [
        mock_ws_res,
        mock_agents_res,
        MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
        MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
    ]

    resp = await login(LoginRequest(email="admin@a2afirewall.dev"), db=mock_db)
    assert resp["account"]["tier"] == "enterprise"
    assert "session_token" in resp


@pytest.mark.asyncio
async def test_standard_login_password_bypass_prevented(workspace_a):
    """Standard login must not bypass password verification when password is None or empty."""
    from a2a_firewall.api.routes.auth import LoginRequest, _hash_password, login

    workspace_a.password_hash = _hash_password("correct-horse-battery-staple")
    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = workspace_a
    mock_db.execute.return_value = mock_res

    # Missing password
    with pytest.raises(HTTPException) as exc_info:
        await login(LoginRequest(email=workspace_a.admin_email, password=None), db=mock_db)
    assert exc_info.value.status_code == 401
    assert "Invalid email or password" in exc_info.value.detail

    # Empty string password
    with pytest.raises(HTTPException) as exc_info:
        await login(LoginRequest(email=workspace_a.admin_email, password=""), db=mock_db)
    assert exc_info.value.status_code == 401

    # Wrong password
    with pytest.raises(HTTPException) as exc_info:
        await login(LoginRequest(email=workspace_a.admin_email, password="wrong"), db=mock_db)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_production_startup_fails_closed_on_default_secrets(monkeypatch):
    """Server must fail-closed at startup if SENTRY_ENVIRONMENT is production with default keys."""
    monkeypatch.setattr(settings, "SENTRY_ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "SECRET_KEY", "test-secret-key")
    monkeypatch.setattr(settings, "API_KEY_SALT", "test-salt")

    mock_app = MagicMock()
    with pytest.raises(RuntimeError) as exc_info:
        async with lifespan(mock_app):
            pass

    assert "FATAL: Insecure default credentials detected in production" in str(exc_info.value)


@pytest.mark.asyncio
async def test_non_debug_startup_fails_closed_on_default_secrets(monkeypatch):
    """In non-debug environment outside tests, default secrets must cause startup failure."""
    monkeypatch.setattr(settings, "DEBUG", False)
    monkeypatch.setattr(settings, "SENTRY_ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "SECRET_KEY", "test-secret-key")
    monkeypatch.setattr(settings, "API_KEY_SALT", "test-salt")
    monkeypatch.setenv("TESTING", "0")
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)

    mock_app = MagicMock()
    with pytest.raises(RuntimeError) as exc_info:
        async with lifespan(mock_app):
            pass

    assert "FATAL: Insecure default credentials detected in non-debug environment" in str(
        exc_info.value
    )


@pytest.mark.asyncio
async def test_production_startup_rejects_demo_personas(monkeypatch):
    """Production startup must fail closed if ENABLE_DEMO_PERSONAS is True."""
    monkeypatch.setattr(settings, "SENTRY_ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ENABLE_DEMO_PERSONAS", True)
    monkeypatch.setattr(settings, "SECRET_KEY", "super-strong-non-default-secret-key-12345")
    monkeypatch.setattr(settings, "API_KEY_SALT", "super-strong-non-default-salt-67890")
    monkeypatch.setenv("TESTING", "0")
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)

    mock_app = MagicMock()
    with pytest.raises(RuntimeError) as exc_info:
        async with lifespan(mock_app):
            pass

    assert "FATAL: ENABLE_DEMO_PERSONAS is enabled in production" in str(exc_info.value)
