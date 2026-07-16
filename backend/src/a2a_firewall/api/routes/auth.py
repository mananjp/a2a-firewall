"""DEV-ONLY auth endpoint.

Email-based "login" for the dashboard. Since we hash API keys at rest (no
plaintext storage), this endpoint cannot recover the existing key from the
hash. Instead it ROTATES the key on every login — the caller receives a
fresh key. This is acceptable for dev/testing because the frontend can
persist it in localStorage for the session.

Disabled when DEBUG=false. In production this endpoint should not exist
or should require proper password authentication (out of MVP scope).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.core.config import settings
from a2a_firewall.core.security import generate_api_key
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Workspace

router = APIRouter()


class LoginRequest(BaseModel):
    email: str


@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """DEV ONLY: rotate and return the workspace key for matching admin_email.

    If no workspace exists for the email and DEBUG is on, auto-provisions one
    (first-login provisioning). Returns 403 when DEBUG=false.
    Each successful call rotates the key — old key becomes invalid.
    """
    if not settings.DEBUG:
        raise HTTPException(
            status_code=403,
            detail="Login endpoint is dev-only and disabled when DEBUG=false",
        )
    result = await db.execute(select(Workspace).where(Workspace.admin_email == body.email))
    ws = result.scalar_one_or_none()

    if not ws:
        # Auto-provision workspace on first login (dev-only convenience)
        new_raw, new_hash = generate_api_key("ws")
        ws = Workspace(
            name=body.email.split("@")[0] + "'s workspace",
            admin_email=body.email,
            api_key_hash=new_hash,
        )
        db.add(ws)
        await db.commit()
        await db.refresh(ws)
        return {
            "workspace_id": str(ws.id),
            "admin_email": ws.admin_email,
            "api_key": new_raw,
            "warning": "DEV ONLY: workspace was auto-created on first login.",
        }

    new_raw, new_hash = generate_api_key("ws")
    ws.api_key_hash = new_hash  # type: ignore[assignment]
    await db.commit()
    await db.refresh(ws)
    return {
        "workspace_id": str(ws.id),
        "admin_email": ws.admin_email,
        "api_key": new_raw,
        "warning": "DEV ONLY: key was rotated on login. Use a password-protected flow in prod.",
    }
