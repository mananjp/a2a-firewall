from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, Any, Dict
from app.db.database import get_db
from app.db.models import PolicyRule, Workspace
from app.api.deps import get_current_workspace
import uuid

router = APIRouter()

class PolicyCreate(BaseModel):
    priority: int
    name: str
    description: Optional[str] = None
    sender_id: Optional[str] = None
    receiver_id: Optional[str] = None
    task_type: Optional[str] = None
    condition_expr: Optional[Dict[str, Any]] = None
    action: str
    block_reason: Optional[str] = None

@router.get("")
async def list_policies(ws: Workspace = Depends(get_current_workspace), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PolicyRule).where(PolicyRule.workspace_id == ws.id, PolicyRule.is_active == True)
        .order_by(PolicyRule.priority)
    )
    rules = result.scalars().all()
    return [{"id": str(r.id), "priority": r.priority, "name": r.name, "action": r.action} for r in rules]

@router.post("")
async def create_policy(body: PolicyCreate, ws: Workspace = Depends(get_current_workspace), db: AsyncSession = Depends(get_db)):
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
        block_reason=body.block_reason
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {"id": str(rule.id), "priority": rule.priority, "name": rule.name}

@router.delete("/{rule_id}")
async def delete_policy(rule_id: str, ws: Workspace = Depends(get_current_workspace), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PolicyRule).where(PolicyRule.id == uuid.UUID(rule_id), PolicyRule.workspace_id == ws.id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    rule.is_active = False
    await db.commit()
    return {"deleted": rule_id}
