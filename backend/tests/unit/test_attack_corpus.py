"""Attack corpus regression tests.

Each fixture in tests/attack_corpus/*.json describes an attack payload and
the expected detection outcome. We run each one through the appropriate
detection layer (preflight or run_rules) and assert the expected violation
type, decision, and risk score.

These are pure unit tests — they mock the DB.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from a2a_firewall.detection.layer0_preflight import preflight
from a2a_firewall.detection.layer3_rules import run_rules

CORPUS_DIR = Path(__file__).parent.parent / "attack_corpus"


def _load_fixtures() -> list[dict[str, Any]]:
    return [json.loads(p.read_text()) for p in sorted(CORPUS_DIR.glob("*.json"))]


def _mock_db_no_rules() -> AsyncMock:
    db = AsyncMock()
    execute_result = MagicMock()
    execute_result.scalars.return_value.all.return_value = []
    db.execute.return_value = execute_result
    return db


def _sender() -> MagicMock:
    s = MagicMock()
    s.id = uuid.uuid4()
    s.status = "active"
    return s


def _workspace() -> MagicMock:
    w = MagicMock()
    w.id = uuid.uuid4()
    w.block_threshold = 0.8
    w.groq_threshold = 0.3
    w.default_deny = True
    return w


@pytest.mark.asyncio
@pytest.mark.parametrize("fixture", _load_fixtures(), ids=lambda f: f["name"])
async def test_attack_corpus(fixture: dict[str, Any]) -> None:
    sender = _sender()
    workspace = _workspace()
    db = _mock_db_no_rules()

    payload = dict(fixture.get("payload", {}))

    # Special case: giant_payload — build payload sized to the target.
    if "payload_size_target_bytes" in fixture:
        target = fixture["payload_size_target_bytes"]
        payload["big"] = "x" * target

    request_data: dict[str, Any] = {
        "task_id": str(uuid.uuid4()),
        "task_type": fixture.get("task_type", "research"),
        "schema_version": "v1",
        "depth": fixture.get("depth", 0),
        "payload": payload,
        "receiver_agent_id": (
            str(sender.id) if fixture.get("use_sender_as_receiver") else str(uuid.uuid4())
        ),
    }
    payload_str = json.dumps(payload, sort_keys=True)
    payload_size = len(payload_str.encode())

    # ---------- Preflight (always run) ----------
    pre = await preflight(request_data, sender, workspace, payload_size, db)
    expected_decision = fixture["expected_decision"]

    if pre and pre.get("block"):
        # Preflight blocked it (circular, depth, size, etc.).
        actual_violations = pre.get("violations", [])
        actual_violation_types = [v["violation_type"] for v in actual_violations]
        assert expected_decision == "block", (
            f"Fixture '{fixture['name']}' expected decision={expected_decision} "
            f"but preflight blocked with reason={pre.get('reason')}"
        )
        for vt in fixture.get("expected_violation_types", []):
            assert vt in actual_violation_types, (
                f"Fixture '{fixture['name']}' missing expected violation "
                f"{vt}; got {actual_violation_types}"
            )
        if "expected_block_reason" in fixture:
            assert pre.get("reason") == fixture["expected_block_reason"], (
                f"Fixture '{fixture['name']}' expected reason "
                f"{fixture['expected_block_reason']} but got {pre.get('reason')}"
            )
        return

    # ---------- Rules (when preflight passed) ----------
    rule_result = await run_rules(request_data, sender, workspace, db)
    actual_violations = rule_result["violations"]
    actual_violation_types = [v["violation_type"] for v in actual_violations]
    risk_delta = rule_result["risk_delta"]

    expected_violations = fixture.get("expected_violation_types", [])
    for vt in expected_violations:
        assert vt in actual_violation_types, (
            f"Fixture '{fixture['name']}' missing expected violation "
            f"{vt}; got {actual_violation_types}"
        )

    if "expected_min_risk_score" in fixture:
        assert risk_delta >= fixture["expected_min_risk_score"], (
            f"Fixture '{fixture['name']}' expected risk_delta >= "
            f"{fixture['expected_min_risk_score']} but got {risk_delta}"
        )

    # If expected_decision is "allow", rule layer should not have produced
    # forbidden_pattern violations (they would have escalated risk above
    # the block threshold).
    if expected_decision == "allow":
        assert "forbidden_pattern" not in actual_violation_types, (
            f"Fixture '{fixture['name']}' expected allow but got forbidden_pattern violations"
        )
