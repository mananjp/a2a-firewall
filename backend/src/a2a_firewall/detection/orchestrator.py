from __future__ import annotations

import contextlib
import hashlib
import json
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.core.config import settings
from a2a_firewall.core.rate_limit import check_agent
from a2a_firewall.db.models import (
    AgentIdentity,
    DelegationChain,
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
from a2a_firewall.detection.layer4_groq import contains_non_ascii_script, groq_inspect
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

    # ---------- Spend limit check ----------
    from a2a_firewall.core.spend_manager import (
        check_spend_limits,
        estimate_tokens,
        record_spend_transaction,
    )

    estimated_tokens = estimate_tokens(request_data.get("payload", {}))
    spend_check = await check_spend_limits(workspace.id, sender.id, estimated_tokens, db)
    if not spend_check.get("allowed", True):
        spend_reason = spend_check.get("reason", "spend_limit_exceeded")
        violations.append(
            {
                "layer": "spend",
                "violation_type": spend_reason,
                "severity": "critical",
                "details": spend_check.get("details", {}),
            }
        )
        task_uuid = uuid.UUID(request_data["task_id"])
        blocked_task = Task(
            id=task_uuid,
            workspace_id=workspace.id,
            root_task_id=uuid.UUID(request_data.get("root_task_id") or request_data["task_id"]),
            parent_task_id=uuid.UUID(request_data["parent_task_id"])
            if request_data.get("parent_task_id")
            else None,
            depth=request_data.get("depth", 0),
            sender_id=sender.id,
            receiver_id=uuid.UUID(request_data["receiver_agent_id"]),
            task_type=request_data["task_type"],
            schema_version=request_data.get("schema_version", "v1"),
            resource_type=request_data.get("resource_type"),
            resource_id=request_data.get("resource_id"),
            action=request_data.get("action"),
            payload=request_data["payload"],
            payload_hash=payload_hash,
            payload_size_bytes=payload_size,
            risk_score=1.0,
            decision="block",
            decision_reason=f"Blocked: {spend_reason}",
            matched_rule_id=None,
            groq_called=False,
            total_latency_ms=int((time.monotonic() - start) * 1000),
            trace_id=trace_id,
            span_id=uuid.uuid4().hex,
            created_at=datetime.now(UTC),
        )
        db.add(blocked_task)
        await db.commit()
        return {
            "decision": "block",
            "reason": f"Blocked: {spend_reason}",
            "risk_score": 1.0,
            "violations": violations,
            "task_id": request_data["task_id"],
        }

    # ---------- Identity & Delegation checks ----------
    signature_valid = True
    delegation_chain: list[str] = []
    delegation_depth = 0

    # Verify the sender's Ed25519 signature against its REGISTERED public key.
    # A client-supplied public key is self-asserted and cannot be trusted for
    # identity — an attacker would simply supply a key they control.
    sender_signature = request_data.get("sender_signature")
    if sender_signature:
        from a2a_firewall.core.identity import parse_public_key
        from a2a_firewall.core.signing import compute_message_hash

        identity_row = await db.execute(
            select(AgentIdentity).where(AgentIdentity.agent_id == sender.id)
        )
        registered = identity_row.scalar_one_or_none()

        if registered is None:
            signature_valid = False
            violations.append(
                {
                    "layer": "identity",
                    "violation_type": "identity_not_registered",
                    "severity": "high",
                    "details": {
                        "sender_id": str(sender.id),
                        "hint": "Message was signed but the sender has no registered Ed25519 "
                        "identity. Register via POST /v1/identity/register-identity.",
                    },
                }
            )
            risk_score = max(risk_score, 0.7)
        else:
            sender_message_hash = request_data.get("message_hash")
            sender_timestamp = request_data.get("timestamp")

            if not sender_message_hash or sender_timestamp is None:
                signature_valid = False
                violations.append(
                    {
                        "layer": "identity",
                        "violation_type": "signature_unverifiable",
                        "severity": "high",
                        "details": {
                            "sender_id": str(sender.id),
                            "hint": "message_hash and timestamp are required to verify a signed payload.",
                        },
                    }
                )
                risk_score = max(risk_score, 0.7)
            else:
                try:
                    ts = float(sender_timestamp)
                except (TypeError, ValueError):
                    signature_valid = False
                    violations.append(
                        {
                            "layer": "identity",
                            "violation_type": "invalid_timestamp",
                            "severity": "high",
                            "details": {"sender_id": str(sender.id)},
                        }
                    )
                    risk_score = max(risk_score, 0.7)
                    ts = 0.0

                # 1. The signed hash must match a recomputation over the payload.
                expected_hash = compute_message_hash(
                    request_data.get("payload", {}),
                    str(sender.id),
                    str(request_data.get("receiver_agent_id", "")),
                    ts,
                )
                if expected_hash != sender_message_hash:
                    signature_valid = False
                    violations.append(
                        {
                            "layer": "identity",
                            "violation_type": "message_hash_mismatch",
                            "severity": "high",
                            "details": {"sender_id": str(sender.id)},
                        }
                    )
                    risk_score = max(risk_score, 0.7)
                else:
                    # 2. Verify the signature with the registered key.
                    try:
                        pub_key = parse_public_key(str(registered.public_key))
                        pub_key.verify(
                            bytes.fromhex(sender_signature),
                            bytes.fromhex(sender_message_hash),
                        )
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
                        risk_score = max(risk_score, 1.0)

    # Check delegation token if present
    delegation_token_compact = request_data.get("delegation_token")
    parent_caveats: list[str] | None = None
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
                parent_caveats = list(verification.caveats)
                delegation_chain = (
                    verification.parsed.get("delegation_chain", "").split(",")
                    if verification.parsed.get("delegation_chain")
                    else []
                )
                delegation_depth = (
                    len(delegation_chain) if delegation_chain else request_data.get("depth", 0)
                )
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

    # Stash delegation metadata on request_data for _save_and_return to write DelegationChain
    if delegation_token_compact:
        request_data["_delegation_token_compact"] = delegation_token_compact
        request_data["_parent_caveats"] = parent_caveats or []
        request_data["_delegation_depth"] = delegation_depth
        request_data["_delegation_signature_valid"] = signature_valid

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
    perm_result = await check_permissions(
        request_data, sender, workspace, db, parent_caveats=parent_caveats
    )
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
                "check": perm_result.get("check"),
                "non_amplification_enforced": parent_caveats is not None,
            },
        }
    )

    if not perm_result["allowed"]:
        # Differentiate non-amplification from generic permission denial
        if perm_result.get("check") == "non_amplification_violation":
            violations.append(
                {
                    "layer": "delegation",
                    "violation_type": "non_amplification_violation",
                    "severity": "critical",
                    "details": {
                        "requested": perm_result.get("requested", []),
                        "parent_caveats": perm_result.get("parent_caveats", []),
                    },
                }
            )
        else:
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

    # ---------- IPS Signature Scan (new) ----------
    ips_mode = getattr(workspace, "ips_mode", None) or settings.IPS_DEFAULT_MODE
    try:
        from a2a_firewall.detection.ips_signatures import get_engine

        ips_engine = get_engine()
        ips_matches = ips_engine.scan(payload_str, ips_mode=ips_mode)
        for sig_match in ips_matches:
            if sig_match["action"] != "alert":
                violations.append(
                    {
                        "layer": "rule",
                        "violation_type": f"ips_signature_{sig_match['category']}",
                        "severity": sig_match["severity"],
                        "details": {
                            "signature_id": sig_match["signature_id"],
                            "category": sig_match["category"],
                            "description": sig_match["description"],
                            "mitre_technique": sig_match.get("mitre_technique"),
                            "ips_action": sig_match["action"],
                        },
                    }
                )
                sig_risk = {"critical": 0.9, "high": 0.7, "medium": 0.4, "low": 0.2}.get(
                    sig_match["severity"], 0.3
                )
                risk_score = min(1.0, risk_score + sig_risk)

        if ips_matches:
            trace_events.append(
                {
                    "name": "firewall.ips_signatures",
                    "span_id": uuid.uuid4().hex,
                    "parent_span_id": parent_span_id,
                    "duration_ms": 0,
                    "attributes": {
                        "matches_count": len(ips_matches),
                        "ips_mode": ips_mode,
                        "signature_ids": [m["signature_id"] for m in ips_matches],
                    },
                }
            )
    except Exception:
        pass  # IPS scan failure must not block the pipeline

    # ---------- PII / Compliance pattern scan (new) ----------
    try:
        from a2a_firewall.detection.pii_patterns import pii_matches_to_violations, scan_all_pii

        pii_matches = scan_all_pii(payload_str)
        if pii_matches:
            pii_violations = pii_matches_to_violations(pii_matches)
            violations.extend(pii_violations)
            pii_risk = min(0.5, len(pii_matches) * 0.15)
            risk_score = min(1.0, risk_score + pii_risk)

            trace_events.append(
                {
                    "name": "firewall.pii_scan",
                    "span_id": uuid.uuid4().hex,
                    "parent_span_id": parent_span_id,
                    "duration_ms": 0,
                    "attributes": {
                        "pii_matches_count": len(pii_matches),
                        "pattern_types": list({m.pattern_type for m in pii_matches}),
                    },
                }
            )
    except Exception:
        pass  # PII scan failure must not block the pipeline

    # ---------- Layer 3b: CVE Risk (new) ----------
    try:
        from a2a_firewall.detection.layer3b_cve_risk import run_cve_risk

        layer_start = time.monotonic()
        cve_result = await run_cve_risk(request_data, sender, workspace, db)
        cve_ms = int((time.monotonic() - layer_start) * 1000)
        if cve_result["violations"]:
            violations.extend(cve_result["violations"])
            risk_score = min(1.0, risk_score + cve_result["risk_delta"])
            trace_events.append(
                {
                    "name": "firewall.cve_risk",
                    "span_id": uuid.uuid4().hex,
                    "parent_span_id": parent_span_id,
                    "duration_ms": cve_ms,
                    "attributes": {
                        "cve_matches_count": len(cve_result.get("cve_matches", [])),
                        "risk_delta": cve_result["risk_delta"],
                    },
                }
            )
    except Exception:
        pass  # CVE lookup failure must not block the pipeline

    # ---------- Intent resolution for delegation-bound requests ----------
    # Resolve declared_intent: either from the request itself (root task creation)
    # or by looking up the root task's declared_intent for child delegated tasks.
    declared_intent: str | None = request_data.get("declared_intent")
    intent_drift_score: float | None = None
    task_id_str = request_data.get("task_id", "")
    root_task_id_str = request_data.get("root_task_id") or task_id_str

    if (
        not declared_intent
        and parent_caveats is not None
        and root_task_id_str
        and root_task_id_str != task_id_str
    ):
        # Child delegated task: look up the root task's declared intent
        try:
            root_row = await db.execute(select(Task).where(Task.id == uuid.UUID(root_task_id_str)))
            root_task = root_row.scalar_one_or_none()
            if root_task and root_task.declared_intent:
                declared_intent = str(root_task.declared_intent)
        except Exception:  # noqa: BLE001
            pass  # root task not found — intent-binding simply won't activate

    # ---------- Layer 4: groq (semantic intent verification & injection guard) ----------
    # Always called so that:
    # 1. Real prompt injections that evade simple regex rules are detected (preventing 0-risk bypass)
    # 2. Benign false-positives flagged by regex can be downgraded by LLM intent analysis
    # 3. Intent consistency is verified on delegation-bound requests
    # 4. In injection_only mode (when risk is 0 and no delegation), uses a streamlined prompt to minimize latency
    groq_called = True
    injection_only = (
        risk_score == 0
        and not (declared_intent and parent_caveats is not None)
        # Targeted exception: the English-only keyword rules cannot cover
        # non-Latin/accented-Latin payloads, so never trust the cheap
        # injection-only prompt for them — use the full semantic prompt.
        and not contains_non_ascii_script(request_data.get("payload", {}))
    )
    layer_start = time.monotonic()
    groq_result = await groq_inspect(
        request_data,
        sender,
        workspace,
        payload_hash,
        declared_intent=declared_intent if parent_caveats is not None else None,
        injection_only=injection_only,
        rules_risk_delta=rule_result.get("risk_delta", 0.0),
    )
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
                "hallucination_flags": groq_result.get("hallucination_flags") or [],
                "model": groq_model,
                "rationale_excerpt": (groq_result.get("rationale") or "")[:120],
                "risk_delta": groq_result.get("risk_score_delta", 0),
                "injection_only": injection_only,
            },
        }
    )
    if groq_result.get("injection_detected"):
        violations.append(
            {
                "layer": "semantic",
                "violation_type": "prompt_injection",
                "severity": "critical"
                if groq_result.get("risk_score_delta", 0.8) >= 0.8
                else "high",
                "details": groq_result,
            }
        )
        groq_delta = groq_result.get("risk_score_delta", 0.8)
        risk_score = min(1.0, max(risk_score, groq_delta))
    else:
        # Apply delta (which may be negative to downgrade regex false-positives, or positive for grey-zone)
        risk_score = max(0.0, min(1.0, risk_score + groq_result.get("risk_score_delta", 0)))

    # Intent-binding: check if the payload drifts from the declared intent
    if declared_intent and parent_caveats is not None:
        intent_drift_score = groq_result.get("intent_consistency")
        if (
            isinstance(intent_drift_score, (int, float))
            and intent_drift_score > settings.INTENT_DRIFT_THRESHOLD
        ):
            violations.append(
                {
                    "layer": "semantic",
                    "violation_type": "intent_drift",
                    "severity": "critical",
                    "details": {
                        "declared_intent": declared_intent,
                        "intent_drift_score": intent_drift_score,
                        "threshold": settings.INTENT_DRIFT_THRESHOLD,
                        "rationale": groq_result.get("rationale", ""),
                    },
                }
            )
            risk_score = 1.0

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
    # Stash intent fields on request_data for _save_and_return to persist
    request_data["_declared_intent"] = declared_intent
    request_data["_intent_drift_score"] = intent_drift_score

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

    # ---------- Post-decision: SOC Alert creation (new) ----------
    if violations and decision in ("block", "review"):
        try:
            from a2a_firewall.api.routes.soc import create_soc_alert

            # Get chain_hash if delegation was involved
            _chain_hash = None
            if request_data.get("_delegation_token_compact"):
                _chain_hash = hashlib.sha256(
                    f"{request_data.get('task_id')}:{request_data.get('_delegation_token_compact')}".encode()
                ).hexdigest()

            # Create SOC alert for the most severe violation
            worst = max(
                violations,
                key=lambda v: {"critical": 4, "high": 3, "medium": 2, "low": 1}.get(
                    v.get("severity", "low"), 0
                ),
            )
            await create_soc_alert(
                workspace_id=workspace.id,
                violation=worst,
                task_id=uuid.UUID(request_data["task_id"]),
                risk_score=risk_score,
                chain_hash=_chain_hash,
                db=db,
            )
            await db.commit()
        except Exception:
            pass  # SOC alert creation failure must not affect the decision

    # ---------- Post-decision: IPS Auto-containment (new) ----------
    if violations and ips_mode == "block_and_suspend":
        try:
            from a2a_firewall.detection.ips_signatures import get_violation_counter

            counter = get_violation_counter()
            worst_severity = max(
                (v.get("severity", "low") for v in violations),
                key=lambda s: {"critical": 4, "high": 3, "medium": 2, "low": 1}.get(s, 0),
            )
            check = counter.record_violation(str(sender.id), worst_severity)

            if check["should_suspend"]:
                # Auto-suspend the agent
                from a2a_firewall.db.models import Agent as AgentModel

                agent_result = await db.execute(
                    select(AgentModel).where(AgentModel.id == sender.id)
                )
                agent_row = agent_result.scalar_one_or_none()
                if agent_row and agent_row.status != "suspended":
                    agent_row.status = "suspended"

                    # Create a P1 SOC alert for the auto-suspension
                    try:
                        from a2a_firewall.db.models import SOCAlert

                        suspension_alert = SOCAlert(
                            workspace_id=workspace.id,
                            task_id=uuid.UUID(request_data["task_id"]),
                            severity="P1",
                            status="new",
                            title=f"Agent Auto-Suspended: {sender.name}",
                            description=(
                                f"Agent exceeded critical violation threshold "
                                f"({check['critical_count']}/{counter.critical_threshold} "
                                f"in {counter.window_seconds / 60:.0f}min window). "
                                f"Use POST /v1/ips/agents/{sender.id}/reinstate to lift suspension."
                            ),
                            details={
                                "agent_id": str(sender.id),
                                "agent_name": sender.name,
                                "violation_count": check["violation_count"],
                                "critical_count": check["critical_count"],
                                "window_seconds": check["window_seconds"],
                                "auto_suspended": True,
                            },
                        )
                        db.add(suspension_alert)
                    except Exception:
                        pass

                    await db.commit()
        except Exception:
            pass  # Auto-containment failure must not affect the decision

    # ---------- Post-decision: Spend Ledger Recording ----------
    with contextlib.suppress(Exception):
        await record_spend_transaction(
            workspace_id=workspace.id,
            agent_id=sender.id,
            task_id=uuid.UUID(request_data["task_id"]),
            tokens=estimated_tokens,
            model_name=groq_result.get("model") if groq_result else None,
            operation="inspect",
            db=db,
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
    await db.commit()


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

    # Resolve declared_intent and intent_drift_score from request_data extras
    # (set by run_inspection before calling _save_and_return)
    _declared_intent = req.get("_declared_intent")
    _intent_drift_score = req.get("_intent_drift_score")

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
        resource_type=req.get("resource_type"),
        resource_id=req.get("resource_id"),
        action=req.get("action"),
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
        declared_intent=_declared_intent,
        intent_drift_score=_intent_drift_score,
    )
    db.add(task)
    await db.flush()

    _VALID_DB_LAYERS = {"schema", "rule", "semantic", "policy"}
    for v in violations:
        raw_layer = v.get("layer", "rule")
        db_layer = raw_layer if raw_layer in _VALID_DB_LAYERS else "rule"
        db.add(
            Violation(
                workspace_id=workspace.id,
                task_id=task_id,
                layer=db_layer,
                violation_type=v["violation_type"],
                severity=v.get("severity", "medium"),
                details=v.get("details", {}),
            )
        )

    # Record DelegationChain entry if delegation_token was supplied
    _delegation_token_compact = req.get("_delegation_token_compact")
    if _delegation_token_compact:
        receiver_id = uuid.UUID(req["receiver_agent_id"])
        _parent_caveats = req.get("_parent_caveats", [])
        _delegation_depth = req.get("_delegation_depth", 0)
        _delegation_sig_valid = req.get("_delegation_signature_valid", True)
        _chain_hash = hashlib.sha256(f"{task_id}:{_delegation_token_compact}".encode()).hexdigest()

        db.add(
            DelegationChain(
                workspace_id=workspace.id,
                task_id=task_id,
                sender_agent_id=sender.id,
                receiver_agent_id=receiver_id,
                delegation_depth=_delegation_depth,
                caveats=_parent_caveats,
                delegation_token=_delegation_token_compact,
                signature_valid=_delegation_sig_valid,
                chain_hash=_chain_hash,
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
        resource_type=req.get("resource_type"),
        resource_id=req.get("resource_id"),
        action=req.get("action"),
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
    _VALID_DB_LAYERS = {"schema", "rule", "semantic", "policy"}
    for v in violations:
        raw_layer = v.get("layer", "rule")
        db_layer = raw_layer if raw_layer in _VALID_DB_LAYERS else "rule"
        db.add(
            Violation(
                workspace_id=workspace.id,
                task_id=task_id,
                layer=db_layer,
                violation_type=v["violation_type"],
                severity=v.get("severity", "medium"),
                details=v.get("details", {}),
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
        review_token = ri.review_token if ri and ri.status == "pending" else None

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
