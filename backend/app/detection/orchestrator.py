import time, hashlib, json, uuid, secrets
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Task, Violation, ReviewItem
from app.detection.layer0_preflight import preflight
from app.detection.layer1_schema import validate_schema
from app.detection.layer2_permissions import check_permissions
from app.detection.layer3_rules import run_rules
from app.detection.layer4_groq import groq_inspect
from app.detection.layer5_decision import make_decision

async def run_inspection(request_data: dict, sender, workspace, db: AsyncSession):
    start = time.monotonic()
    violations = []
    risk_score = 0.0
    matched_rule_id = None
    groq_result = None

    payload_str = json.dumps(request_data["payload"], sort_keys=True)
    payload_hash = hashlib.sha256(payload_str.encode()).hexdigest()
    payload_size = len(payload_str.encode())

    pre = await preflight(request_data, sender, workspace, payload_size, db)
    if pre:
        violations.extend(pre["violations"])
        risk_score = max(risk_score, pre.get("risk_score", 0))
        if pre.get("block"):
            return await _save_and_return("block", pre["reason"], request_data, sender, workspace,
                                          payload_hash, payload_size, risk_score, violations,
                                          None, False, None, start, db)

    schema_result = await validate_schema(request_data, workspace, db)
    if schema_result["violations"]:
        violations.extend(schema_result["violations"])
        return await _save_and_return("block", "schema_validation_failed", request_data, sender,
                                      workspace, payload_hash, payload_size, 1.0, violations,
                                      None, False, None, start, db)

    perm_result = await check_permissions(request_data, sender, workspace, db)
    if not perm_result["allowed"]:
        violations.append({"layer": "rule", "violation_type": "sender_not_permitted",
                            "severity": "high", "details": {}})
        return await _save_and_return("block", "permission_denied", request_data, sender,
                                      workspace, payload_hash, payload_size, 1.0, violations,
                                      None, False, None, start, db)

    rule_result = await run_rules(request_data, sender, workspace, db)
    violations.extend(rule_result["violations"])
    risk_score = min(1.0, risk_score + rule_result["risk_delta"])
    matched_rule_id = rule_result.get("matched_rule_id")
    if risk_score >= workspace.block_threshold:
        return await _save_and_return("block", "rule_threshold_exceeded", request_data, sender,
                                      workspace, payload_hash, payload_size, risk_score, violations,
                                      None, False, matched_rule_id, start, db)

    groq_called = False
    groq_model = None
    if risk_score >= workspace.groq_threshold:
        groq_result = await groq_inspect(request_data, sender, workspace, payload_hash)
        groq_called = True
        groq_model = groq_result.get("model")
        if groq_result.get("injection_detected"):
            violations.append({"layer": "semantic", "violation_type": "prompt_injection",
                                "severity": "critical", "details": groq_result})
        risk_score = min(1.0, risk_score + groq_result.get("risk_score_delta", 0))

    decision = make_decision(risk_score, rule_result.get("matched_rule_action"), workspace)
    return await _save_and_return(decision, None, request_data, sender, workspace,
                                  payload_hash, payload_size, risk_score, violations,
                                  groq_result, groq_called, matched_rule_id, start, db, groq_model)


async def _save_and_return(decision, reason, req, sender, workspace, payload_hash,
                            payload_size, risk_score, violations, groq_result, groq_called,
                            matched_rule_id, start, db, groq_model=None):
    task_id = uuid.UUID(req["task_id"])
    total_ms = int((time.monotonic() - start) * 1000)
    review_token = None
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
        matched_rule_id=uuid.UUID(str(matched_rule_id)) if matched_rule_id else None,
        groq_called=bool(groq_called),
        groq_model=groq_model,
        groq_injection_detected=groq_result.get("injection_detected") if groq_result else None,
        groq_hallucination_flags=groq_result.get("hallucination_flags") if groq_result else None,
        groq_risk_delta=groq_result.get("risk_score_delta") if groq_result else None,
        groq_rationale=groq_result.get("rationale") if groq_result else None,
        groq_latency_ms=groq_result.get("latency_ms") if groq_result else None,
        total_latency_ms=total_ms,
        trace_id=req.get("trace_id"),
        span_id=req.get("parent_span_id")
    )
    db.add(task)

    for v in violations:
        db.add(Violation(
            workspace_id=workspace.id,
            task_id=task_id,
            layer=v["layer"],
            violation_type=v["violation_type"],
            severity=v["severity"],
            details=v.get("details", {})
        ))

    if decision == "review" and review_token:
        db.add(ReviewItem(
            workspace_id=workspace.id,
            task_id=task_id,
            review_token=review_token,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30)
        ))

    await db.commit()
    return {
        "task_id": str(task_id),
        "decision": decision,
        "allowed_to_proceed": decision in ("allow", "review"),
        "risk_score": risk_score,
        "violations": violations,
        "review_token": review_token,
        "block_reason": reason,
        "latency_ms": total_ms
    }
