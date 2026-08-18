"""Unit tests for Phase 3 — intent-binding.

Tests verify that the intent-drift detection fires correctly when:
1. Groq returns intent_consistency > threshold → violation, block
2. Groq returns intent_consistency < threshold → no violation, allow
3. No declared_intent → intent_consistency not evaluated
4. No delegation token → intent_consistency not evaluated
5. Threshold edge cases
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from a2a_firewall.detection.orchestrator import run_inspection

# ---------------------------------------------------------------------------
# Fake DB / model objects
# ---------------------------------------------------------------------------


@dataclass
class FakeWorkspace:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = "test-ws"
    fail_mode: str = "closed"
    groq_threshold: float = 0.3
    block_threshold: float = 0.8
    default_deny: bool = False


@dataclass
class FakeSender:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    workspace_id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = "test-sender"
    description: str = "Test agent"
    api_key_hash: str = "hash"
    status: str = "active"
    capabilities: list[str] = field(default_factory=list)


def _make_request(
    sender: FakeSender,
    workspace: FakeWorkspace,
    receiver_id: str | None = None,
    task_type: str = "research",
    payload: dict[str, Any] | None = None,
    delegation_token: str | None = None,
    declared_intent: str | None = None,
    root_task_id: str | None = None,
) -> dict[str, Any]:
    task_id = str(uuid.uuid4())
    return {
        "task_id": task_id,
        "receiver_agent_id": receiver_id or str(uuid.uuid4()),
        "task_type": task_type,
        "schema_version": "v1",
        "payload": payload or {"query": "test query"},
        "root_task_id": root_task_id or task_id,
        "parent_task_id": None,
        "depth": 0,
        "delegation_token": delegation_token,
        "declared_intent": declared_intent,
    }


class FakeScalarResult:
    """Wraps a value so .scalar_one_or_none() returns it."""

    def __init__(self, value: Any = None):
        self._value = value

    def scalar_one_or_none(self) -> Any:
        return self._value

    def scalar_one(self) -> Any:
        return self._value


def _make_fake_db(permissions_allowed: bool = True) -> AsyncMock:
    """Create a fake AsyncSession that returns proper scalar results."""
    db = AsyncMock()

    # Default: return FakeScalarResult(None) for all queries
    # This makes identity lookups return None (no registered identity)
    # and permission lookups fall through to default_deny
    db.execute.return_value = FakeScalarResult(None)

    # Commit and flush are no-ops
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.add = MagicMock()

    return db


# ---------------------------------------------------------------------------
# Groq mock helpers
# ---------------------------------------------------------------------------


def _groq_result_with_intent(
    intent_consistency: float | None = None,
    injection_detected: bool = False,
    risk_score_delta: float = 0.0,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "injection_detected": injection_detected,
        "injection_type": "none",
        "hallucination_flags": [],
        "risk_score_delta": risk_score_delta,
        "rationale": "test rationale",
        "latency_ms": 42,
        "model": "test-model",
    }
    if intent_consistency is not None:
        result["intent_consistency"] = intent_consistency
    return result


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("a2a_firewall.detection.orchestrator.check_agent", return_value=(True, 1))
@patch("a2a_firewall.detection.orchestrator.preflight", return_value=None)
@patch("a2a_firewall.detection.orchestrator.validate_schema", return_value={"violations": []})
@patch(
    "a2a_firewall.detection.orchestrator.check_permissions",
    return_value={"allowed": True, "check": "default_deny"},
)
@patch(
    "a2a_firewall.detection.orchestrator.run_rules",
    return_value={
        "violations": [],
        "risk_delta": 0.1,
        "matched_rule_id": None,
        "matched_rule_action": None,
    },
)
@patch("a2a_firewall.detection.orchestrator.groq_inspect")
@patch("a2a_firewall.detection.orchestrator.make_decision", return_value="block")
async def test_intent_drift_above_threshold_blocks(
    mock_decision: MagicMock,
    mock_groq: AsyncMock,
    mock_rules: AsyncMock,
    mock_perms: AsyncMock,
    mock_schema: AsyncMock,
    mock_preflight: AsyncMock,
    mock_rate: MagicMock,
) -> None:
    """When intent_consistency > threshold and delegation token present → block."""
    mock_groq.return_value = _groq_result_with_intent(intent_consistency=0.9)
    mock_decision.return_value = "block"

    ws = FakeWorkspace()
    sender = FakeSender(workspace_id=ws.id)
    db = _make_fake_db()

    # Build a fake delegation token (compact JSON)
    token_dict = {
        "location": str(ws.id),
        "identifier": str(sender.id),
        "caveats": ["task_type=research"],
        "signature": "fakesig",
    }
    delegation_token = json.dumps(token_dict, separators=(",", ":"))

    req = _make_request(
        sender,
        ws,
        delegation_token=delegation_token,
        declared_intent="Perform market research on tech stocks",
        root_task_id=str(uuid.uuid4()),  # different from task_id → child task
    )

    # Mock delegation token verification to return valid with caveats
    with (
        patch("a2a_firewall.core.delegation.token_from_compact") as mock_tfc,
        patch("a2a_firewall.core.delegation.verify_token") as mock_vt,
        patch("a2a_firewall.core.security.hash_api_key", return_value="x" * 64),
    ):
        mock_vt_result = MagicMock()
        mock_vt_result.valid = True
        mock_vt_result.caveats = ["task_type=research"]
        mock_vt_result.parsed = {"task_type": "research"}
        mock_vt.return_value = mock_vt_result
        mock_tfc.return_value = MagicMock()

        result = await run_inspection(req, sender, ws, db)

    # Should have an intent_drift violation
    intent_violations = [
        v for v in result["violations"] if v.get("violation_type") == "intent_drift"
    ]
    assert len(intent_violations) == 1
    assert intent_violations[0]["severity"] == "critical"
    assert intent_violations[0]["details"]["intent_drift_score"] == 0.9

    # Groq should have been called with declared_intent
    call_args = mock_groq.call_args
    assert call_args.kwargs.get("declared_intent") == "Perform market research on tech stocks"


@pytest.mark.asyncio
@patch("a2a_firewall.detection.orchestrator.check_agent", return_value=(True, 1))
@patch("a2a_firewall.detection.orchestrator.preflight", return_value=None)
@patch("a2a_firewall.detection.orchestrator.validate_schema", return_value={"violations": []})
@patch(
    "a2a_firewall.detection.orchestrator.check_permissions",
    return_value={"allowed": True, "check": "default_deny"},
)
@patch(
    "a2a_firewall.detection.orchestrator.run_rules",
    return_value={
        "violations": [],
        "risk_delta": 0.1,
        "matched_rule_id": None,
        "matched_rule_action": None,
    },
)
@patch("a2a_firewall.detection.orchestrator.groq_inspect")
@patch("a2a_firewall.detection.orchestrator.make_decision", return_value="allow")
async def test_intent_consistency_below_threshold_allows(
    mock_decision: MagicMock,
    mock_groq: AsyncMock,
    mock_rules: AsyncMock,
    mock_perms: AsyncMock,
    mock_schema: AsyncMock,
    mock_preflight: AsyncMock,
    mock_rate: MagicMock,
) -> None:
    """When intent_consistency < threshold → no intent_drift violation."""
    mock_groq.return_value = _groq_result_with_intent(intent_consistency=0.3)

    ws = FakeWorkspace()
    sender = FakeSender(workspace_id=ws.id)
    db = _make_fake_db()

    token_dict = {
        "location": str(ws.id),
        "identifier": str(sender.id),
        "caveats": ["task_type=research"],
        "signature": "fakesig",
    }
    delegation_token = json.dumps(token_dict, separators=(",", ":"))

    req = _make_request(
        sender,
        ws,
        delegation_token=delegation_token,
        declared_intent="Perform market research on tech stocks",
        root_task_id=str(uuid.uuid4()),
    )

    with (
        patch("a2a_firewall.core.delegation.token_from_compact") as mock_tfc,
        patch("a2a_firewall.core.delegation.verify_token") as mock_vt,
        patch("a2a_firewall.core.security.hash_api_key", return_value="x" * 64),
    ):
        mock_vt_result = MagicMock()
        mock_vt_result.valid = True
        mock_vt_result.caveats = ["task_type=research"]
        mock_vt_result.parsed = {"task_type": "research"}
        mock_vt.return_value = mock_vt_result
        mock_tfc.return_value = MagicMock()

        result = await run_inspection(req, sender, ws, db)

    intent_violations = [
        v for v in result["violations"] if v.get("violation_type") == "intent_drift"
    ]
    assert len(intent_violations) == 0


@pytest.mark.asyncio
@patch("a2a_firewall.detection.orchestrator.check_agent", return_value=(True, 1))
@patch("a2a_firewall.detection.orchestrator.preflight", return_value=None)
@patch("a2a_firewall.detection.orchestrator.validate_schema", return_value={"violations": []})
@patch(
    "a2a_firewall.detection.orchestrator.check_permissions",
    return_value={"allowed": True, "check": "default_deny"},
)
@patch(
    "a2a_firewall.detection.orchestrator.run_rules",
    return_value={
        "violations": [],
        "risk_delta": 0.0,
        "matched_rule_id": None,
        "matched_rule_action": None,
    },
)
@patch("a2a_firewall.detection.orchestrator.groq_inspect")
@patch("a2a_firewall.detection.orchestrator.make_decision", return_value="allow")
async def test_no_declared_intent_skips_evaluation(
    mock_decision: MagicMock,
    mock_groq: AsyncMock,
    mock_rules: AsyncMock,
    mock_perms: AsyncMock,
    mock_schema: AsyncMock,
    mock_preflight: AsyncMock,
    mock_rate: MagicMock,
) -> None:
    """Without a declared_intent, intent-drift evaluation is skipped."""
    mock_groq.return_value = _groq_result_with_intent(intent_consistency=None)
    ws = FakeWorkspace()
    sender = FakeSender(workspace_id=ws.id)
    db = _make_fake_db()

    req = _make_request(sender, ws)
    # No delegation token, no declared_intent

    result = await run_inspection(req, sender, ws, db)

    # Groq is called with declared_intent=None (intent-drift not evaluated)
    assert mock_groq.call_args.kwargs.get("declared_intent") is None
    intent_violations = [
        v for v in result["violations"] if v.get("violation_type") == "intent_drift"
    ]
    assert len(intent_violations) == 0


@pytest.mark.asyncio
@patch("a2a_firewall.detection.orchestrator.check_agent", return_value=(True, 1))
@patch("a2a_firewall.detection.orchestrator.preflight", return_value=None)
@patch("a2a_firewall.detection.orchestrator.validate_schema", return_value={"violations": []})
@patch(
    "a2a_firewall.detection.orchestrator.check_permissions",
    return_value={"allowed": True, "check": "default_deny"},
)
@patch(
    "a2a_firewall.detection.orchestrator.run_rules",
    return_value={
        "violations": [],
        "risk_delta": 0.0,
        "matched_rule_id": None,
        "matched_rule_action": None,
    },
)
@patch("a2a_firewall.detection.orchestrator.groq_inspect")
@patch("a2a_firewall.detection.orchestrator.make_decision", return_value="allow")
async def test_declared_intent_without_delegation_token_skips(
    mock_decision: MagicMock,
    mock_groq: AsyncMock,
    mock_rules: AsyncMock,
    mock_perms: AsyncMock,
    mock_schema: AsyncMock,
    mock_preflight: AsyncMock,
    mock_rate: MagicMock,
) -> None:
    """declared_intent alone (no delegation token) should NOT trigger intent-binding."""
    mock_groq.return_value = _groq_result_with_intent(intent_consistency=None)
    ws = FakeWorkspace()
    sender = FakeSender(workspace_id=ws.id)
    db = _make_fake_db()

    req = _make_request(
        sender,
        ws,
        declared_intent="Perform market research",
        # No delegation_token
    )

    result = await run_inspection(req, sender, ws, db)

    # declared_intent passed to groq should be None because parent_caveats is None
    assert mock_groq.call_args.kwargs.get("declared_intent") is None
    intent_violations = [
        v for v in result["violations"] if v.get("violation_type") == "intent_drift"
    ]
    assert len(intent_violations) == 0


@pytest.mark.asyncio
@patch("a2a_firewall.detection.orchestrator.check_agent", return_value=(True, 1))
@patch("a2a_firewall.detection.orchestrator.preflight", return_value=None)
@patch("a2a_firewall.detection.orchestrator.validate_schema", return_value={"violations": []})
@patch(
    "a2a_firewall.detection.orchestrator.check_permissions",
    return_value={"allowed": True, "check": "default_deny"},
)
@patch(
    "a2a_firewall.detection.orchestrator.run_rules",
    return_value={
        "violations": [],
        "risk_delta": 0.1,
        "matched_rule_id": None,
        "matched_rule_action": None,
    },
)
@patch("a2a_firewall.detection.orchestrator.groq_inspect")
@patch("a2a_firewall.detection.orchestrator.make_decision", return_value="allow")
async def test_intent_at_exact_threshold_does_not_block(
    mock_decision: MagicMock,
    mock_groq: AsyncMock,
    mock_rules: AsyncMock,
    mock_perms: AsyncMock,
    mock_schema: AsyncMock,
    mock_preflight: AsyncMock,
    mock_rate: MagicMock,
) -> None:
    """At exactly the threshold (0.7), should NOT block (only > threshold blocks)."""
    mock_groq.return_value = _groq_result_with_intent(intent_consistency=0.7)

    ws = FakeWorkspace()
    sender = FakeSender(workspace_id=ws.id)
    db = _make_fake_db()

    token_dict = {
        "location": str(ws.id),
        "identifier": str(sender.id),
        "caveats": ["task_type=research"],
        "signature": "fakesig",
    }
    delegation_token = json.dumps(token_dict, separators=(",", ":"))

    req = _make_request(
        sender,
        ws,
        delegation_token=delegation_token,
        declared_intent="Perform market research",
        root_task_id=str(uuid.uuid4()),
    )

    with (
        patch("a2a_firewall.core.delegation.token_from_compact") as mock_tfc,
        patch("a2a_firewall.core.delegation.verify_token") as mock_vt,
        patch("a2a_firewall.core.security.hash_api_key", return_value="x" * 64),
    ):
        mock_vt_result = MagicMock()
        mock_vt_result.valid = True
        mock_vt_result.caveats = ["task_type=research"]
        mock_vt_result.parsed = {"task_type": "research"}
        mock_vt.return_value = mock_vt_result
        mock_tfc.return_value = MagicMock()

        result = await run_inspection(req, sender, ws, db)

    intent_violations = [
        v for v in result["violations"] if v.get("violation_type") == "intent_drift"
    ]
    assert len(intent_violations) == 0


@pytest.mark.asyncio
@patch("a2a_firewall.detection.orchestrator.check_agent", return_value=(True, 1))
@patch("a2a_firewall.detection.orchestrator.preflight", return_value=None)
@patch("a2a_firewall.detection.orchestrator.validate_schema", return_value={"violations": []})
@patch(
    "a2a_firewall.detection.orchestrator.check_permissions",
    return_value={"allowed": True, "check": "default_deny"},
)
@patch(
    "a2a_firewall.detection.orchestrator.run_rules",
    return_value={
        "violations": [],
        "risk_delta": 0.1,
        "matched_rule_id": None,
        "matched_rule_action": None,
    },
)
@patch("a2a_firewall.detection.orchestrator.groq_inspect")
@patch("a2a_firewall.detection.orchestrator.make_decision", return_value="block")
async def test_intent_just_above_threshold_blocks(
    mock_decision: MagicMock,
    mock_groq: AsyncMock,
    mock_rules: AsyncMock,
    mock_perms: AsyncMock,
    mock_schema: AsyncMock,
    mock_preflight: AsyncMock,
    mock_rate: MagicMock,
) -> None:
    """At 0.71 (just above threshold 0.7) → should block."""
    mock_groq.return_value = _groq_result_with_intent(intent_consistency=0.71)
    mock_decision.return_value = "block"

    ws = FakeWorkspace()
    sender = FakeSender(workspace_id=ws.id)
    db = _make_fake_db()

    token_dict = {
        "location": str(ws.id),
        "identifier": str(sender.id),
        "caveats": ["task_type=research"],
        "signature": "fakesig",
    }
    delegation_token = json.dumps(token_dict, separators=(",", ":"))

    req = _make_request(
        sender,
        ws,
        delegation_token=delegation_token,
        declared_intent="Perform market research",
        root_task_id=str(uuid.uuid4()),
    )

    with (
        patch("a2a_firewall.core.delegation.token_from_compact") as mock_tfc,
        patch("a2a_firewall.core.delegation.verify_token") as mock_vt,
        patch("a2a_firewall.core.security.hash_api_key", return_value="x" * 64),
    ):
        mock_vt_result = MagicMock()
        mock_vt_result.valid = True
        mock_vt_result.caveats = ["task_type=research"]
        mock_vt_result.parsed = {"task_type": "research"}
        mock_vt.return_value = mock_vt_result
        mock_tfc.return_value = MagicMock()

        result = await run_inspection(req, sender, ws, db)

    intent_violations = [
        v for v in result["violations"] if v.get("violation_type") == "intent_drift"
    ]
    assert len(intent_violations) == 1
    assert intent_violations[0]["details"]["intent_drift_score"] == 0.71


@pytest.mark.asyncio
@patch("a2a_firewall.detection.orchestrator.check_agent", return_value=(True, 1))
@patch("a2a_firewall.detection.orchestrator.preflight", return_value=None)
@patch("a2a_firewall.detection.orchestrator.validate_schema", return_value={"violations": []})
@patch(
    "a2a_firewall.detection.orchestrator.check_permissions",
    return_value={"allowed": True, "check": "default_deny"},
)
@patch(
    "a2a_firewall.detection.orchestrator.run_rules",
    return_value={
        "violations": [],
        "risk_delta": 0.1,
        "matched_rule_id": None,
        "matched_rule_action": None,
    },
)
@patch("a2a_firewall.detection.orchestrator.groq_inspect")
@patch("a2a_firewall.detection.orchestrator.make_decision", return_value="allow")
async def test_groq_returns_no_intent_consistency_field(
    mock_decision: MagicMock,
    mock_groq: AsyncMock,
    mock_rules: AsyncMock,
    mock_perms: AsyncMock,
    mock_schema: AsyncMock,
    mock_preflight: AsyncMock,
    mock_rate: MagicMock,
) -> None:
    """When Groq doesn't return intent_consistency, intent-binding is gracefully skipped."""
    # Groq returns no intent_consistency field (old model, or Groq unavailable)
    mock_groq.return_value = _groq_result_with_intent(intent_consistency=None)

    ws = FakeWorkspace()
    sender = FakeSender(workspace_id=ws.id)
    db = _make_fake_db()

    token_dict = {
        "location": str(ws.id),
        "identifier": str(sender.id),
        "caveats": ["task_type=research"],
        "signature": "fakesig",
    }
    delegation_token = json.dumps(token_dict, separators=(",", ":"))

    req = _make_request(
        sender,
        ws,
        delegation_token=delegation_token,
        declared_intent="Perform market research",
        root_task_id=str(uuid.uuid4()),
    )

    with (
        patch("a2a_firewall.core.delegation.token_from_compact") as mock_tfc,
        patch("a2a_firewall.core.delegation.verify_token") as mock_vt,
        patch("a2a_firewall.core.security.hash_api_key", return_value="x" * 64),
    ):
        mock_vt_result = MagicMock()
        mock_vt_result.valid = True
        mock_vt_result.caveats = ["task_type=research"]
        mock_vt_result.parsed = {"task_type": "research"}
        mock_vt.return_value = mock_vt_result
        mock_tfc.return_value = MagicMock()

        result = await run_inspection(req, sender, ws, db)

    intent_violations = [
        v for v in result["violations"] if v.get("violation_type") == "intent_drift"
    ]
    assert len(intent_violations) == 0
