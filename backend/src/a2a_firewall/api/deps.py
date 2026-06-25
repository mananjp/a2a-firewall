from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.core.security import hash_api_key
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Agent, Workspace


async def get_current_agent(
    authorization: str = Header(...), db: AsyncSession = Depends(get_db)
) -> Agent:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth header")
    raw_key = authorization.removeprefix("Bearer ").strip()
    key_hash = hash_api_key(raw_key)
    result = await db.execute(select(Agent).where(Agent.api_key_hash == key_hash))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=401, detail="Invalid API key")
    if agent.status == "suspended":
        raise HTTPException(status_code=403, detail="Agent suspended")
    return agent


async def get_current_workspace(
    authorization: str = Header(...), db: AsyncSession = Depends(get_db)
) -> Workspace:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth header")
    raw_key = authorization.removeprefix("Bearer ").strip()
    key_hash = hash_api_key(raw_key)
    result = await db.execute(select(Workspace).where(Workspace.api_key_hash == key_hash))
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=401, detail="Invalid workspace key")
    return ws
