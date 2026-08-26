"""Role-Based Access Control (RBAC) with Fine-Grained Permissioning.

Defines standard role matrices, fine-grained capability tokens, and authorization checkers.
"""

from __future__ import annotations

from typing import Any

# Complete registry of fine-grained permissions
ALL_PERMISSIONS: dict[str, str] = {
    # Spend & Budget Governance
    "spend:read": "View workspace and agent budget allocations, spend usage, and ledgers",
    "spend:manage": "Configure and update workspace and agent monthly budgets and hard limit actions",
    # Policies & Guardrails
    "policies:read": "View firewall rules and policy definitions",
    "policies:write": "Create, edit, reorder, and delete firewall policy rules",
    # Agents & Schemas
    "agents:read": "View registered agents, identity keys, and capabilities",
    "agents:write": "Register, update, suspend, and reactivate agents and schemas",
    # Enterprise Audit Logs
    "audit:read": "View enterprise audit logs and delegation chains",
    "audit:export": "Export CSV/JSON audit packages and cryptographic evidence",
    # Compliance & Observability
    "compliance:read": "View compliance posture scores, framework rules, and gap reports",
    "compliance:manage": "Install or remove compliance packs and export regulatory audit packages",
    # Data Retention & Privacy
    "retention:read": "View data retention periods and storage consumption stats",
    "retention:manage": "Configure data aging periods, PII auto-scrubbing, and run manual purges",
    # Network Security & IP Allowlisting
    "network:read": "View network access rules and IP allowlist entries",
    "network:manage": "Configure network CIDR rules, IP allowlists, and traffic boundaries",
    # SCIM & Identity
    "scim:manage": "Manage SCIM 2.0 provisioning tokens and identity synchronization",
    # SOC & Triage
    "soc:read": "View SOC security alerts, MITRE mappings, and live threat feed",
    "soc:write": "Acknowledge, investigate, assign, and resolve SOC security alerts",
    # Team & RBAC Management
    "members:read": "View workspace team members and role assignments",
    "members:manage": "Invite, update roles, edit permissions, and remove workspace members",
}

# Standard built-in role permission matrices
STANDARD_ROLES: dict[str, dict[str, Any]] = {
    "admin": {
        "name": "Administrator",
        "description": "Full access to all firewall settings, security policies, budgets, members, and audit logs.",
        "permissions": ["*"],
    },
    "security_admin": {
        "name": "Security Administrator",
        "description": "Manage security policies, network rules, IP allowlists, data retention, compliance, and IPS.",
        "permissions": [
            "policies:read", "policies:write",
            "network:read", "network:manage",
            "retention:read", "retention:manage",
            "compliance:read", "compliance:manage",
            "spend:read",
            "audit:read", "audit:export",
            "agents:read", "agents:write",
            "soc:read", "soc:write",
            "members:read",
        ],
    },
    "soc_analyst": {
        "name": "SOC Analyst",
        "description": "Investigate security violations, triage alerts, inspect traces, and review quarantined tasks.",
        "permissions": [
            "soc:read", "soc:write",
            "audit:read",
            "compliance:read",
            "agents:read",
            "policies:read",
            "telemetry:read",
            "network:read",
            "spend:read",
        ],
    },
    "auditor": {
        "name": "Compliance & Security Auditor",
        "description": "Read-only access to all audit logs, delegation chains, compliance posture, and export features.",
        "permissions": [
            "audit:read", "audit:export",
            "compliance:read", "compliance:manage",
            "spend:read",
            "policies:read",
            "network:read",
            "retention:read",
            "agents:read",
            "soc:read",
            "members:read",
        ],
    },
    "developer": {
        "name": "Developer / Integration Engineer",
        "description": "Register and manage agents, test task schemas, run simulations, and view debugging telemetry.",
        "permissions": [
            "agents:read", "agents:write",
            "policies:read",
            "spend:read",
            "soc:read",
            "audit:read",
        ],
    },
    "viewer": {
        "name": "Read-Only Viewer",
        "description": "General overview and dashboard read-only visibility.",
        "permissions": [
            "spend:read",
            "policies:read",
            "agents:read",
            "compliance:read",
            "network:read",
            "retention:read",
            "soc:read",
            "audit:read",
            "members:read",
        ],
    },
}


def has_permission(
    role: str,
    custom_permissions: list[str] | None,
    required_permission: str,
) -> bool:
    """Evaluate whether a role + custom permission overrides grant the requested permission."""
    if role == "admin":
        return True

    # Check custom permission overrides first
    perms = set(custom_permissions or [])
    if "*" in perms or required_permission in perms:
        return True

    # Wildcard prefix match (e.g. "spend:*" matches "spend:read")
    req_domain = required_permission.split(":")[0] if ":" in required_permission else ""
    if f"{req_domain}:*" in perms:
        return True

    # Check standard role default permissions
    role_def = STANDARD_ROLES.get(role)
    if role_def:
        role_perms = set(role_def.get("permissions", []))
        if "*" in role_perms or required_permission in role_perms:
            return True
        if f"{req_domain}:*" in role_perms:
            return True

    return False


def get_role_permissions(role: str, custom_permissions: list[str] | None = None) -> list[str]:
    """Return the effective list of permissions for a role with overrides."""
    if role == "admin":
        return list(ALL_PERMISSIONS.keys())
    role_def = STANDARD_ROLES.get(role, {})
    base = set(role_def.get("permissions", []))
    if custom_permissions:
        base.update(custom_permissions)
    return sorted(list(base))
