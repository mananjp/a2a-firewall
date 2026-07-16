from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.core.security import generate_api_key
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Workspace

router = APIRouter()


class WorkspaceCreate(BaseModel):
    name: str
    admin_email: str


@router.post("/register")
async def register_workspace(
    body: WorkspaceCreate, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    existing = await db.execute(select(Workspace).where(Workspace.admin_email == body.admin_email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")
    raw_key, key_hash = generate_api_key("ws")
    ws = Workspace(name=body.name, admin_email=body.admin_email, api_key_hash=key_hash)
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return {"workspace_id": str(ws.id), "api_key": raw_key, "name": ws.name}


@router.get("/me")
async def get_my_workspace(
    ws: Workspace = Depends(get_current_workspace),
) -> dict[str, Any]:
    """Return the workspace identified by the Bearer token (workspace key)."""
    return {
        "id": str(ws.id),
        "name": ws.name,
        "admin_email": ws.admin_email,
        "fail_mode": ws.fail_mode,
        "groq_threshold": ws.groq_threshold,
        "block_threshold": ws.block_threshold,
        "default_deny": ws.default_deny,
        "created_at": str(ws.created_at),
    }


class WorkspaceUpdate(BaseModel):
    fail_mode: str | None = None
    groq_threshold: float | None = None
    block_threshold: float | None = None
    default_deny: bool | None = None


@router.patch("/me")
async def update_my_workspace(
    body: WorkspaceUpdate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Update workspace configuration (thresholds, fail_mode, default_deny)."""
    if body.fail_mode is not None:
        if body.fail_mode not in ("open", "closed"):
            raise HTTPException(status_code=400, detail="fail_mode must be 'open' or 'closed'")
        ws.fail_mode = body.fail_mode  # type: ignore[assignment]
    if body.groq_threshold is not None:
        if not 0 <= body.groq_threshold <= 1:
            raise HTTPException(status_code=400, detail="groq_threshold must be between 0 and 1")
        ws.groq_threshold = body.groq_threshold  # type: ignore[assignment]
    if body.block_threshold is not None:
        if not 0 <= body.block_threshold <= 1:
            raise HTTPException(status_code=400, detail="block_threshold must be between 0 and 1")
        ws.block_threshold = body.block_threshold  # type: ignore[assignment]
    if body.default_deny is not None:
        ws.default_deny = body.default_deny  # type: ignore[assignment]
    await db.commit()
    await db.refresh(ws)
    return {
        "id": str(ws.id),
        "name": ws.name,
        "fail_mode": ws.fail_mode,
        "groq_threshold": ws.groq_threshold,
        "block_threshold": ws.block_threshold,
        "default_deny": ws.default_deny,
    }
