"""Role-Based Access Control (RBAC) and Organization Member routes."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.core.audit_logger import log_audit_event
from a2a_firewall.core.rbac_manager import (
    ALL_PERMISSIONS,
    STANDARD_ROLES,
    get_role_permissions,
)
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import CustomRole, Workspace, WorkspaceMember

router = APIRouter()


class MemberCreate(BaseModel):
    email: str
    name: str
    role: str = Field(
        "developer",
        description="admin, security_admin, soc_analyst, auditor, developer, viewer, or custom role name",
    )
    permissions: list[str] = Field(
        default_factory=list, description="Explicit fine-grained capability grants"
    )


class MemberUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    permissions: list[str] | None = None
    is_active: bool | None = None


class CustomRoleCreate(BaseModel):
    name: str
    description: str | None = None
    permissions: list[str]


@router.get("/permissions")
async def list_permissions() -> dict[str, Any]:
    """List all available fine-grained permission capabilities with human-readable descriptions."""
    return {
        "permissions": ALL_PERMISSIONS,
        "standard_roles": STANDARD_ROLES,
    }


@router.get("/roles")
async def list_roles(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """List all standard and custom roles configured in the workspace."""
    custom_res = await db.execute(select(CustomRole).where(CustomRole.workspace_id == ws.id))
    custom_roles = custom_res.scalars().all()

    return {
        "standard_roles": STANDARD_ROLES,
        "custom_roles": [
            {
                "id": str(r.id),
                "name": r.name,
                "description": r.description,
                "permissions": r.permissions,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in custom_roles
        ],
    }


@router.post("/roles")
async def create_custom_role(
    body: CustomRoleCreate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Create a new custom role with selected permissions."""
    role = CustomRole(
        workspace_id=ws.id,
        name=body.name,
        description=body.description,
        permissions=body.permissions,
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)

    await log_audit_event(
        workspace_id=ws.id,
        action="rbac.custom_role_created",
        entity_type="role",
        entity_id=str(role.id),
        actor_email=ws.admin_email,
        description=f"Created custom role '{role.name}' with {len(role.permissions)} permissions",
        db=db,
    )

    return {
        "id": str(role.id),
        "name": role.name,
        "description": role.description,
        "permissions": role.permissions,
    }


@router.get("/members")
async def list_members(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all team members and their active roles & permission capabilities."""
    res = await db.execute(
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == ws.id)
        .order_by(WorkspaceMember.created_at)
    )
    members = res.scalars().all()

    # If members list is empty, auto-include the primary workspace admin as a member
    if not members:
        admin_member = WorkspaceMember(
            workspace_id=ws.id,
            email=ws.admin_email,
            name=ws.name,
            role="admin",
            permissions=["*"],
            is_active=True,
        )
        db.add(admin_member)
        await db.commit()
        await db.refresh(admin_member)
        members = [admin_member]

    return [
        {
            "id": str(m.id),
            "email": m.email,
            "name": m.name,
            "role": m.role,
            "permissions": m.permissions,
            "effective_permissions": get_role_permissions(m.role, m.permissions),
            "is_active": m.is_active,
            "scim_external_id": m.scim_external_id,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in members
    ]


@router.post("/members")
async def invite_member(
    body: MemberCreate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Add or invite a new workspace member with role and fine-grained permissions."""
    existing = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == ws.id,
            WorkspaceMember.email == body.email,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Member with email '{body.email}' is already in this workspace")

    member = WorkspaceMember(
        workspace_id=ws.id,
        email=body.email,
        name=body.name,
        role=body.role,
        permissions=body.permissions,
        is_active=True,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)

    await log_audit_event(
        workspace_id=ws.id,
        action="rbac.member_added",
        entity_type="member",
        entity_id=str(member.id),
        actor_email=ws.admin_email,
        description=f"Added workspace member '{member.name}' ({member.email}) with role '{member.role}'",
        diff={"email": member.email, "role": member.role, "permissions": member.permissions},
        db=db,
    )

    return {
        "id": str(member.id),
        "email": member.email,
        "name": member.name,
        "role": member.role,
        "permissions": member.permissions,
        "is_active": member.is_active,
    }


@router.patch("/members/{member_id}")
async def update_member(
    member_id: str,
    body: MemberUpdate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Update role, permission grants, or active status of a team member."""
    try:
        m_uuid = uuid.UUID(member_id)
    except ValueError as e:
        raise HTTPException(400, "Invalid member_id UUID") from e

    res = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.id == m_uuid, WorkspaceMember.workspace_id == ws.id
        )
    )
    member = res.scalar_one_or_none()
    if not member:
        raise HTTPException(404, "Member not found")

    before = {"role": member.role, "permissions": member.permissions, "is_active": member.is_active}

    if body.name is not None:
        member.name = body.name
    if body.role is not None:
        member.role = body.role
    if body.permissions is not None:
        member.permissions = body.permissions
    if body.is_active is not None:
        member.is_active = body.is_active

    member.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(member)

    await log_audit_event(
        workspace_id=ws.id,
        action="rbac.member_updated",
        entity_type="member",
        entity_id=str(member.id),
        actor_email=ws.admin_email,
        description=f"Updated member '{member.name}' ({member.email})",
        diff={"before": before, "after": body.model_dump(exclude_unset=True)},
        db=db,
    )

    return {
        "id": str(member.id),
        "email": member.email,
        "name": member.name,
        "role": member.role,
        "permissions": member.permissions,
        "is_active": member.is_active,
    }


@router.delete("/members/{member_id}")
async def remove_member(
    member_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Remove a member from the workspace."""
    try:
        m_uuid = uuid.UUID(member_id)
    except ValueError as e:
        raise HTTPException(400, "Invalid member_id UUID") from e

    res = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.id == m_uuid, WorkspaceMember.workspace_id == ws.id
        )
    )
    member = res.scalar_one_or_none()
    if not member:
        raise HTTPException(404, "Member not found")

    email_copy = member.email
    await db.delete(member)
    await db.commit()

    await log_audit_event(
        workspace_id=ws.id,
        action="rbac.member_removed",
        entity_type="member",
        entity_id=member_id,
        actor_email=ws.admin_email,
        description=f"Removed member '{email_copy}' from workspace",
        db=db,
    )

    return {"status": "success", "removed_email": email_copy}
