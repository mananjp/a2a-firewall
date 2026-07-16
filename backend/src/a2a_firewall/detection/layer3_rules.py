from __future__ import annotations

import json
import re
from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.db.models import PolicyRule

INJECTION_PATTERNS: list[str] = [
    r"ignore (all |your )?(previous |prior )?instructions",
    r"you are now",
    r"act as",
    r"forget your",
    r"disregard",
    r"new task:",
    r"system:",
    r"\[system\]",
]

# Agent capabilities mapped to allowed task_type values
AGENT_CAPABILITY_TASKS: dict[str, list[str]] = {
    "customer service": ["investigation", "status_update", "payment_request", "identity_check"],
    "fraud investigation": [
        "investigation",
        "payment_hold",
        "payment_approval",
        "status_update",
        "verification_request",
        "identity_verification",
        "transaction_report",
        "risk_assessment",
    ],
    "kyc agent": [
        "identity_verification",
        "verification_request",
        "compliance_check",
        "kyc_status",
    ],
    "payments agent": [
        "payment_request",
        "payment_hold",
        "payment_approval",
        "compliance_check",
        "payment_confirmation",
        "transaction_report",
        "risk_assessment",
    ],
}

# Task types that involve financial transactions
FINANCIAL_TASK_TYPES = {
    "payment_request",
    "payment_hold",
    "payment_approval",
    "wire_transfer",
    "payment_processing",
    "compliance_check",
}

# ── Resource sensitivity map: resource_type → base risk for certain actions ──
SENSITIVE_RESOURCES: dict[str, dict[str, float]] = {
    "payment": {
        "read": 0.0,
        "write": 0.3,
        "transfer": 0.5,
        "approve": 0.4,
        "delete": 0.8,
        "*": 0.2,
    },
    "account": {"read": 0.1, "write": 0.4, "transfer": 0.5, "delete": 0.9, "*": 0.3},
    "customer_data": {"read": 0.2, "write": 0.5, "delete": 0.9, "export": 0.7, "*": 0.4},
    "policy": {"write": 0.6, "delete": 0.7, "*": 0.3},
    "identity": {"read": 0.3, "write": 0.6, "verify": 0.0, "delete": 0.9, "*": 0.4},
    "key": {"read": 0.8, "write": 1.0, "rotate": 0.9, "delete": 1.0, "*": 0.7},
}

HIGH_RISK_ACTIONS = {
    "delete",
    "transfer",
    "approve_payment",
    "escalate",
    "impersonate",
    "delegate_all",
}


SUSPICIOUS_BENEFICIARY_PATTERNS = [
    r"(?i)shell\b",
    r"(?i)offshore",
    r"(?i)bearer",
    r"(?i)numbered\s*account",
    r"(?i)panama",
    r"(?i)cayman",
]

SUSPICIOUS_ACCOUNT_PATTERNS = [
    r"(?i)offshore",
    r"(?i)hidden",
    r"(?i)shell",
]

DELEGATION_ABUSE_PATTERNS: list[tuple[str, float, str]] = [
    (r"delegate_payment.*true", 0.5, "unauthorized_delegation"),
    (r"payment_scope.*unlimited", 0.6, "unlimited_scope_delegation"),
    (r"unrestricted", 0.4, "unrestricted_access"),
]


async def run_rules(
    request_data: dict[str, Any], sender: Any, workspace: Any, db: AsyncSession
) -> dict[str, Any]:
    violations: list[dict[str, Any]] = []
    risk_delta = 0.0
    matched_rule_id: str | None = None
    matched_rule_action: str | None = None

    payload = request_data.get("payload", {})
    payload_str = json.dumps(payload).lower()
    task_type = request_data.get("task_type", "")

    # ── Injection pattern scan ──
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, payload_str, re.IGNORECASE):
            violations.append(
                {
                    "layer": "rule",
                    "violation_type": "forbidden_pattern",
                    "severity": "high",
                    "details": {"pattern": pattern},
                }
            )
            risk_delta = min(1.0, risk_delta + 0.8)

    # ── Resource sensitivity ──
    resource_type = request_data.get("resource_type")
    resource_id = request_data.get("resource_id")
    action = request_data.get("action")
    if resource_type and action:
        action_map = SENSITIVE_RESOURCES.get(resource_type.lower())
        if action_map:
            base = action_map.get(action.lower()) or action_map.get("*", 0.0)
            if base > 0:
                violations.append(
                    {
                        "layer": "rule",
                        "violation_type": "sensitive_resource_access",
                        "severity": "medium" if base < 0.5 else "high",
                        "details": {
                            "resource_type": resource_type,
                            "resource_id": resource_id,
                            "action": action,
                            "base_risk": base,
                        },
                    }
                )
                risk_delta = min(1.0, risk_delta + base)

    # ── High-risk action (regardless of resource) ──
    if action and action.lower() in HIGH_RISK_ACTIONS:
        violations.append(
            {
                "layer": "rule",
                "violation_type": "high_risk_action",
                "severity": "high",
                "details": {"action": action},
            }
        )
        risk_delta = min(1.0, risk_delta + 0.4)

    # ── Capability mismatch ──
    allowed_tasks = AGENT_CAPABILITY_TASKS.get(sender.name.lower(), [])
    if task_type and allowed_tasks and task_type not in allowed_tasks:
        violations.append(
            {
                "layer": "rule",
                "violation_type": "capability_mismatch",
                "severity": "high",
                "details": {
                    "sender": sender.name,
                    "task_type": task_type,
                    "allowed": allowed_tasks,
                },
            }
        )
        risk_delta = min(1.0, risk_delta + 0.7)

    # ── Suspicious wire transfer ──
    amount = None
    beneficiary = None
    to_account = None
    if isinstance(payload, dict):
        amount = payload.get("amount")
        beneficiary = str(payload.get("beneficiary", "") or "")
        to_account = str(payload.get("to", "") or "")

    is_financial = task_type in FINANCIAL_TASK_TYPES or "initiate_wire" in str(
        payload.get("action", "")
    )

    if is_financial and amount is not None:
        try:
            amt = float(amount)
            if amt > 100000:
                violations.append(
                    {
                        "layer": "rule",
                        "violation_type": "high_value_transaction",
                        "severity": "high",
                        "details": {
                            "amount": amt,
                            "currency": payload.get("currency"),
                            "threshold": 100000,
                        },
                    }
                )
                risk_delta = min(1.0, risk_delta + 0.6)

                if amt > 500000:
                    violations.append(
                        {
                            "layer": "rule",
                            "violation_type": "extreme_value_transaction",
                            "severity": "critical",
                            "details": {"amount": amt},
                        }
                    )
                    risk_delta = min(1.0, risk_delta + 0.3)

        except (ValueError, TypeError):
            pass

        # Suspicious beneficiary name
        if beneficiary:
            for bpat in SUSPICIOUS_BENEFICIARY_PATTERNS:
                if re.search(bpat, beneficiary):
                    violations.append(
                        {
                            "layer": "rule",
                            "violation_type": "suspicious_beneficiary",
                            "severity": "high",
                            "details": {"beneficiary": beneficiary[:100], "pattern": bpat},
                        }
                    )
                    risk_delta = min(1.0, risk_delta + 0.5)
                    break

        # Suspicious destination account
        if to_account:
            for apat in SUSPICIOUS_ACCOUNT_PATTERNS:
                if re.search(apat, to_account):
                    violations.append(
                        {
                            "layer": "rule",
                            "violation_type": "suspicious_destination",
                            "severity": "high",
                            "details": {"account": to_account[:100], "pattern": apat},
                        }
                    )
                    risk_delta = min(1.0, risk_delta + 0.4)
                    break

    # ── Delegation abuse ──
    for dpat, drisk, dtype in DELEGATION_ABUSE_PATTERNS:
        if re.search(dpat, payload_str):
            violations.append(
                {
                    "layer": "rule",
                    "violation_type": dtype,
                    "severity": "critical",
                    "details": {"pattern": dpat},
                }
            )
            risk_delta = min(1.0, risk_delta + drisk)

    # ── DB-stored policy rules (unchanged) ──
    result = await db.execute(
        select(PolicyRule)
        .where(
            PolicyRule.workspace_id == workspace.id,
            PolicyRule.is_active.is_(True),
        )
        .order_by(PolicyRule.priority)
    )
    rules = result.scalars().all()
    for rule in rules:
        if not _rule_matches(rule, request_data, sender):
            continue
        matched_rule_id = str(rule.id)
        matched_rule_action = cast(str, rule.action) if rule.action else None
        if rule.action == "block":
            violations.append(
                {
                    "layer": "policy",
                    "violation_type": "policy_rule_triggered",
                    "severity": "high",
                    "details": {"rule": rule.name},
                }
            )
            risk_delta = 1.0
        break

    return {
        "violations": violations,
        "risk_delta": risk_delta,
        "matched_rule_id": matched_rule_id,
        "matched_rule_action": matched_rule_action,
    }


def _rule_matches(rule: Any, request_data: dict[str, Any], sender: Any) -> bool:
    if rule.sender_id and str(rule.sender_id) != str(sender.id):
        return False
    if rule.task_type and rule.task_type != request_data.get("task_type"):
        return False
    if rule.condition_expr:
        for key, val in rule.condition_expr.items():
            actual = request_data.get(key)
            if (
                actual is None
                or (isinstance(val, list) and actual not in val)
                or (not isinstance(val, list) and actual != val)
            ):
                return False
    return True
