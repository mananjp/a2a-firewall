"""Audit API routes — delegation chain reconstruction and compliance exports."""

from __future__ import annotations

import contextlib
import csv
import io
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Agent, DelegationChain, Task, Workspace

router = APIRouter()


@router.get("/tasks/{task_id}/delegation-chain")
async def get_task_delegation_chain(
    task_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Reconstruct the full delegation chain for a task (ordered hop list).

    Returns 404 if the task is not found in the authenticated workspace.
    """
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid task_id UUID format") from e

    # Verify task belongs to workspace
    task_res = await db.execute(
        select(Task).where(Task.id == task_uuid, Task.workspace_id == ws.id)
    )
    task = task_res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Retrieve all delegation chain entries for this root task lineage
    query = (
        select(DelegationChain, Agent)
        .outerjoin(Agent, DelegationChain.sender_agent_id == Agent.id)
        .join(Task, DelegationChain.task_id == Task.id)
        .where(
            DelegationChain.workspace_id == ws.id,
            Task.root_task_id == task.root_task_id,
        )
        .order_by(DelegationChain.delegation_depth)
    )
    res = await db.execute(query)
    rows = res.all()

    # Pre-fetch agent names map for receiver names
    agent_ids = set()
    for dc, _ in rows:
        agent_ids.add(dc.sender_agent_id)
        agent_ids.add(dc.receiver_agent_id)

    agents_map: dict[uuid.UUID, str] = {}
    if agent_ids:
        agents_res = await db.execute(select(Agent).where(Agent.id.in_(agent_ids)))
        for ag in agents_res.scalars().all():
            agents_map[ag.id] = ag.name

    hops = []
    for dc, sender_agent in rows:
        hops.append(
            {
                "id": str(dc.id),
                "task_id": str(dc.task_id),
                "sender_id": str(dc.sender_agent_id),
                "sender_name": sender_agent.name if sender_agent else "Unknown",
                "receiver_id": str(dc.receiver_agent_id),
                "receiver_name": agents_map.get(dc.receiver_agent_id, "Unknown"),
                "delegation_depth": dc.delegation_depth,
                "caveats": dc.caveats,
                "signature_valid": dc.signature_valid,
                "chain_hash": dc.chain_hash,
                "created_at": dc.created_at.isoformat() if dc.created_at else None,
            }
        )

    return {
        "task_id": str(task.id),
        "root_task_id": str(task.root_task_id),
        "declared_intent": task.declared_intent,
        "intent_drift_score": task.intent_drift_score,
        "hops_count": len(hops),
        "hops": hops,
    }


@router.get("/delegation-chains")
async def export_delegation_chains(
    since: str | None = Query(None, description="ISO timestamp filter (e.g. 2026-01-01T00:00:00)"),
    limit: int = Query(100, ge=1, le=1000),
    format: str = Query("json", description="Export format: json or csv"),
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Export delegation chain events for compliance auditing (JSON or CSV)."""
    stmt = (
        select(DelegationChain, Agent)
        .outerjoin(Agent, DelegationChain.sender_agent_id == Agent.id)
        .where(DelegationChain.workspace_id == ws.id)
        .order_by(DelegationChain.created_at.desc())
        .limit(limit)
    )

    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            stmt = stmt.where(DelegationChain.created_at >= since_dt)
        except ValueError as e:
            raise HTTPException(status_code=400, detail="Invalid ISO timestamp for 'since'") from e

    res = await db.execute(stmt)
    rows = res.all()

    # Pre-fetch agent names map for receiver names
    agent_ids = set()
    for dc, _ in rows:
        agent_ids.add(dc.sender_agent_id)
        agent_ids.add(dc.receiver_agent_id)

    agents_map: dict[uuid.UUID, str] = {}
    if agent_ids:
        agents_res = await db.execute(select(Agent).where(Agent.id.in_(agent_ids)))
        for ag in agents_res.scalars().all():
            agents_map[ag.id] = ag.name

    events = []
    for dc, sender_agent in rows:
        events.append(
            {
                "timestamp": dc.created_at.isoformat() if dc.created_at else "",
                "task_id": str(dc.task_id),
                "sender_id": str(dc.sender_agent_id),
                "sender_name": sender_agent.name if sender_agent else "Unknown",
                "receiver_id": str(dc.receiver_agent_id),
                "receiver_name": agents_map.get(dc.receiver_agent_id, "Unknown"),
                "delegation_depth": dc.delegation_depth,
                "caveats": ",".join(dc.caveats)
                if isinstance(dc.caveats, list)
                else str(dc.caveats),
                "signature_valid": dc.signature_valid,
                "chain_hash": dc.chain_hash,
            }
        )

    if format.lower() == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=[
                "timestamp",
                "task_id",
                "sender_id",
                "sender_name",
                "receiver_id",
                "receiver_name",
                "delegation_depth",
                "caveats",
                "signature_valid",
                "chain_hash",
            ],
        )
        writer.writeheader()
        for ev in events:
            writer.writerow(ev)

        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=delegation_audit_{ws.id}.csv"},
        )

    return {
        "workspace_id": str(ws.id),
        "count": len(events),
        "events": events,
    }


# ---------------------------------------------------------------------------
# Enterprise System Audit Trail
# ---------------------------------------------------------------------------


@router.get("/logs")
async def list_enterprise_audit_logs(
    actor_email: str | None = Query(None),
    action: str | None = Query(None),
    entity_type: str | None = Query(None),
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    search: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Query enterprise system audit logs with rich multi-attribute filtering."""
    from a2a_firewall.db.models import AuditLog

    stmt = select(AuditLog).where(AuditLog.workspace_id == ws.id)

    if actor_email:
        stmt = stmt.where(AuditLog.actor_email.ilike(f"%{actor_email}%"))
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if from_date:
        with contextlib.suppress(ValueError):
            stmt = stmt.where(AuditLog.created_at >= datetime.fromisoformat(from_date))
    if to_date:
        with contextlib.suppress(ValueError):
            stmt = stmt.where(AuditLog.created_at <= datetime.fromisoformat(to_date))
    if search:
        stmt = stmt.where(
            (AuditLog.description.ilike(f"%{search}%"))
            | (AuditLog.action.ilike(f"%{search}%"))
            | (AuditLog.actor_email.ilike(f"%{search}%"))
        )

    stmt = stmt.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    res = await db.execute(stmt)
    logs = res.scalars().all()

    # Total count query
    count_stmt = select(AuditLog.id).where(AuditLog.workspace_id == ws.id)
    count_res = await db.execute(count_stmt)
    total_count = len(count_res.scalars().all())

    items = [
        {
            "id": str(log.id),
            "actor_id": log.actor_id,
            "actor_email": log.actor_email,
            "actor_type": log.actor_type,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "description": log.description,
            "diff": log.diff,
            "ip_address": log.ip_address,
            "status": log.status,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]

    return {
        "workspace_id": str(ws.id),
        "total": total_count,
        "count": len(items),
        "logs": items,
    }


@router.get("/logs/export")
async def export_enterprise_audit_logs(
    format: str = Query("json", description="json or csv"),
    limit: int = Query(500, ge=1, le=5000),
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Export enterprise audit logs for compliance filings and external SIEM ingestion."""
    from a2a_firewall.db.models import AuditLog

    stmt = (
        select(AuditLog)
        .where(AuditLog.workspace_id == ws.id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()

    items = [
        {
            "timestamp": log.created_at.isoformat() if log.created_at else "",
            "actor": log.actor_email,
            "actor_type": log.actor_type,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id or "",
            "description": log.description or "",
            "ip_address": log.ip_address or "",
            "status": log.status,
        }
        for log in logs
    ]

    if format.lower() == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=[
                "timestamp",
                "actor",
                "actor_type",
                "action",
                "entity_type",
                "entity_id",
                "description",
                "ip_address",
                "status",
            ],
        )
        writer.writeheader()
        for it in items:
            writer.writerow(it)

        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=enterprise_audit_{ws.id}.csv"},
        )

    return {
        "workspace_id": str(ws.id),
        "exported_count": len(items),
        "logs": items,
    }
