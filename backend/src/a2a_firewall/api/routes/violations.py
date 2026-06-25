from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Violation, Workspace

router = APIRouter()


@router.get("")
async def list_violations(
    severity: str | None = None,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    q = select(Violation).where(Violation.workspace_id == ws.id)
    if severity:
        q = q.where(Violation.severity == severity)
    q = q.order_by(Violation.created_at.desc()).limit(100)
    result = await db.execute(q)
    vs = result.scalars().all()
    return [
        {
            "id": str(v.id),
            "task_id": str(v.task_id),
            "layer": v.layer,
            "violation_type": v.violation_type,
            "severity": v.severity,
            "resolved": v.resolved,
            "created_at": str(v.created_at),
        }
        for v in vs
    ]


class ResolveBody(BaseModel):
    notes: str | None = None


@router.patch("/{violation_id}/resolve")
async def resolve_violation(
    violation_id: str,
    body: ResolveBody,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await db.execute(
        select(Violation).where(
            Violation.id == uuid.UUID(violation_id), Violation.workspace_id == ws.id
        )
    )
    v = result.scalar_one_or_none()
    if not v:
        raise HTTPException(404, "Violation not found")
    v.resolved = True  # type: ignore[assignment]
    v.resolved_by = "admin"  # type: ignore[assignment]
    v.resolved_at = datetime.now(UTC)  # type: ignore[assignment]
    await db.commit()
    return {"resolved": True}
