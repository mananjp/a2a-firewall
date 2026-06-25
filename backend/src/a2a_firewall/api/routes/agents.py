from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.core.security import generate_api_key
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Agent, Workspace

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
