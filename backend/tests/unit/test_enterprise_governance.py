"""Comprehensive Unit Tests for Enterprise Security & Governance Features:

1. Admins set user and org spend limits
2. Role-based access with fine-grained permissioning (RBAC)
3. System for Cross-domain Identity Management (SCIM 2.0)
4. Comprehensive enterprise audit logs
5. Compliance API for observability & monitoring
6. Custom data retention controls
7. Network-level access control
8. IP allowlisting
"""

import uuid
from datetime import datetime, timedelta
import pytest
from unittest.mock import AsyncMock, MagicMock

from a2a_firewall.core.spend_manager import (
    calculate_cost_usd,
    check_spend_limits,
    estimate_tokens,
)
from a2a_firewall.core.rbac_manager import (
    ALL_PERMISSIONS,
    STANDARD_ROLES,
    get_role_permissions,
    has_permission,
)
from a2a_firewall.core.network_security import (
    check_ip_allowlist,
    check_network_access_rules,
    extract_client_ip,
    ip_in_network,
)
from a2a_firewall.core.retention_engine import (
    MINIMUM_COMPLIANCE_DAYS,
)
from a2a_firewall.api.routes.scim import _to_scim_user
from a2a_firewall.db.models import (
    IpAllowlistEntry,
    NetworkAccessRule,
    Workspace,
    WorkspaceMember,
    WorkspaceSpendLimit,
)


# ---------------------------------------------------------------------------
# 1. Spend Limits & Cost Governance Tests
# ---------------------------------------------------------------------------


def test_token_estimation_and_cost_calculation():
    # Test token estimation
    short_payload = {"action": "query", "user_id": 123}
    tokens = estimate_tokens(short_payload)
    assert tokens > 0

    large_payload = {"prompt": "A" * 4000}
    large_tokens = estimate_tokens(large_payload)
    assert large_tokens >= 1000

    # Test cost calculation
    cost_default = calculate_cost_usd(1_000_000)
    assert cost_default == 0.50

    cost_gpt_oss = calculate_cost_usd(1_000_000, "openai/gpt-oss-120b")
    assert cost_gpt_oss == 0.59


@pytest.mark.asyncio
async def test_spend_limit_enforcement_blocking():
    db = AsyncMock()
    ws_id = uuid.uuid4()

    # Mock workspace limit with budget $10, and spent $9.99
    ws_limit = WorkspaceSpendLimit(
        workspace_id=ws_id,
        monthly_budget_usd=10.0,
        token_budget=100_000,
        current_spend_usd=9.99,
        current_tokens=99_000,
        hard_limit_action="block",
        alert_threshold_pct=80.0,
    )

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = ws_limit
    db.execute.return_value = mock_res

    # Check with 10,000 tokens (will exceed token budget and spend)
    result = await check_spend_limits(ws_id, None, 10_000, db)
    assert result["allowed"] is False
    assert result["reason"] == "workspace_spend_limit_exceeded"


# ---------------------------------------------------------------------------
# 2. RBAC & Fine-Grained Permissioning Tests
# ---------------------------------------------------------------------------


def test_rbac_standard_roles_permissions():
    # Admin has all permissions
    assert has_permission("admin", [], "spend:manage") is True
    assert has_permission("admin", [], "network:manage") is True
    assert has_permission("admin", [], "any:arbitrary:perm") is True

    # Security admin can manage policies & network, but not scim:manage by default
    assert has_permission("security_admin", [], "policies:write") is True
    assert has_permission("security_admin", [], "network:manage") is True
    assert has_permission("security_admin", [], "scim:manage") is False

    # Auditor has read & export access, cannot write policies
    assert has_permission("auditor", [], "audit:read") is True
    assert has_permission("auditor", [], "audit:export") is True
    assert has_permission("auditor", [], "policies:write") is False

    # Viewer has read-only access
    assert has_permission("viewer", [], "spend:read") is True
    assert has_permission("viewer", [], "spend:manage") is False


def test_rbac_custom_permission_overrides():
    # Developer granted spend:manage override
    assert has_permission("developer", ["spend:manage"], "spend:manage") is True
    # Wildcard override
    assert has_permission("developer", ["compliance:*"], "compliance:manage") is True
    assert has_permission("developer", ["compliance:*"], "compliance:read") is True


# ---------------------------------------------------------------------------
# 3. SCIM 2.0 User Representation Tests
# ---------------------------------------------------------------------------


def test_scim_user_schema_formatting():
    m = WorkspaceMember(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        email="alex@company.com",
        name="Alex River",
        role="security_admin",
        is_active=True,
        scim_external_id="okta-user-12345",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    scim_obj = _to_scim_user(m)
    assert scim_obj["schemas"] == ["urn:ietf:params:scim:schemas:core:2.0:User"]
    assert scim_obj["userName"] == "alex@company.com"
    assert scim_obj["displayName"] == "Alex River"
    assert scim_obj["name"]["givenName"] == "Alex"
    assert scim_obj["name"]["familyName"] == "River"
    assert scim_obj["externalId"] == "okta-user-12345"
    assert scim_obj["active"] is True
    assert scim_obj["roles"][0]["value"] == "security_admin"


# ---------------------------------------------------------------------------
# 4. Network Security & IP Allowlisting Tests
# ---------------------------------------------------------------------------


def test_ip_network_matching():
    # Single IP exact match
    assert ip_in_network("192.168.1.50", "192.168.1.50") is True
    assert ip_in_network("192.168.1.51", "192.168.1.50") is False

    # CIDR /24 subnet match
    assert ip_in_network("10.0.0.15", "10.0.0.0/24") is True
    assert ip_in_network("10.0.1.15", "10.0.0.0/24") is False

    # CIDR /16 subnet match
    assert ip_in_network("172.16.5.99", "172.16.0.0/16") is True


def test_extract_client_ip_headers():
    req = MagicMock()
    req.headers = {"cf-connecting-ip": "203.0.113.195"}
    assert extract_client_ip(req) == "203.0.113.195"

    req.headers = {"x-forwarded-for": "198.51.100.4, 10.0.0.1"}
    assert extract_client_ip(req) == "198.51.100.4"


@pytest.mark.asyncio
async def test_ip_allowlist_evaluation():
    db = AsyncMock()
    ws_id = uuid.uuid4()

    entry = IpAllowlistEntry(
        id=uuid.uuid4(),
        workspace_id=ws_id,
        cidr_or_ip="192.168.1.0/24",
        label="Corporate Office",
        scope="all",
        is_enabled=True,
        expires_at=None,
    )

    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = [entry]
    db.execute.return_value = mock_res

    # IP within range -> Allowed
    check_ok = await check_ip_allowlist("192.168.1.42", ws_id, "api", db)
    assert check_ok["allowed"] is True
    assert check_ok["enforced"] is True

    # IP outside range -> Blocked
    check_blocked = await check_ip_allowlist("8.8.8.8", ws_id, "api", db)
    assert check_blocked["allowed"] is False
    assert check_blocked["enforced"] is True


@pytest.mark.asyncio
async def test_network_access_rule_deny():
    db = AsyncMock()
    ws_id = uuid.uuid4()

    rule = NetworkAccessRule(
        id=uuid.uuid4(),
        workspace_id=ws_id,
        priority=10,
        name="Block Untrusted Subnet",
        source_cidr="198.51.100.0/24",
        destination_agent_id=None,
        action="deny",
        protocol="all",
        is_active=True,
    )

    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = [rule]
    db.execute.return_value = mock_res

    check = await check_network_access_rules("198.51.100.44", None, "http", ws_id, db)
    assert check["allowed"] is False
    assert "Block Untrusted Subnet" in check["rule_name"]


# ---------------------------------------------------------------------------
# 5. Data Retention & Compliance Floors Tests
# ---------------------------------------------------------------------------


def test_data_retention_compliance_floors():
    # Verify compliance minimum days are enforced
    assert MINIMUM_COMPLIANCE_DAYS["audit_logs"] >= 365
    assert MINIMUM_COMPLIANCE_DAYS["violations"] >= 90
    assert MINIMUM_COMPLIANCE_DAYS["soc_alerts"] >= 90
