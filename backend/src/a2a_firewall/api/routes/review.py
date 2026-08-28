from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import ReviewItem, Task, Workspace

router = APIRouter()


@router.get("")
async def pending_queue(
    ws: Workspace = Depends(get_current_workspace), db: AsyncSession = Depends(get_db)
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(ReviewItem)
        .where(ReviewItem.workspace_id == ws.id, ReviewItem.status == "pending")
        .order_by(ReviewItem.created_at)
    )
    items = result.scalars().all()
    out = []
    for i in items:
        task_res = await db.execute(select(Task).where(Task.id == i.task_id))
        task = task_res.scalar_one_or_none()
        out.append(
            {
                "id": str(i.id),
                "task_id": str(i.task_id),
                "review_token": i.review_token,
                "expires_at": str(i.expires_at),
                "task_type": task.task_type if task else None,
                "risk_score": task.risk_score if task else 0.6,
                "payload": task.payload if task else None,
                "decision_reason": task.decision_reason if task else None,
            }
        )
    return out


class DecideBody(BaseModel):
    action: str
    notes: str | None = None


@router.post("/{review_token}/decide")
async def decide_review(
    review_token: str,
    body: DecideBody,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await db.execute(select(ReviewItem).where(ReviewItem.review_token == review_token))
    item = result.scalar_one_or_none()
    if not item or str(item.workspace_id) != str(ws.id):
        raise HTTPException(404, "Review item not found")
    if item.status != "pending":
        raise HTTPException(409, f"Already {item.status}")
    item.status = "approved" if body.action == "approve" else "rejected"
    item.reviewer_notes = body.notes
    item.decided_at = datetime.now(UTC)
    await db.commit()
    return {"status": item.status, "decided_at": str(item.decided_at)}


@router.get("/{review_token}/status")
async def review_status(review_token: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    result = await db.execute(select(ReviewItem).where(ReviewItem.review_token == review_token))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Review token not found")
    return {"status": item.status, "reviewer_notes": item.reviewer_notes}
