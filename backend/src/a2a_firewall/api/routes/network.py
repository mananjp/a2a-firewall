"""Network-Level Access Control and IP Allowlisting API Routes."""

from __future__ import annotations

import ipaddress
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.core.audit_logger import log_audit_event
from a2a_firewall.core.network_security import (
    check_ip_allowlist,
    check_network_access_rules,
    extract_client_ip,
)
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Agent, IpAllowlistEntry, NetworkAccessRule, Workspace

router = APIRouter()


class IpAllowlistCreate(BaseModel):
    cidr_or_ip: str = Field(..., description="IPv4 or IPv6 single address or CIDR range (e.g. 192.168.1.100 or 10.0.0.0/16)")
    label: str = Field(..., description="Human-readable description (e.g. Corporate VPN)")
    scope: str = Field("all", description="all, dashboard, or api")
    expires_at: datetime | None = None


class IpAllowlistUpdate(BaseModel):
    label: str | None = None
    scope: str | None = None
    is_enabled: bool | None = None
    expires_at: datetime | None = None


class NetworkRuleCreate(BaseModel):
    priority: int = Field(100, ge=1, le=1000)
    name: str
    description: str | None = None
    source_cidr: str = Field("0.0.0.0/0")
    destination_agent_id: str | None = None
    action: str = Field("allow", description="allow or deny")
    protocol: str = Field("all", description="all, http, grpc, websocket")
    port_range: str | None = None


class NetworkTestRequest(BaseModel):
    client_ip: str
    destination_agent_id: str | None = None
    protocol: str = "http"
    scope: str = "api"


@router.get("/my-ip")
async def get_my_ip(request: Request) -> dict[str, str]:
    """Return the caller's detected public IP address."""
    client_ip = extract_client_ip(request)
    return {"client_ip": client_ip}


# ---------------------------------------------------------------------------
# IP Allowlisting
# ---------------------------------------------------------------------------


@router.get("/ip-allowlist")
async def list_ip_allowlist(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all configured IP allowlist entries for the workspace."""
    stmt = (
        select(IpAllowlistEntry)
        .where(IpAllowlistEntry.workspace_id == ws.id)
        .order_by(IpAllowlistEntry.created_at.desc())
    )
    res = await db.execute(stmt)
    entries = res.scalars().all()
    now = datetime.utcnow()

    return [
        {
            "id": str(e.id),
            "cidr_or_ip": e.cidr_or_ip,
            "label": e.label,
            "scope": e.scope,
            "is_enabled": e.is_enabled,
            "is_expired": e.expires_at is not None and e.expires_at < now,
            "expires_at": e.expires_at.isoformat() if e.expires_at else None,
            "created_by": e.created_by,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]


@router.post("/ip-allowlist")
async def add_ip_allowlist_entry(
    body: IpAllowlistCreate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Add a new IP address or CIDR range to the workspace allowlist."""
    # Validate IP format
    try:
        if "/" in body.cidr_or_ip:
            ipaddress.ip_network(body.cidr_or_ip, strict=False)
        else:
            ipaddress.ip_address(body.cidr_or_ip)
    except ValueError as e:
        raise HTTPException(400, f"Invalid IP or CIDR specification: '{body.cidr_or_ip}'") from e

    entry = IpAllowlistEntry(
        workspace_id=ws.id,
        cidr_or_ip=body.cidr_or_ip,
        label=body.label,
        scope=body.scope,
        is_enabled=True,
        expires_at=body.expires_at,
        created_by=ws.admin_email,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    await log_audit_event(
        workspace_id=ws.id,
        action="network.ip_allowlist_added",
        entity_type="ip_allowlist",
        entity_id=str(entry.id),
        actor_email=ws.admin_email,
        description=f"Added IP allowlist entry '{entry.label}' ({entry.cidr_or_ip})",
        diff={"cidr_or_ip": entry.cidr_or_ip, "scope": entry.scope},
        db=db,
    )

    return {
        "id": str(entry.id),
        "cidr_or_ip": entry.cidr_or_ip,
        "label": entry.label,
        "scope": entry.scope,
        "is_enabled": entry.is_enabled,
        "expires_at": entry.expires_at.isoformat() if entry.expires_at else None,
    }


@router.patch("/ip-allowlist/{entry_id}")
async def update_ip_allowlist_entry(
    entry_id: str,
    body: IpAllowlistUpdate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Update IP allowlist entry status, label, or expiration."""
    try:
        e_uuid = uuid.UUID(entry_id)
    except ValueError as e:
        raise HTTPException(400, "Invalid entry_id UUID") from e

    res = await db.execute(select(IpAllowlistEntry).where(IpAllowlistEntry.id == e_uuid, IpAllowlistEntry.workspace_id == ws.id))
    entry = res.scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "IP allowlist entry not found")

    if body.label is not None:
        entry.label = body.label
    if body.scope is not None:
        entry.scope = body.scope
    if body.is_enabled is not None:
        entry.is_enabled = body.is_enabled
    if body.expires_at is not None:
        entry.expires_at = body.expires_at

    await db.commit()
    await db.refresh(entry)

    await log_audit_event(
        workspace_id=ws.id,
        action="network.ip_allowlist_updated",
        entity_type="ip_allowlist",
        entity_id=str(entry.id),
        actor_email=ws.admin_email,
        description=f"Updated IP allowlist entry '{entry.label}' (enabled={entry.is_enabled})",
        db=db,
    )

    return {
        "id": str(entry.id),
        "cidr_or_ip": entry.cidr_or_ip,
        "label": entry.label,
        "scope": entry.scope,
        "is_enabled": entry.is_enabled,
        "expires_at": entry.expires_at.isoformat() if entry.expires_at else None,
    }


@router.delete("/ip-allowlist/{entry_id}")
async def delete_ip_allowlist_entry(
    entry_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Delete an IP allowlist entry."""
    try:
        e_uuid = uuid.UUID(entry_id)
    except ValueError as e:
        raise HTTPException(400, "Invalid entry_id UUID") from e

    res = await db.execute(select(IpAllowlistEntry).where(IpAllowlistEntry.id == e_uuid, IpAllowlistEntry.workspace_id == ws.id))
    entry = res.scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "IP allowlist entry not found")

    label = entry.label
    await db.delete(entry)
    await db.commit()

    await log_audit_event(
        workspace_id=ws.id,
        action="network.ip_allowlist_deleted",
        entity_type="ip_allowlist",
        entity_id=entry_id,
        actor_email=ws.admin_email,
        description=f"Deleted IP allowlist entry '{label}'",
        db=db,
    )

    return {"status": "success", "deleted_id": entry_id}


# ---------------------------------------------------------------------------
# Network-Level Access Rules
# ---------------------------------------------------------------------------


@router.get("/rules")
async def list_network_rules(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List configured network-level ingress/egress rules."""
    stmt = (
        select(NetworkAccessRule, Agent)
        .outerjoin(Agent, NetworkAccessRule.destination_agent_id == Agent.id)
        .where(NetworkAccessRule.workspace_id == ws.id)
        .order_by(NetworkAccessRule.priority.asc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    return [
        {
            "id": str(rule.id),
            "priority": rule.priority,
            "name": rule.name,
            "description": rule.description,
            "source_cidr": rule.source_cidr,
            "destination_agent_id": str(rule.destination_agent_id) if rule.destination_agent_id else None,
            "destination_agent_name": ag.name if ag else "Any Agent",
            "action": rule.action,
            "protocol": rule.protocol,
            "port_range": rule.port_range,
            "is_active": rule.is_active,
            "created_at": rule.created_at.isoformat() if rule.created_at else None,
        }
        for rule, ag in rows
    ]


@router.post("/rules")
async def create_network_rule(
    body: NetworkRuleCreate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Create a new CIDR and protocol network access rule."""
    dest_uuid = None
    if body.destination_agent_id:
        try:
            dest_uuid = uuid.UUID(body.destination_agent_id)
        except ValueError as e:
            raise HTTPException(400, "Invalid destination_agent_id") from e

    rule = NetworkAccessRule(
        workspace_id=ws.id,
        priority=body.priority,
        name=body.name,
        description=body.description,
        source_cidr=body.source_cidr,
        destination_agent_id=dest_uuid,
        action=body.action,
        protocol=body.protocol,
        port_range=body.port_range,
        is_active=True,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)

    await log_audit_event(
        workspace_id=ws.id,
        action="network.rule_created",
        entity_type="network_rule",
        entity_id=str(rule.id),
        actor_email=ws.admin_email,
        description=f"Created network rule '{rule.name}' ({rule.action} from {rule.source_cidr})",
        diff=body.model_dump(),
        db=db,
    )

    return {
        "id": str(rule.id),
        "priority": rule.priority,
        "name": rule.name,
        "source_cidr": rule.source_cidr,
        "action": rule.action,
        "protocol": rule.protocol,
        "is_active": rule.is_active,
    }


@router.delete("/rules/{rule_id}")
async def delete_network_rule(
    rule_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Delete a network access rule."""
    try:
        r_uuid = uuid.UUID(rule_id)
    except ValueError as e:
        raise HTTPException(400, "Invalid rule_id UUID") from e

    res = await db.execute(select(NetworkAccessRule).where(NetworkAccessRule.id == r_uuid, NetworkAccessRule.workspace_id == ws.id))
    rule = res.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Network rule not found")

    name = rule.name
    await db.delete(rule)
    await db.commit()

    await log_audit_event(
        workspace_id=ws.id,
        action="network.rule_deleted",
        entity_type="network_rule",
        entity_id=rule_id,
        actor_email=ws.admin_email,
        description=f"Deleted network rule '{name}'",
        db=db,
    )

    return {"status": "success", "deleted_id": rule_id}


@router.post("/test")
async def test_network_evaluation(
    body: NetworkTestRequest,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Simulate and evaluate an incoming IP packet against the workspace IP allowlist and network rules."""
    dest_uuid = None
    if body.destination_agent_id:
        try:
            dest_uuid = uuid.UUID(body.destination_agent_id)
        except ValueError:
            pass

    # 1. Evaluate IP Allowlist
    allowlist_check = await check_ip_allowlist(body.client_ip, ws.id, body.scope, db)

    # 2. Evaluate Network Access Rules
    network_check = await check_network_access_rules(
        body.client_ip,
        dest_uuid,
        body.protocol,
        ws.id,
        db,
    )

    overall_allowed = allowlist_check["allowed"] and network_check["allowed"]

    return {
        "client_ip": body.client_ip,
        "overall_allowed": overall_allowed,
        "ip_allowlist_evaluation": allowlist_check,
        "network_rules_evaluation": network_check,
    }
