from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.db.database import get_db
from app.db.models import Violation, Workspace
from app.api.deps import get_current_workspace
import uuid

router = APIRouter()

@router.get("")
async def list_violations(
    severity: Optional[str] = None,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    q = select(Violation).where(Violation.workspace_id == ws.id)
    if severity:
        q = q.where(Violation.severity == severity)
    q = q.order_by(Violation.created_at.desc()).limit(100)
    result = await db.execute(q)
    vs = result.scalars().all()
    return [{"id": str(v.id), "task_id": str(v.task_id), "layer": v.layer,
             "violation_type": v.violation_type, "severity": v.severity,
             "resolved": v.resolved, "created_at": str(v.created_at)} for v in vs]

class ResolveBody(BaseModel):
    notes: Optional[str] = None

@router.patch("/{violation_id}/resolve")
async def resolve_violation(
    violation_id: str,
    body: ResolveBody,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Violation).where(Violation.id == uuid.UUID(violation_id), Violation.workspace_id == ws.id))
    v = result.scalar_one_or_none()
    if not v:
        raise HTTPException(404, "Violation not found")
    v.resolved = True
    v.resolved_by = "admin"
    v.resolved_at = datetime.utcnow()
    await db.commit()
    return {"resolved": True}
