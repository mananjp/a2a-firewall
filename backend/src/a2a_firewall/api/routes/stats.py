from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Task, Workspace

router = APIRouter()


@router.get("/overview")
async def overview(
    ws: Workspace = Depends(get_current_workspace), db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    total_r = await db.execute(
        select(func.count()).select_from(Task).where(Task.workspace_id == ws.id)
    )
    total = total_r.scalar_one()
    blocked_r = await db.execute(
        select(func.count())
        .select_from(Task)
        .where(Task.workspace_id == ws.id, Task.decision == "block")
    )
    blocked = blocked_r.scalar_one()
    groq_r = await db.execute(
        select(func.count())
        .select_from(Task)
        .where(Task.workspace_id == ws.id, Task.groq_called.is_(True))
    )
    groq_calls = groq_r.scalar_one()
    avg_r = await db.execute(
        select(func.avg(Task.total_latency_ms)).where(Task.workspace_id == ws.id)
    )
    avg_lat = avg_r.scalar_one()
    return {
        "total_tasks": total,
        "blocked": blocked,
        "blocked_pct": round(blocked / total * 100, 1) if total else 0,
        "groq_calls_today": groq_calls,
        "avg_latency_ms": round(avg_lat or 0, 1),
    }
