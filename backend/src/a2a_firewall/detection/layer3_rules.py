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


async def run_rules(
    request_data: dict[str, Any], sender: Any, workspace: Any, db: AsyncSession
) -> dict[str, Any]:
    violations: list[dict[str, Any]] = []
    risk_delta = 0.0
    matched_rule_id: str | None = None
    matched_rule_action: str | None = None

    payload_str = json.dumps(request_data["payload"]).lower()
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
            risk_delta = min(1.0, risk_delta + 0.4)

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
    return not rule.task_type or rule.task_type == request_data.get("task_type")
