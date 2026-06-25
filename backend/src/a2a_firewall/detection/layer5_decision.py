from __future__ import annotations

from typing import Any


def make_decision(risk_score: float, matched_rule_action: str | None, workspace: Any) -> str:
    if matched_rule_action == "block":
        return "block"
    if matched_rule_action == "allow":
        return "allow"
    if matched_rule_action == "review":
        return "review"
    if risk_score >= workspace.block_threshold:
        return "block"
    if risk_score >= 0.5:
        return "review"
    return "allow"
