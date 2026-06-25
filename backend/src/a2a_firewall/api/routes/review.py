from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import ReviewItem, Workspace

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
    return [
        {
            "id": str(i.id),
            "task_id": str(i.task_id),
            "review_token": i.review_token,
            "expires_at": str(i.expires_at),
        }
        for i in items
    ]


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
    item.status = "approved" if body.action == "approve" else "rejected"  # type: ignore[assignment]
    item.reviewer_notes = body.notes  # type: ignore[assignment]
    item.decided_at = datetime.now(UTC)  # type: ignore[assignment]
    await db.commit()
    return {"status": item.status, "decided_at": str(item.decided_at)}


@router.get("/{review_token}/status")
async def review_status(review_token: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    result = await db.execute(select(ReviewItem).where(ReviewItem.review_token == review_token))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Review token not found")
    return {"status": item.status, "reviewer_notes": item.reviewer_notes}
