from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from app.db.database import get_db
from app.db.models import Agent, Workspace
from app.core.security import generate_api_key
from app.api.deps import get_current_workspace

router = APIRouter()

class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    capabilities: List[str] = []

@router.post("")
async def register_agent(
    body: AgentCreate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    raw_key, key_hash = generate_api_key("agt")
    agent = Agent(
        workspace_id=ws.id,
        name=body.name,
        description=body.description,
        api_key_hash=key_hash,
        capabilities=body.capabilities
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return {"agent_id": str(agent.id), "name": agent.name, "api_key": raw_key}

@router.get("")
async def list_agents(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Agent).where(Agent.workspace_id == ws.id))
    agents = result.scalars().all()
    return [{"id": str(a.id), "name": a.name, "status": a.status, "capabilities": a.capabilities} for a in agents]
