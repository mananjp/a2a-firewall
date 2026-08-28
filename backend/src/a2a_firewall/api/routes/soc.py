"""SOC integration routes — alert queue, triage, live SSE stream."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import (
    RuleToMitreTechnique,
    SOCAlert,
    Workspace,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Severity mapping
# ---------------------------------------------------------------------------

# Static MITRE technique lookup for enrichment
_RULE_TO_MITRE: dict[str, str] = {
    "prompt_injection": "T1059",
    "sql_injection": "T1190",
    "confused_deputy_attempt": "T1134",
    "known_vulnerable_component": "T1195",
    "delegation_depth_exceeded": "T1078",
    "invalid_delegation_token": "T1550",
    "invalid_signature": "T1557",
    "data_exfiltration": "T1041",
    "privilege_escalation": "T1078",
    "social_engineering": "T1564",
    "command_injection": "T1059",
    "pii_exposure_credit_card": "T1005",
    "pii_exposure_ssn": "T1005",
    "pii_exposure_aadhaar": "T1005",
    "high_value_transaction": "T1657",
    "suspicious_beneficiary": "T1657",
    "intent_drift": "T1059",
}


def map_violation_to_soc_severity(
    violation_severity: str,
    risk_score: float = 0.0,
    cvss_score: float | None = None,
) -> str:
    """Map violation severity + risk score + CVSS into SOC P1-P4 priority.

    Standard SOC triage matrix:
      P1 — Critical: immediate action required
      P2 — High: action within 1 hour
      P3 — Medium: action within 4 hours
      P4 — Low: action within 24 hours
    """
    # CVSS override: critical CVE always P1
    if cvss_score is not None and cvss_score >= 9.0:
        return "P1"

    # Severity + risk score matrix
    if violation_severity == "critical" or risk_score >= 0.9:
        return "P1"
    if violation_severity == "high" or risk_score >= 0.7:
        return "P2"
    if violation_severity == "medium" or risk_score >= 0.4:
        return "P3"
    return "P4"


def get_mitre_technique(violation_type: str) -> str | None:
    """Look up MITRE ATT&CK technique ID for a violation type."""
    return _RULE_TO_MITRE.get(violation_type)


# ---------------------------------------------------------------------------
# SOC Alert creation helper (called from orchestrator)
# ---------------------------------------------------------------------------


async def create_soc_alert(
    workspace_id: uuid.UUID,
    violation: dict[str, Any],
    task_id: uuid.UUID | None,
    risk_score: float,
    chain_hash: str | None,
    db: AsyncSession,
    violation_id: uuid.UUID | None = None,
) -> SOCAlert:
    """Create a SOC alert from a violation dict."""
    violation_type = violation.get("violation_type", "unknown")
    severity = map_violation_to_soc_severity(
        violation.get("severity", "medium"),
        risk_score,
        violation.get("details", {}).get("cvss_score"),
    )
    mitre = get_mitre_technique(violation_type)

    alert = SOCAlert(
        workspace_id=workspace_id,
        source_violation_id=violation_id,
        task_id=task_id,
        severity=severity,
        status="new",
        mitre_technique=mitre,
        chain_hash=chain_hash,
        title=f"{violation_type.replace('_', ' ').title()} Detected",
        description=violation.get("details", {}).get("hint", "")
        or str(violation.get("details", {}))[:500],
        details=violation.get("details", {}),
    )
    db.add(alert)
    return alert


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------


@router.get("/alerts")
async def list_soc_alerts(
    severity: str | None = Query(None, description="Filter by severity: P1, P2, P3, P4"),
    status: str | None = Query(
        None,
        description="Filter by status: new, acknowledged, investigating, resolved, false_positive",
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Paginated SOC alert feed, filterable by severity/status."""
    query = select(SOCAlert).where(SOCAlert.workspace_id == ws.id)

    if severity:
        query = query.where(SOCAlert.severity == severity)
    if status:
        query = query.where(SOCAlert.status == status)

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # Fetch page
    query = query.order_by(desc(SOCAlert.created_at)).offset(offset).limit(limit)
    result = await db.execute(query)
    alerts = result.scalars().all()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "alerts": [
            {
                "id": str(a.id),
                "workspace_id": str(a.workspace_id),
                "source_violation_id": str(a.source_violation_id)
                if a.source_violation_id
                else None,
                "task_id": str(a.task_id) if a.task_id else None,
                "severity": a.severity,
                "status": a.status,
                "assigned_analyst": a.assigned_analyst,
                "mitre_technique": a.mitre_technique,
                "chain_hash": a.chain_hash,
                "title": a.title,
                "description": a.description,
                "details": a.details,
                "created_at": str(a.created_at) if a.created_at else None,
                "updated_at": str(a.updated_at) if a.updated_at else None,
            }
            for a in alerts
        ],
    }


class SOCAlertUpdate(BaseModel):
    status: str | None = None
    assigned_analyst: str | None = None


@router.patch("/alerts/{alert_id}")
async def update_soc_alert(
    alert_id: str,
    body: SOCAlertUpdate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Acknowledge / assign / resolve a SOC alert."""
    result = await db.execute(
        select(SOCAlert).where(
            SOCAlert.id == uuid.UUID(alert_id),
            SOCAlert.workspace_id == ws.id,
        )
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(404, "Alert not found")

    valid_statuses = {"new", "acknowledged", "investigating", "resolved", "false_positive"}
    if body.status is not None:
        if body.status not in valid_statuses:
            raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
        alert.status = body.status

    if body.assigned_analyst is not None:
        alert.assigned_analyst = body.assigned_analyst

    await db.commit()
    await db.refresh(alert)

    return {
        "id": str(alert.id),
        "severity": alert.severity,
        "status": alert.status,
        "assigned_analyst": alert.assigned_analyst,
        "updated_at": str(alert.updated_at),
    }


@router.get("/alerts/summary")
async def soc_alert_summary(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Summary counts for the SOC dashboard header."""
    base = select(SOCAlert).where(SOCAlert.workspace_id == ws.id)

    total_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_result.scalar() or 0

    new_result = await db.execute(
        select(func.count()).select_from(base.where(SOCAlert.status == "new").subquery())
    )
    new_count = new_result.scalar() or 0

    p1_result = await db.execute(
        select(func.count()).select_from(
            base.where(SOCAlert.severity == "P1", SOCAlert.status != "resolved").subquery()
        )
    )
    p1_open = p1_result.scalar() or 0

    by_severity: dict[str, int] = {}
    for sev in ("P1", "P2", "P3", "P4"):
        r = await db.execute(
            select(func.count()).select_from(base.where(SOCAlert.severity == sev).subquery())
        )
        by_severity[sev] = r.scalar() or 0

    by_status: dict[str, int] = {}
    for st in ("new", "acknowledged", "investigating", "resolved", "false_positive"):
        r = await db.execute(
            select(func.count()).select_from(base.where(SOCAlert.status == st).subquery())
        )
        by_status[st] = r.scalar() or 0

    return {
        "total": total,
        "new": new_count,
        "p1_open": p1_open,
        "by_severity": by_severity,
        "by_status": by_status,
    }


@router.get("/alerts/stream")
async def soc_alerts_stream(
    request: Request,
    ws: Workspace = Depends(get_current_workspace),
) -> StreamingResponse:
    """Server-Sent Events endpoint for live SOC dashboard updates.

    Polls every 3 seconds for new alerts and pushes them to connected clients.
    """
    from a2a_firewall.db.database import AsyncSessionLocal

    last_check = datetime.utcnow()

    async def event_generator() -> AsyncIterator[str]:
        nonlocal last_check
        while True:
            if await request.is_disconnected():
                break

            try:
                async with AsyncSessionLocal() as session:
                    result = await session.execute(
                        select(SOCAlert)
                        .where(
                            SOCAlert.workspace_id == ws.id,
                            SOCAlert.created_at > last_check,
                        )
                        .order_by(SOCAlert.created_at)
                    )
                    new_alerts = result.scalars().all()

                    if new_alerts:
                        last_check = datetime.utcnow()
                        for alert in new_alerts:
                            data = json.dumps(
                                {
                                    "id": str(alert.id),
                                    "severity": alert.severity,
                                    "status": alert.status,
                                    "title": alert.title,
                                    "mitre_technique": alert.mitre_technique,
                                    "created_at": str(alert.created_at),
                                }
                            )
                            yield f"data: {data}\n\n"
            except Exception:
                logger.debug("SOC SSE stream error during poll", exc_info=True)

            # Heartbeat
            yield f"data: {json.dumps({'heartbeat': True})}\n\n"

            await asyncio.sleep(3)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/mitre-mapping")
async def get_mitre_mapping(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return the full rule-to-MITRE technique mapping."""
    result = await db.execute(select(RuleToMitreTechnique))
    mappings = result.scalars().all()
    return [
        {
            "rule_type": str(m.rule_type),
            "mitre_technique_id": str(m.mitre_technique_id),
            "mitre_technique_name": m.mitre_technique_name,
            "mitre_tactic": m.mitre_tactic,
        }
        for m in mappings
    ]
