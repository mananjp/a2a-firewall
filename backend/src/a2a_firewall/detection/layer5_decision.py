from __future__ import annotations

from typing import Any


def make_decision(risk_score: float, matched_rule_action: str | None, workspace: Any) -> str:
    if matched_rule_action == "block":
        return "block"
    if matched_rule_action == "allow":
        return "allow"
    if matched_rule_action == "review":
        return "review"
    _rt = getattr(workspace, "review_threshold", None)
    review_threshold = _rt if isinstance(_rt, (int, float)) else 0.5

    if risk_score >= workspace.block_threshold:
        return "block"
    if risk_score >= review_threshold:
        return "review"
    return "allow"
