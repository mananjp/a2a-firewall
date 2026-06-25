from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.db.database import get_db
from app.db.models import Workspace
from app.core.security import generate_api_key

router = APIRouter()

class WorkspaceCreate(BaseModel):
    name: str
    admin_email: str

@router.post("/register")
async def register_workspace(body: WorkspaceCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Workspace).where(Workspace.admin_email == body.admin_email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")
    raw_key, key_hash = generate_api_key("ws")
    ws = Workspace(name=body.name, admin_email=body.admin_email, api_key_hash=key_hash)
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return {"workspace_id": str(ws.id), "api_key": raw_key, "name": ws.name}
