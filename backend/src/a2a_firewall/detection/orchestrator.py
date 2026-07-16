from __future__ import annotations

import hashlib
import json
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.core.rate_limit import check_agent
from a2a_firewall.db.models import (
    ReviewItem,
    Task,
    TelemetryRow,
    TraceEvent,
    Violation,
)
from a2a_firewall.detection.layer0_preflight import preflight
from a2a_firewall.detection.layer1_schema import validate_schema
from a2a_firewall.detection.layer2_permissions import check_permissions
from a2a_firewall.detection.layer3_rules import run_rules
from a2a_firewall.detection.layer4_groq import groq_inspect
from a2a_firewall.detection.layer5_decision import make_decision


async def run_inspection(
    request_data: dict[str, Any], sender: Any, workspace: Any, db: AsyncSession
) -> dict[str, Any]:
    """Run the full 5-layer detection pipeline plus identity/delegation checks and telemetry emission.

    Identity and delegation verification are now integrated:
    - Layer -0.5: Verify sender's Ed25519 signature (if present)
    - Layer -0.5: Verify delegation token chain (if present)
    - Emit structured telemetry event for correlation engine
    """
    start = time.monotonic()

    # ---------- Per-agent rate limit (layer -1) ----------
    agent_allowed, agent_count = check_agent(str(sender.id))
    rate_event = {
        "name": "firewall.rate_limit",
        "span_id": uuid.uuid4().hex,
        "parent_span_id": cast(str, request_data.get("parent_span_id") or uuid.uuid4().hex),
        "duration_ms": 0,
        "attributes": {
            "scope": "agent",
            "allowed": agent_allowed,
            "current_count": agent_count,
        },
    }
    trace_events: list[dict[str, Any]] = [rate_event]

    if not agent_allowed:
        result = await _rate_limit_response(
            request_data,
            sender,
            workspace,
            db,
            trace_events=trace_events,
            scope="agent",
            current_count=agent_count,
        )
        await _emit_telemetry(
            result,
            request_data,
            sender,
            workspace,
            db,
            start,
            trace_events,
            violations=result.get("violations", []),
        )
        return result

    violations: list[dict[str, Any]] = []
    risk_score = 0.0
    matched_rule_id: str | None = None
    groq_result: dict[str, Any] | None = None

    payload_str = json.dumps(request_data["payload"], sort_keys=True)
    payload_hash = hashlib.sha256(payload_str.encode()).hexdigest()
    payload_size = len(payload_str.encode())

    trace_id = cast(str, request_data.get("trace_id") or uuid.uuid4().hex)
    parent_span_id = cast(str, request_data.get("parent_span_id") or uuid.uuid4().hex)
    rate_event["parent_span_id"] = parent_span_id

    # ---------- Identity & Delegation checks ----------
    signature_valid = True
    delegation_chain: list[str] = []
    delegation_depth = 0

    # Check Ed25519 signature if present
    sender_signature = request_data.get("sender_signature")
    sender_public_key = request_data.get("sender_public_key")
    if sender_signature and sender_public_key:
        try:
            from a2a_firewall.core.identity import hex_to_public_key

            pub_key = hex_to_public_key(sender_public_key)
            msg_hash = hashlib.sha256(payload_str.encode()).digest()
            pub_key.verify(bytes.fromhex(sender_signature), msg_hash)
            signature_valid = True
        except Exception:
            signature_valid = False
            violations.append(
                {
                    "layer": "identity",
                    "violation_type": "invalid_signature",
                    "severity": "critical",
                    "details": {"sender_id": str(sender.id)},
                }
            )
            risk_score = 1.0

    # Check delegation token if present
    delegation_token_compact = request_data.get("delegation_token")
    if delegation_token_compact:
        try:
            from a2a_firewall.core.delegation import (
                token_from_compact,
                verify_token,
            )
            from a2a_firewall.core.security import hash_api_key

            root_key = hash_api_key(str(workspace.id)).encode()[:32]
            token = token_from_compact(delegation_token_compact)
            verification = verify_token(token, root_key)
            if not verification.valid:
                violations.append(
                    {
                        "layer": "delegation",
                        "violation_type": "invalid_delegation_token",
                        "severity": "critical",
                        "details": {"reason": verification.reason},
                    }
                )
                risk_score = 1.0
            else:
                delegation_chain = (
                    verification.parsed.get("delegation_chain", "").split(",")
                    if verification.parsed.get("delegation_chain")
                    else []
                )
                delegation_depth = len(delegation_chain)
        except Exception as e:
            violations.append(
                {
                    "layer": "delegation",
                    "violation_type": "delegation_token_parse_error",
                    "severity": "high",
                    "details": {"error": str(e)[:200]},
                }
            )
            risk_score = max(risk_score, 0.8)

    # ---------- Layer 0: preflight ----------
    layer_start = time.monotonic()
    pre = await preflight(request_data, sender, workspace, payload_size, db)
    preflight_ms = int((time.monotonic() - layer_start) * 1000)

    trace_events.append(
        {
            "name": "firewall.preflight",
            "span_id": uuid.uuid4().hex,
            "parent_span_id": parent_span_id,
            "duration_ms": preflight_ms,
            "attributes": {
                "blocked": bool(pre and pre.get("block")),
                "idempotent_replay": bool(pre and pre.get("idempotent_replay")),
                "violations_count": len(pre.get("violations", [])) if pre else 0,
                "reason": pre.get("reason") if pre else None,
            },
        }
    )

    if pre and pre.get("idempotent_replay"):
        result = await _replay_response(
            pre["cached_task"], db, trace_id, parent_span_id, trace_events
        )
        await _emit_telemetry(
            result,
            request_data,
            sender,
            workspace,
            db,
            start,
            trace_events,
            violations=[],
            signature_valid=signature_valid,
            delegation_chain=delegation_chain,
            delegation_depth=delegation_depth,
        )
        return result

    if pre and pre.get("block"):
        violations.extend(pre["violations"])
        risk_score = max(risk_score, pre.get("risk_score", 0))
        result = await _save_and_return(
            "block",
            pre["reason"],
            request_data,
            sender,
            workspace,
            payload_hash,
            payload_size,
            risk_score,
            violations,
            None,
            False,
            None,
            start,
            db,
            trace_id,
            parent_span_id,
            trace_events,
        )
        await _emit_telemetry(
            result,
            request_data,
            sender,
            workspace,
            db,
            start,
            trace_events,
            violations=violations,
            signature_valid=signature_valid,
            delegation_chain=delegation_chain,
            delegation_depth=delegation_depth,
        )
        return result

    # ---------- Layer 1: schema ----------
    layer_start = time.monotonic()
    schema_result = await validate_schema(request_data, workspace, db)
    schema_ms = int((time.monotonic() - layer_start) * 1000)
    trace_events.append(
        {
            "name": "firewall.schema",
            "span_id": uuid.uuid4().hex,
            "parent_span_id": parent_span_id,
            "duration_ms": schema_ms,
            "attributes": {
                "violations_count": len(schema_result["violations"]),
                "valid": len(schema_result["violations"]) == 0,
            },
        }
    )

    if schema_result["violations"]:
        violations.extend(schema_result["violations"])
        result = await _save_and_return(
            "block",
            "schema_validation_failed",
            request_data,
            sender,
            workspace,
            payload_hash,
            payload_size,
            1.0,
            violations,
            None,
            False,
            None,
            start,
            db,
            trace_id,
            parent_span_id,
            trace_events,
        )
        await _emit_telemetry(
            result,
            request_data,
            sender,
            workspace,
            db,
            start,
            trace_events,
            violations=violations,
            signature_valid=signature_valid,
            delegation_chain=delegation_chain,
            delegation_depth=delegation_depth,
        )
        return result

    # ---------- Layer 2: permissions ----------
    layer_start = time.monotonic()
    perm_result = await check_permissions(request_data, sender, workspace, db)
    perms_ms = int((time.monotonic() - layer_start) * 1000)
    trace_events.append(
        {
            "name": "firewall.permissions",
            "span_id": uuid.uuid4().hex,
            "parent_span_id": parent_span_id,
            "duration_ms": perms_ms,
            "attributes": {
                "allowed": bool(perm_result["allowed"]),
                "default_deny": bool(workspace.default_deny),
            },
        }
    )

    if not perm_result["allowed"]:
        violations.append(
            {
                "layer": "rule",
                "violation_type": "sender_not_permitted",
                "severity": "high",
                "details": {},
            }
        )
        result = await _save_and_return(
            "block",
            "permission_denied",
            request_data,
            sender,
            workspace,
            payload_hash,
            payload_size,
            1.0,
            violations,
            None,
            False,
            None,
            start,
            db,
            trace_id,
            parent_span_id,
            trace_events,
        )
        await _emit_telemetry(
            result,
            request_data,
            sender,
            workspace,
            db,
            start,
            trace_events,
            violations=violations,
            signature_valid=signature_valid,
            delegation_chain=delegation_chain,
            delegation_depth=delegation_depth,
        )
        return result

    # ---------- Layer 3: rules ----------
    layer_start = time.monotonic()
    rule_result = await run_rules(request_data, sender, workspace, db)
    rules_ms = int((time.monotonic() - layer_start) * 1000)
    trace_events.append(
        {
            "name": "firewall.rules",
            "span_id": uuid.uuid4().hex,
            "parent_span_id": parent_span_id,
            "duration_ms": rules_ms,
            "attributes": {
                "violations_count": len(rule_result["violations"]),
                "risk_delta": rule_result["risk_delta"],
                "matched_rule_id": rule_result.get("matched_rule_id"),
                "matched_rule_action": rule_result.get("matched_rule_action"),
            },
        }
    )
    violations.extend(rule_result["violations"])
    risk_score = min(1.0, risk_score + rule_result["risk_delta"])
    matched_rule_id = rule_result.get("matched_rule_id")

    # ---------- Layer 4: groq (semantic intent verification) ----------
    # Always called when risk > 0 so regex false positives can be corrected
    # by LLM intent analysis. The rules layer no longer short-circuits —
    # Groq must weigh in before any block decision.
    groq_called = False
    groq_model: str | None = None
    if risk_score > 0:
        layer_start = time.monotonic()
        groq_result = await groq_inspect(request_data, sender, workspace, payload_hash)
        groq_called = True
        groq_model = groq_result.get("model")
        groq_ms = int((time.monotonic() - layer_start) * 1000)
        trace_events.append(
            {
                "name": "firewall.groq",
                "span_id": uuid.uuid4().hex,
                "parent_span_id": parent_span_id,
                "duration_ms": groq_ms,
                "attributes": {
                    "called": True,
                    "injection_detected": bool(groq_result.get("injection_detected")),
                    "hallucination_count": len(groq_result.get("hallucination_flags") or []),
                    "model": groq_model,
                    "rationale_excerpt": (groq_result.get("rationale") or "")[:120],
                    "risk_delta": groq_result.get("risk_score_delta", 0),
                },
            }
        )
        if groq_result.get("injection_detected"):
            violations.append(
                {
                    "layer": "semantic",
                    "violation_type": "prompt_injection",
                    "severity": "critical",
                    "details": groq_result,
                }
            )
        risk_score = min(1.0, risk_score + groq_result.get("risk_score_delta", 0))
    else:
        trace_events.append(
            {
                "name": "firewall.groq",
                "span_id": uuid.uuid4().hex,
                "parent_span_id": parent_span_id,
                "duration_ms": 0,
                "attributes": {"called": False, "reason": "below_threshold"},
            }
        )

    # ---------- Layer 5: decision ----------
    decision = make_decision(risk_score, rule_result.get("matched_rule_action"), workspace)
    trace_events.append(
        {
            "name": "firewall.decision",
            "span_id": uuid.uuid4().hex,
            "parent_span_id": parent_span_id,
            "duration_ms": 0,
            "attributes": {
                "decision": decision,
                "risk_score": risk_score,
                "final_reason": rule_result.get("matched_rule_action"),
            },
        }
    )
    result = await _save_and_return(
        decision,
        None,
        request_data,
        sender,
        workspace,
        payload_hash,
        payload_size,
        risk_score,
        violations,
        groq_result,
        groq_called,
        matched_rule_id,
        start,
        db,
        trace_id,
        parent_span_id,
        trace_events,
        groq_model,
    )
    await _emit_telemetry(
        result,
        request_data,
        sender,
        workspace,
        db,
        start,
        trace_events,
        violations=violations,
        signature_valid=signature_valid,
        delegation_chain=delegation_chain,
        delegation_depth=delegation_depth,
        groq_result=groq_result,
    )
    return result


async def _emit_telemetry(
    result: dict[str, Any],
    request_data: dict[str, Any],
    sender: Any,
    workspace: Any,
    db: AsyncSession,
    start: float,
    trace_events: list[dict[str, Any]],
    violations: list[dict[str, Any]],
    signature_valid: bool = True,
    delegation_chain: list[str] | None = None,
    delegation_depth: int = 0,
    groq_result: dict[str, Any] | None = None,
) -> None:
    """Emit a structured telemetry event for the correlation engine."""
    total_ms = int((time.monotonic() - start) * 1000)
    event_type = "a2a.inspection"
    if not signature_valid:
        event_type = "a2a.identity_failure"
    elif any(v.get("layer") == "delegation" for v in violations):
        event_type = "a2a.scope_violation"

    payload_snapshot = request_data.get("payload", {})
    if isinstance(payload_snapshot, str):
        payload_snapshot = {"raw": payload_snapshot[:500]}
    elif isinstance(payload_snapshot, dict):
        payload_snapshot = {k: str(v)[:200] for k, v in list(payload_snapshot.items())[:10]}

    event = TelemetryRow(
        event_id=str(uuid.uuid4()),
        event_type=event_type,
        workspace_id=workspace.id,
        sender_agent_id=sender.id,
        receiver_agent_id=uuid.UUID(
            request_data.get("receiver_agent_id", "00000000-0000-0000-0000-000000000000")
        ),
        task_type=request_data.get("task_type"),
        decision=result.get("decision"),
        risk_score=result.get("risk_score", 0.0),
        violations=violations,
        delegation_chain=delegation_chain or [],
        delegation_depth=delegation_depth,
        message_hash=result.get("trace_id"),
        chain_hash=None,
        signature_valid=signature_valid,
        latency_ms=total_ms,
        groq_called=groq_result is not None,
        groq_rationale=groq_result.get("rationale") if groq_result else None,
        payload_snapshot=payload_snapshot,
        otel_trace_id=request_data.get("trace_id"),
        otel_span_id=request_data.get("parent_span_id"),
    )
    db.add(event)
    await db.flush()


async def _save_and_return(
    decision: str,
    reason: str | None,
    req: dict[str, Any],
    sender: Any,
    workspace: Any,
    payload_hash: str,
    payload_size: int,
    risk_score: float,
    violations: list[dict[str, Any]],
    groq_result: dict[str, Any] | None,
    groq_called: bool,
    matched_rule_id: str | None,
    start: float,
    db: AsyncSession,
    trace_id: str,
    parent_span_id: str,
    trace_events: list[dict[str, Any]],
    groq_model: str | None = None,
) -> dict[str, Any]:
    task_id = uuid.UUID(req["task_id"])
    total_ms = int((time.monotonic() - start) * 1000)
    review_token: str | None = None
    if decision == "review":
        review_token = secrets.token_urlsafe(32)

    task = Task(
        id=task_id,
        workspace_id=workspace.id,
        root_task_id=uuid.UUID(req.get("root_task_id") or str(task_id)),
        parent_task_id=uuid.UUID(req["parent_task_id"]) if req.get("parent_task_id") else None,
        depth=req.get("depth", 0),
        sender_id=sender.id,
        receiver_id=uuid.UUID(req["receiver_agent_id"]),
        task_type=req["task_type"],
        schema_version=req.get("schema_version", "v1"),
        payload=req["payload"],
        payload_hash=payload_hash,
        payload_size_bytes=payload_size,
        risk_score=risk_score,
        decision=decision,
        decision_reason=reason,
        matched_rule_id=uuid.UUID(matched_rule_id) if matched_rule_id else None,
        groq_called=groq_called,
        groq_model=groq_model,
        groq_injection_detected=groq_result.get("injection_detected") if groq_result else None,
        groq_hallucination_flags=groq_result.get("hallucination_flags") if groq_result else None,
        groq_risk_delta=groq_result.get("risk_score_delta") if groq_result else None,
        groq_rationale=groq_result.get("rationale") if groq_result else None,
        groq_latency_ms=groq_result.get("latency_ms") if groq_result else None,
        total_latency_ms=total_ms,
        trace_id=trace_id,
        span_id=parent_span_id,
    )
    db.add(task)
    await db.flush()

    for v in violations:
        db.add(
            Violation(
                workspace_id=workspace.id,
                task_id=task_id,
                layer=v["layer"],
                violation_type=v["violation_type"],
                severity=v["severity"],
                details=v.get("details", {}),
            )
        )

    if decision == "review" and review_token:
        db.add(
            ReviewItem(
                workspace_id=workspace.id,
                task_id=task_id,
                review_token=review_token,
                expires_at=datetime.now(UTC) + timedelta(minutes=30),
            )
        )

    for ev in trace_events:
        db.add(
            TraceEvent(
                workspace_id=workspace.id,
                task_id=task_id,
                trace_id=trace_id,
                span_id=ev["span_id"],
                parent_span_id=ev["parent_span_id"],
                event_name=ev["name"],
                attributes=ev["attributes"],
                duration_ms=ev["duration_ms"],
            )
        )

    await db.commit()
    return {
        "task_id": str(task_id),
        "decision": decision,
        "allowed_to_proceed": decision in ("allow", "review"),
        "risk_score": risk_score,
        "violations": violations,
        "review_token": review_token,
        "block_reason": reason,
        "latency_ms": total_ms,
        "trace_id": trace_id,
    }


async def _rate_limit_response(
    req: dict[str, Any],
    sender: Any,
    workspace: Any,
    db: AsyncSession,
    trace_events: list[dict[str, Any]],
    scope: str,
    current_count: int,
) -> dict[str, Any]:
    """Persist a synthetic 'block / rate_limit_exceeded' task and trace events.

    Skips the full inspection pipeline but still writes a Task row, the rate
    limit trace event, and a violation so the dashboard shows the throttling.
    """
    start = time.monotonic()
    task_id = uuid.UUID(req["task_id"])
    payload_str = json.dumps(req["payload"], sort_keys=True)
    payload_hash = hashlib.sha256(payload_str.encode()).hexdigest()
    payload_size = len(payload_str.encode())
    trace_id = cast(str, req.get("trace_id") or uuid.uuid4().hex)
    parent_span_id = cast(str, req.get("parent_span_id") or uuid.uuid4().hex)
    total_ms = int((time.monotonic() - start) * 1000)

    violations = [
        {
            "layer": "rule",
            "violation_type": f"{scope}_rate_limit_exceeded",
            "severity": "high",
            "details": {"scope": scope, "current_count": current_count},
        }
    ]

    task = Task(
        id=task_id,
        workspace_id=workspace.id,
        root_task_id=uuid.UUID(req.get("root_task_id") or str(task_id)),
        parent_task_id=uuid.UUID(req["parent_task_id"]) if req.get("parent_task_id") else None,
        depth=req.get("depth", 0),
        sender_id=sender.id,
        receiver_id=uuid.UUID(req["receiver_agent_id"]),
        task_type=req["task_type"],
        schema_version=req.get("schema_version", "v1"),
        payload=req["payload"],
        payload_hash=payload_hash,
        payload_size_bytes=payload_size,
        risk_score=1.0,
        decision="block",
        decision_reason=f"{scope}_rate_limit_exceeded",
        groq_called=False,
        total_latency_ms=total_ms,
        trace_id=trace_id,
        span_id=parent_span_id,
    )
    db.add(task)
    for v in violations:
        db.add(
            Violation(
                workspace_id=workspace.id,
                task_id=task_id,
                layer=v["layer"],
                violation_type=v["violation_type"],
                severity=v["severity"],
                details=v["details"],
            )
        )
    for ev in trace_events:
        db.add(
            TraceEvent(
                workspace_id=workspace.id,
                task_id=task_id,
                trace_id=trace_id,
                span_id=ev["span_id"],
                parent_span_id=ev["parent_span_id"],
                event_name=ev["name"],
                attributes=ev["attributes"],
                duration_ms=ev["duration_ms"],
            )
        )
    await db.commit()
    return {
        "task_id": str(task_id),
        "decision": "block",
        "allowed_to_proceed": False,
        "risk_score": 1.0,
        "violations": violations,
        "review_token": None,
        "block_reason": f"{scope}_rate_limit_exceeded",
        "latency_ms": total_ms,
        "trace_id": trace_id,
    }


async def _replay_response(
    cached: Task,
    db: AsyncSession,
    trace_id: str,
    parent_span_id: str,
    trace_events: list[dict[str, Any]],
) -> dict[str, Any]:
    """Return the original decision for a replayed task_id, with the same review_token if pending."""
    review_token: str | None = None
    if cached.decision == "review":
        from sqlalchemy import select

        result = await db.execute(select(ReviewItem).where(ReviewItem.task_id == cached.id))
        ri = result.scalar_one_or_none()
        review_token = cast(str, ri.review_token) if ri and ri.status == "pending" else None

    return {
        "task_id": str(cached.id),
        "decision": cached.decision,
        "allowed_to_proceed": cached.decision in ("allow", "review"),
        "risk_score": cached.risk_score,
        "violations": [],
        "review_token": review_token,
        "block_reason": cached.decision_reason,
        "latency_ms": 0,
        "trace_id": trace_id,
    }
