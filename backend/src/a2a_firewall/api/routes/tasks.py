from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Task, TraceEvent, Violation, Workspace

router = APIRouter()


@router.get("")
async def list_recent_tasks(
    limit: int = 20,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return the most recent tasks for this workspace (live feed)."""
    result = await db.execute(
        select(Task).where(Task.workspace_id == ws.id).order_by(Task.created_at.desc()).limit(limit)
    )
    tasks = result.scalars().all()
    task_ids = [t.id for t in tasks]

    violations_by_task: dict[uuid.UUID, list[Violation]] = {}
    if task_ids:
        v_result = await db.execute(select(Violation).where(Violation.task_id.in_(task_ids)))
        for v in v_result.scalars().all():
            violations_by_task.setdefault(v.task_id, []).append(v)

    def _get_violating_layer(t: Task, viols: list[Violation]) -> str | None:
        if viols:
            v0 = viols[0]
            vtype = (v0.violation_type or "").lower()
            vlayer = (v0.layer or "").lower()
            if "rate" in vtype or "rate" in vlayer:
                return "rate"
            if (
                any(k in vtype for k in ("nonce", "replay", "canary", "pentest", "preflight"))
                or "preflight" in vlayer
            ):
                return "preflight"
            if "schema" in vtype or "schema" in vlayer:
                return "schema"
            if any(
                k in vtype for k in ("permission", "unauthorized", "amplification", "delegation")
            ) or any(k in vlayer for k in ("permission", "delegation")):
                return "permission"
            if (
                any(k in vtype for k in ("injection", "drift", "semantic", "groq", "hallucination"))
                or "semantic" in vlayer
            ):
                return "groq"
            return vlayer or "rule"
        if t.decision == "block":
            reason = (t.decision_reason or "").lower()
            if "rate" in reason:
                return "rate"
            if any(k in reason for k in ("preflight", "nonce", "replay", "pentest", "canary")):
                return "preflight"
            if "schema" in reason:
                return "schema"
            if any(
                k in reason for k in ("permission", "unauthorized", "amplification", "delegation")
            ):
                return "permission"
            if any(k in reason for k in ("injection", "prompt", "groq", "drift", "hallucination")):
                return "groq"
            if "rule" in reason or "policy" in reason or "sql" in reason:
                return "rule"
            if t.total_latency_ms is not None and t.total_latency_ms <= 2:
                return "preflight"
            return "rule"
        return None

    return [
        {
            "id": str(t.id),
            "task_type": t.task_type,
            "decision": t.decision,
            "risk_score": t.risk_score,
            "decision_reason": t.decision_reason,
            "total_latency_ms": t.total_latency_ms,
            "groq_called": t.groq_called,
            "groq_injection_detected": t.groq_injection_detected,
            "depth": t.depth,
            "trace_id": t.trace_id,
            "created_at": str(t.created_at),
            "violating_layer": _get_violating_layer(t, violations_by_task.get(t.id, [])),
            "violations": [
                {
                    "layer": v.layer,
                    "type": v.violation_type,
                    "violation_type": v.violation_type,
                    "severity": v.severity,
                    "details": v.details,
                }
                for v in violations_by_task.get(t.id, [])
            ],
        }
        for t in tasks
    ]


@router.get("/by-trace/{trace_id}")
async def trace_events(
    trace_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return all trace_events for a given trace_id, scoped to current workspace.

    Each event carries event_name, span_id, parent_span_id, attributes, duration_ms.
    Ordered by created_at so the dashboard can render a timeline.
    """
    result = await db.execute(
        select(TraceEvent)
        .where(TraceEvent.workspace_id == ws.id, TraceEvent.trace_id == trace_id)
        .order_by(TraceEvent.created_at)
    )
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "event_name": e.event_name,
            "span_id": e.span_id,
            "parent_span_id": e.parent_span_id,
            "duration_ms": e.duration_ms,
            "task_id": str(e.task_id) if e.task_id else None,
            "attributes": e.attributes,
            "created_at": str(e.created_at),
        }
        for e in events
    ]


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await db.execute(
        select(Task).where(Task.id == uuid.UUID(task_id), Task.workspace_id == ws.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    viols = await db.execute(select(Violation).where(Violation.task_id == task.id))
    violations = viols.scalars().all()
    return {
        "id": str(task.id),
        "decision": task.decision,
        "risk_score": task.risk_score,
        "groq_rationale": task.groq_rationale,
        "groq_injection_detected": task.groq_injection_detected,
        "groq_hallucination_flags": task.groq_hallucination_flags,
        "depth": task.depth,
        "task_type": task.task_type,
        "trace_id": task.trace_id,
        "span_id": task.span_id,
        "violations": [
            {
                "layer": v.layer,
                "type": v.violation_type,
                "severity": v.severity,
                "details": v.details,
            }
            for v in violations
        ],
    }


@router.get("/{task_id}/lineage")
async def task_lineage(
    task_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return the lineage (ancestor chain) for a task, scoped to the current workspace.

    Returns 404 if the task does not belong to this workspace — prevents
    cross-tenant lineage leakage.
    """
    # Tenant isolation: confirm the task belongs to this workspace before
    # walking the lineage. The CTE itself also filters by workspace_id.
    task_check = await db.execute(
        select(Task.id).where(Task.id == uuid.UUID(task_id), Task.workspace_id == ws.id)
    )
    if task_check.scalar_one_or_none() is None:
        raise HTTPException(404, "Task not found")

    lineage_sql = """
        WITH RECURSIVE lineage AS (
            SELECT id, parent_task_id, sender_id, receiver_id, task_type, decision, depth
            FROM tasks WHERE id = :task_id AND workspace_id = :ws_id
            UNION ALL
            SELECT t.id, t.parent_task_id, t.sender_id, t.receiver_id, t.task_type, t.decision, t.depth
            FROM tasks t JOIN lineage l ON t.id = l.parent_task_id
            WHERE t.workspace_id = :ws_id
        )
        SELECT * FROM lineage ORDER BY depth
    """
    result = await db.execute(text(lineage_sql), {"task_id": task_id, "ws_id": str(ws.id)})
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]
