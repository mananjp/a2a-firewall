from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.db.database import get_db
from app.db.models import Task, Violation, Workspace
from app.api.deps import get_current_workspace
import uuid

router = APIRouter()

@router.get("/{task_id}")
async def get_task(task_id: str, ws: Workspace = Depends(get_current_workspace), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task).where(Task.id == uuid.UUID(task_id), Task.workspace_id == ws.id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    viols = await db.execute(select(Violation).where(Violation.task_id == task.id))
    violations = viols.scalars().all()
    return {
        "id": str(task.id), "decision": task.decision, "risk_score": task.risk_score,
        "groq_rationale": task.groq_rationale, "groq_injection_detected": task.groq_injection_detected,
        "groq_hallucination_flags": task.groq_hallucination_flags,
        "depth": task.depth, "task_type": task.task_type,
        "violations": [{"layer": v.layer, "type": v.violation_type, "severity": v.severity, "details": v.details} for v in violations]
    }

@router.get("/{task_id}/lineage")
async def task_lineage(task_id: str, ws: Workspace = Depends(get_current_workspace), db: AsyncSession = Depends(get_db)):
    lineage_sql = """
        WITH RECURSIVE lineage AS (
            SELECT id, parent_task_id, sender_id, receiver_id, task_type, decision, depth
            FROM tasks WHERE id = :task_id
            UNION ALL
            SELECT t.id, t.parent_task_id, t.sender_id, t.receiver_id, t.task_type, t.decision, t.depth
            FROM tasks t JOIN lineage l ON t.id = l.parent_task_id
        )
        SELECT * FROM lineage ORDER BY depth
    """
    result = await db.execute(text(lineage_sql), {"task_id": task_id})
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]
