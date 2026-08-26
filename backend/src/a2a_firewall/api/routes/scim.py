"""SCIM 2.0 (System for Cross-domain Identity Management) API Routes.

Implements RFC 7643 & RFC 7644 specification for automated user provisioning,
deprovisioning, and attribute synchronization from identity providers (Okta, Microsoft Entra ID, OneLogin).
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.core.audit_logger import log_audit_event
from a2a_firewall.core.security import hash_api_key
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import SCIMToken, Workspace, WorkspaceMember

router = APIRouter()

SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User"
SCIM_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse"
SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error"


async def get_scim_workspace(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> Workspace:
    """Authenticate SCIM requests via Bearer token (either standard Workspace key or dedicated SCIM token)."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, detail={"schemas": [SCIM_ERROR_SCHEMA], "detail": "Invalid auth header", "status": "401"})
    raw_key = authorization.removeprefix("Bearer ").strip()
    key_hash = hash_api_key(raw_key)

    # Check dedicated SCIM tokens
    token_res = await db.execute(select(SCIMToken).where(SCIMToken.token_hash == key_hash))
    scim_tok = token_res.scalar_one_or_none()
    if scim_tok:
        ws_res = await db.execute(select(Workspace).where(Workspace.id == scim_tok.workspace_id))
        ws = ws_res.scalar_one_or_none()
        if ws:
            scim_tok.last_used_at = datetime.utcnow()
            await db.commit()
            return ws

    # Fallback check workspace standard key
    ws_res = await db.execute(select(Workspace).where(Workspace.api_key_hash == key_hash))
    ws = ws_res.scalar_one_or_none()
    if not ws:
        raise HTTPException(401, detail={"schemas": [SCIM_ERROR_SCHEMA], "detail": "Invalid SCIM Bearer token", "status": "401"})
    return ws


def _to_scim_user(m: WorkspaceMember) -> dict[str, Any]:
    """Format WorkspaceMember into standard RFC 7643 SCIM User representation."""
    return {
        "schemas": [SCIM_USER_SCHEMA],
        "id": str(m.id),
        "externalId": m.scim_external_id or str(m.id),
        "userName": m.email,
        "name": {
            "formatted": m.name,
            "givenName": m.name.split(" ")[0] if " " in m.name else m.name,
            "familyName": m.name.split(" ")[-1] if " " in m.name else "",
        },
        "displayName": m.name,
        "emails": [{"value": m.email, "type": "work", "primary": True}],
        "roles": [{"value": m.role, "primary": True}],
        "active": m.is_active,
        "meta": {
            "resourceType": "User",
            "created": m.created_at.isoformat() if m.created_at else None,
            "lastModified": m.updated_at.isoformat() if m.updated_at else None,
            "location": f"/scim/v2/Users/{m.id}",
        },
    }


# ---------------------------------------------------------------------------
# SCIM Discovery Endpoints
# ---------------------------------------------------------------------------


@router.get("/ServiceProviderConfig")
async def get_service_provider_config() -> dict[str, Any]:
    """Return SCIM service provider configuration capabilities."""
    return {
        "schemas": ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
        "documentationUri": "https://a2afirewall.dev/docs/scim",
        "patch": {"supported": True},
        "bulk": {"supported": False, "maxOperations": 0, "maxPayloadSize": 0},
        "filter": {"supported": True, "maxResults": 200},
        "changePassword": {"supported": False},
        "sort": {"supported": False},
        "etag": {"supported": False},
        "authenticationSchemes": [
            {
                "name": "OAuth Bearer Token",
                "description": "Authentication via SCIM Bearer token",
                "specUri": "http://www.rfc-editor.org/info/rfc6750",
                "type": "oauthbearertoken",
                "primary": True,
            }
        ],
    }


@router.get("/ResourceTypes")
async def get_resource_types() -> list[dict[str, Any]]:
    """Return SCIM resource types."""
    return [
        {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
            "id": "User",
            "name": "User",
            "endpoint": "/scim/v2/Users",
            "description": "User Account in A2A Firewall",
            "schema": SCIM_USER_SCHEMA,
        },
        {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
            "id": "Group",
            "name": "Group",
            "endpoint": "/scim/v2/Groups",
            "description": "Group / Team in A2A Firewall",
            "schema": "urn:ietf:params:scim:schemas:core:2.0:Group",
        },
    ]


@router.get("/Schemas")
async def get_schemas() -> list[dict[str, Any]]:
    """Return SCIM schemas."""
    return [
        {
            "id": SCIM_USER_SCHEMA,
            "name": "User",
            "description": "Core User schema",
            "attributes": [
                {"name": "userName", "type": "string", "required": True},
                {"name": "displayName", "type": "string", "required": False},
                {"name": "emails", "type": "complex", "multiValued": True, "required": True},
                {"name": "active", "type": "boolean", "required": False},
                {"name": "roles", "type": "complex", "multiValued": True, "required": False},
            ],
        }
    ]


# ---------------------------------------------------------------------------
# SCIM User Management
# ---------------------------------------------------------------------------


@router.get("/Users")
async def list_scim_users(
    filter: str | None = None,
    startIndex: int = 1,
    count: int = 100,
    ws: Workspace = Depends(get_scim_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Query SCIM users with filter support."""
    stmt = select(WorkspaceMember).where(WorkspaceMember.workspace_id == ws.id)
    if filter and "userName eq" in filter:
        target_email = filter.split("userName eq")[-1].strip().strip('"').strip("'")
        stmt = stmt.where(WorkspaceMember.email == target_email)

    stmt = stmt.offset(max(0, startIndex - 1)).limit(count)
    res = await db.execute(stmt)
    members = res.scalars().all()

    resources = [_to_scim_user(m) for m in members]
    return {
        "schemas": [SCIM_LIST_SCHEMA],
        "totalResults": len(resources),
        "startIndex": startIndex,
        "itemsPerPage": len(resources),
        "Resources": resources,
    }


@router.post("/Users", status_code=201)
async def create_scim_user(
    request: Request,
    ws: Workspace = Depends(get_scim_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Provision a user from identity provider (Okta/Entra ID)."""
    body = await request.json()
    email = body.get("userName")
    if not email and body.get("emails"):
        email = body["emails"][0].get("value")

    if not email:
        raise HTTPException(400, detail={"schemas": [SCIM_ERROR_SCHEMA], "detail": "userName or email required", "status": "400"})

    name = body.get("displayName") or (body.get("name") or {}).get("formatted") or email.split("@")[0]
    active = body.get("active", True)
    ext_id = body.get("externalId")

    role = "developer"
    if body.get("roles"):
        role = body["roles"][0].get("value", "developer")

    # Check if already exists
    existing = await db.execute(
        select(WorkspaceMember).where(WorkspaceMember.workspace_id == ws.id, WorkspaceMember.email == email)
    )
    m = existing.scalar_one_or_none()

    if m is not None:
        m.name = name
        m.is_active = active
        m.scim_external_id = ext_id
        m.role = role
        m.updated_at = datetime.utcnow()
    else:
        m = WorkspaceMember(
            workspace_id=ws.id,
            email=email,
            name=name,
            role=role,
            is_active=active,
            scim_external_id=ext_id,
        )
        db.add(m)

    await db.commit()
    await db.refresh(m)

    await log_audit_event(
        workspace_id=ws.id,
        action="scim.user_provisioned",
        entity_type="member",
        entity_id=str(m.id),
        actor_email="scim_idp",
        actor_type="scim",
        description=f"SCIM provisioned user '{m.name}' ({m.email})",
        db=db,
    )

    return _to_scim_user(m)


@router.get("/Users/{user_id}")
async def get_scim_user(
    user_id: str,
    ws: Workspace = Depends(get_scim_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve single SCIM user by ID."""
    try:
        u_uuid = uuid.UUID(user_id)
    except ValueError as e:
        raise HTTPException(400, detail={"schemas": [SCIM_ERROR_SCHEMA], "detail": "Invalid UUID", "status": "400"}) from e

    res = await db.execute(select(WorkspaceMember).where(WorkspaceMember.id == u_uuid, WorkspaceMember.workspace_id == ws.id))
    m = res.scalar_one_or_none()
    if not m:
        raise HTTPException(404, detail={"schemas": [SCIM_ERROR_SCHEMA], "detail": "User not found", "status": "404"})
    return _to_scim_user(m)


@router.patch("/Users/{user_id}")
async def patch_scim_user(
    user_id: str,
    request: Request,
    ws: Workspace = Depends(get_scim_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Handle SCIM Patch operations (e.g. deprovisioning or active state toggle)."""
    try:
        u_uuid = uuid.UUID(user_id)
    except ValueError as e:
        raise HTTPException(400, detail={"schemas": [SCIM_ERROR_SCHEMA], "detail": "Invalid UUID", "status": "400"}) from e

    res = await db.execute(select(WorkspaceMember).where(WorkspaceMember.id == u_uuid, WorkspaceMember.workspace_id == ws.id))
    m = res.scalar_one_or_none()
    if not m:
        raise HTTPException(404, detail={"schemas": [SCIM_ERROR_SCHEMA], "detail": "User not found", "status": "404"})

    body = await request.json()
    ops = body.get("Operations", [])
    for op in ops:
        val = op.get("value")
        if isinstance(val, dict):
            if "active" in val:
                m.is_active = bool(val["active"])
            if "displayName" in val:
                m.name = val["displayName"]
            if "roles" in val and len(val["roles"]) > 0:
                m.role = val["roles"][0].get("value", m.role)
        elif op.get("path") == "active":
            m.is_active = bool(val)

    m.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(m)

    await log_audit_event(
        workspace_id=ws.id,
        action="scim.user_patched",
        entity_type="member",
        entity_id=str(m.id),
        actor_email="scim_idp",
        actor_type="scim",
        description=f"SCIM patched user '{m.name}' (active={m.is_active})",
        db=db,
    )

    return _to_scim_user(m)


@router.delete("/Users/{user_id}", status_code=204)
async def delete_scim_user(
    user_id: str,
    ws: Workspace = Depends(get_scim_workspace),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Deprovision SCIM user."""
    try:
        u_uuid = uuid.UUID(user_id)
    except ValueError as e:
        raise HTTPException(400, detail={"schemas": [SCIM_ERROR_SCHEMA], "detail": "Invalid UUID", "status": "400"}) from e

    res = await db.execute(select(WorkspaceMember).where(WorkspaceMember.id == u_uuid, WorkspaceMember.workspace_id == ws.id))
    m = res.scalar_one_or_none()
    if m:
        email = m.email
        await db.delete(m)
        await db.commit()

        await log_audit_event(
            workspace_id=ws.id,
            action="scim.user_deleted",
            entity_type="member",
            entity_id=user_id,
            actor_email="scim_idp",
            actor_type="scim",
            description=f"SCIM deleted user '{email}'",
            db=db,
        )

    return Response(status_code=204)


# ---------------------------------------------------------------------------
# SCIM Token Management (For Admin Dashboard)
# ---------------------------------------------------------------------------


class TokenCreateRequest(BaseModel):
    name: str = "Okta SCIM Integration"


@router.post("/tokens")
async def generate_scim_token(
    body: TokenCreateRequest,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Generate a dedicated SCIM 2.0 provisioning token for IdP setup."""
    raw_token = f"scim_{secrets.token_urlsafe(32)}"
    tok_hash = hash_api_key(raw_token)

    tok = SCIMToken(
        workspace_id=ws.id,
        token_hash=tok_hash,
        name=body.name,
    )
    db.add(tok)
    await db.commit()
    await db.refresh(tok)

    await log_audit_event(
        workspace_id=ws.id,
        action="scim.token_generated",
        entity_type="scim",
        entity_id=str(tok.id),
        actor_email=ws.admin_email,
        description=f"Generated SCIM token '{tok.name}'",
        db=db,
    )

    return {
        "id": str(tok.id),
        "name": tok.name,
        "token": raw_token,
        "warning": "Copy this token now. It will not be shown again in plaintext.",
        "scim_base_url": "/scim/v2",
        "created_at": tok.created_at.isoformat() if tok.created_at else None,
    }


@router.get("/tokens")
async def list_scim_tokens(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List active SCIM tokens."""
    res = await db.execute(select(SCIMToken).where(SCIMToken.workspace_id == ws.id).order_by(SCIMToken.created_at.desc()))
    tokens = res.scalars().all()
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in tokens
    ]
