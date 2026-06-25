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
