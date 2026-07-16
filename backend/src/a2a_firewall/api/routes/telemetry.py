"""Telemetry events routes — structured events for the correlation engine."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import TelemetryRow, Workspace

router = APIRouter()


class TelemetryEventResponse(BaseModel):
    event_id: str
    event_type: str
    timestamp: str
    workspace_id: str
    sender_agent_id: str | None
    receiver_agent_id: str | None
    task_type: str | None
    decision: str | None
    risk_score: float
    violations: list[Any]
    delegation_chain: list[str]
    delegation_depth: int
    message_hash: str | None
    chain_hash: str | None
    signature_valid: bool | None
    latency_ms: int
    groq_called: bool
    created_at: str


class TelemetrySummaryResponse(BaseModel):
    total_events: int
    events_by_type: dict[str, int]
    events_by_decision: dict[str, int]
    avg_risk_score: float
    identity_failures: int
    scope_violations: int


@router.get("/events", response_model=list[TelemetryEventResponse])
async def list_telemetry_events(
    event_type: str | None = Query(None, description="Filter by event type"),
    sender_agent_id: str | None = Query(None, description="Filter by sender agent"),
    decision: str | None = Query(None, description="Filter by decision"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[TelemetryEventResponse]:
    """List telemetry events with optional filters."""
    query = select(TelemetryRow).where(TelemetryRow.workspace_id == workspace.id)

    if event_type:
        query = query.where(TelemetryRow.event_type == event_type)
    if sender_agent_id:
        query = query.where(TelemetryRow.sender_agent_id == sender_agent_id)
    if decision:
        query = query.where(TelemetryRow.decision == decision)

    query = query.order_by(TelemetryRow.created_at.desc()).limit(limit).offset(offset)

    result = await db.execute(query)
    rows = result.scalars().all()

    return [
        TelemetryEventResponse(
            event_id=r.event_id,
            event_type=r.event_type,
            timestamp=r.created_at.isoformat() if r.created_at else "",
            workspace_id=str(r.workspace_id),
            sender_agent_id=str(r.sender_agent_id) if r.sender_agent_id else None,
            receiver_agent_id=str(r.receiver_agent_id) if r.receiver_agent_id else None,
            task_type=r.task_type,
            decision=r.decision,
            risk_score=r.risk_score or 0.0,
            violations=r.violations or [],
            delegation_chain=r.delegation_chain or [],
            delegation_depth=r.delegation_depth or 0,
            message_hash=r.message_hash,
            chain_hash=r.chain_hash,
            signature_valid=r.signature_valid,
            latency_ms=r.latency_ms or 0,
            groq_called=r.groq_called or False,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in rows
    ]


@router.get("/summary", response_model=TelemetrySummaryResponse)
async def get_telemetry_summary(
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> TelemetrySummaryResponse:
    """Get telemetry summary for correlation dashboard."""
    # Total events
    total_result = await db.execute(
        select(func.count(TelemetryRow.id)).where(TelemetryRow.workspace_id == workspace.id)
    )
    total = total_result.scalar() or 0

    # Events by type
    type_result = await db.execute(
        select(TelemetryRow.event_type, func.count(TelemetryRow.id))
        .where(TelemetryRow.workspace_id == workspace.id)
        .group_by(TelemetryRow.event_type)
    )
    events_by_type = {row[0]: row[1] for row in type_result.all()}

    # Events by decision
    dec_result = await db.execute(
        select(TelemetryRow.decision, func.count(TelemetryRow.id))
        .where(TelemetryRow.workspace_id == workspace.id)
        .group_by(TelemetryRow.decision)
    )
    events_by_decision = {row[0] or "unknown": row[1] for row in dec_result.all()}

    # Average risk score
    avg_result = await db.execute(
        select(func.avg(TelemetryRow.risk_score)).where(TelemetryRow.workspace_id == workspace.id)
    )
    avg_risk = avg_result.scalar() or 0.0

    # Identity failures
    id_fail_result = await db.execute(
        select(func.count(TelemetryRow.id)).where(
            TelemetryRow.workspace_id == workspace.id,
            TelemetryRow.event_type == "a2a.identity_failure",
        )
    )
    identity_failures = id_fail_result.scalar() or 0

    # Scope violations
    scope_result = await db.execute(
        select(func.count(TelemetryRow.id)).where(
            TelemetryRow.workspace_id == workspace.id,
            TelemetryRow.event_type == "a2a.scope_violation",
        )
    )
    scope_violations = scope_result.scalar() or 0

    return TelemetrySummaryResponse(
        total_events=total,
        events_by_type=events_by_type,
        events_by_decision=events_by_decision,
        avg_risk_score=float(avg_risk),
        identity_failures=identity_failures,
        scope_violations=scope_violations,
    )
