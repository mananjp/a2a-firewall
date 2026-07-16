from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import PolicyRule, Workspace

router = APIRouter()


class PolicyCreate(BaseModel):
    priority: int
    name: str
    description: str | None = None
    sender_id: str | None = None
    receiver_id: str | None = None
    task_type: str | None = None
    condition_expr: dict[str, Any] | None = None
    action: str
    block_reason: str | None = None


@router.get("")
async def list_policies(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(PolicyRule)
        .where(PolicyRule.workspace_id == ws.id, PolicyRule.is_active.is_(True))
        .order_by(PolicyRule.priority)
    )
    rules = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "priority": r.priority,
            "name": r.name,
            "action": r.action,
            "task_type": r.task_type,
            "description": r.description,
        }
        for r in rules
    ]


@router.post("")
async def create_policy(
    body: PolicyCreate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rule = PolicyRule(
        workspace_id=ws.id,
        priority=body.priority,
        name=body.name,
        description=body.description,
        sender_id=uuid.UUID(body.sender_id) if body.sender_id else None,
        receiver_id=uuid.UUID(body.receiver_id) if body.receiver_id else None,
        task_type=body.task_type,
        condition_expr=body.condition_expr,
        action=body.action,
        block_reason=body.block_reason,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {
        "id": str(rule.id),
        "priority": rule.priority,
        "name": rule.name,
        "action": rule.action,
        "task_type": rule.task_type,
        "description": rule.description,
    }


@router.delete("/{rule_id}")
async def delete_policy(
    rule_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await db.execute(
        select(PolicyRule).where(
            PolicyRule.id == uuid.UUID(rule_id), PolicyRule.workspace_id == ws.id
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    rule.is_active = False  # type: ignore[assignment]
    await db.commit()
    return {"deleted": rule_id}
