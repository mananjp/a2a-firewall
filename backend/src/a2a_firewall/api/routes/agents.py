from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_agent, get_current_workspace
from a2a_firewall.core.security import generate_api_key
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Agent, AgentPermission, Workspace

router = APIRouter()


class AgentCreate(BaseModel):
    name: str
    description: str | None = None
    capabilities: list[str] = []


@router.post("")
async def register_agent(
    body: AgentCreate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    raw_key, key_hash = generate_api_key("agt")
    agent = Agent(
        workspace_id=ws.id,
        name=body.name,
        description=body.description,
        api_key_hash=key_hash,
        capabilities=body.capabilities,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return {"agent_id": str(agent.id), "name": agent.name, "api_key": raw_key}


@router.get("/me")
async def get_my_agent(agent: Agent = Depends(get_current_agent)) -> dict[str, Any]:
    """Return the agent identified by the Bearer token (agent key)."""
    return {
        "id": str(agent.id),
        "workspace_id": str(agent.workspace_id),
        "name": agent.name,
        "description": agent.description,
        "status": agent.status,
        "capabilities": agent.capabilities,
    }


@router.get("/{agent_id}")
async def get_agent(
    agent_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await db.execute(
        select(Agent).where(Agent.id == uuid.UUID(agent_id), Agent.workspace_id == ws.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        from fastapi import HTTPException

        raise HTTPException(404, "Agent not found")
    return {
        "id": str(agent.id),
        "name": agent.name,
        "description": agent.description,
        "status": agent.status,
        "capabilities": agent.capabilities,
    }


class PermissionCreate(BaseModel):
    receiver_id: str
    task_type: str | None = None
    allowed: bool = True


@router.post("/{agent_id}/permissions")
async def create_permission(
    agent_id: str,
    body: PermissionCreate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Grant or deny permission for `agent_id` to send to `receiver_id`."""
    perm = AgentPermission(
        workspace_id=ws.id,
        sender_id=uuid.UUID(agent_id),
        receiver_id=uuid.UUID(body.receiver_id),
        task_type=body.task_type,
        allowed=body.allowed,
    )
    db.add(perm)
    await db.commit()
    await db.refresh(perm)
    return {
        "id": str(perm.id),
        "sender_id": str(perm.sender_id),
        "receiver_id": str(perm.receiver_id),
        "task_type": perm.task_type,
        "allowed": perm.allowed,
    }


@router.get("")
async def list_agents(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    result = await db.execute(select(Agent).where(Agent.workspace_id == ws.id))
    agents = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "name": a.name,
            "status": a.status,
            "capabilities": a.capabilities,
        }
        for a in agents
    ]
