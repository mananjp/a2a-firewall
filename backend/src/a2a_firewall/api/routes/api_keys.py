"""API Key management endpoints for fine-grained multi-key access control."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace_flexible
from a2a_firewall.core.security import hash_api_key
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import APIKeyRecord, Workspace

router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class CreateAPIKeyRequest(BaseModel):
    name: str = Field("Default Key", max_length=100, description="Label for this API key")
    expires_in_days: int | None = Field(None, ge=1, le=365, description="Optional expiry in days")


class APIKeyItem(BaseModel):
    id: str
    name: str
    key_prefix: str
    created_at: str | None = None
    last_used_at: str | None = None
    expires_at: str | None = None
    is_revoked: bool


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=list[APIKeyItem])
async def list_api_keys(
    workspace: Workspace = Depends(get_current_workspace_flexible),
    db: AsyncSession = Depends(get_db),
) -> list[APIKeyItem]:
    """List all API keys created for the workspace."""
    result = await db.execute(
        select(APIKeyRecord)
        .where(
            APIKeyRecord.workspace_id == workspace.id,
            APIKeyRecord.is_revoked.is_(False),
        )
        .order_by(APIKeyRecord.created_at.desc())
    )
    records = result.scalars().all()
    return [
        APIKeyItem(
            id=str(r.id),
            name=r.name,
            key_prefix=r.key_prefix,
            created_at=r.created_at.isoformat() if r.created_at else None,
            last_used_at=r.last_used_at.isoformat() if r.last_used_at else None,
            expires_at=r.expires_at.isoformat() if r.expires_at else None,
            is_revoked=r.is_revoked,
        )
        for r in records
    ]


@router.post("")
async def create_api_key(
    body: CreateAPIKeyRequest,
    workspace: Workspace = Depends(get_current_workspace_flexible),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Generate a new named API key for the workspace.

    The raw API key is returned exactly once. Store it securely.
    """
    raw_token = secrets.token_urlsafe(32)
    raw_key = f"a2a_sk_{raw_token}"
    prefix = f"{raw_key[:12]}...{raw_key[-4:]}"
    key_hash = hash_api_key(raw_key)

    expires_at = None
    if body.expires_in_days:
        expires_at = datetime.now(UTC) + timedelta(days=body.expires_in_days)

    record = APIKeyRecord(
        workspace_id=workspace.id,
        name=body.name.strip() or "Default Key",
        key_prefix=prefix,
        key_hash=key_hash,
        expires_at=expires_at,
        is_revoked=False,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    return {
        "id": str(record.id),
        "name": record.name,
        "api_key": raw_key,
        "key_prefix": record.key_prefix,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "expires_at": record.expires_at.isoformat() if record.expires_at else None,
        "message": "API key generated. Store it securely — it will not be displayed again.",
    }


@router.delete("/{key_id}")
async def revoke_api_key(
    key_id: str,
    workspace: Workspace = Depends(get_current_workspace_flexible),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Revoke an API key immediately."""
    try:
        key_uuid = uuid.UUID(key_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid API key ID format") from None


    result = await db.execute(
        select(APIKeyRecord).where(
            APIKeyRecord.id == key_uuid,
            APIKeyRecord.workspace_id == workspace.id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="API key not found")

    record.is_revoked = True
    await db.commit()

    return {
        "status": "revoked",
        "id": str(record.id),
        "message": f"API key '{record.name}' has been revoked.",
    }
