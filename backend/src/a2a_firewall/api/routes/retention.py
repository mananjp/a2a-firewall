"""Custom Data Retention and Privacy Lifecycle routes."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.core.audit_logger import log_audit_event
from a2a_firewall.core.retention_engine import (
    MINIMUM_COMPLIANCE_DAYS,
    calculate_retention_candidates,
    execute_retention_purge,
    get_or_create_retention_policy,
)
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import (
    AuditLog,
    SOCAlert,
    Task,
    TelemetryRow,
    Violation,
    Workspace,
)

router = APIRouter()


class RetentionPolicyUpdate(BaseModel):
    task_payload_days: int | None = Field(None, ge=1, le=3650)
    telemetry_days: int | None = Field(None, ge=1, le=3650)
    violations_days: int | None = Field(None, ge=30, le=3650)
    soc_alerts_days: int | None = Field(None, ge=30, le=3650)
    audit_log_days: int | None = Field(
        None, ge=365, le=3650, description="Minimum 365 days required for regulatory compliance"
    )
    auto_purge_enabled: bool | None = None
    scrub_pii_after_days: int | None = Field(None, ge=1, le=365)


class PurgeRequest(BaseModel):
    dry_run: bool = True


@router.get("/policy")
async def get_retention_policy(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get current data retention lifecycle configuration and candidate count."""
    policy = await get_or_create_retention_policy(ws.id, db)
    candidates = await calculate_retention_candidates(ws.id, policy, db)

    return {
        "workspace_id": str(ws.id),
        "policy": {
            "task_payload_days": policy.task_payload_days,
            "telemetry_days": policy.telemetry_days,
            "violations_days": policy.violations_days,
            "soc_alerts_days": policy.soc_alerts_days,
            "audit_log_days": policy.audit_log_days,
            "auto_purge_enabled": policy.auto_purge_enabled,
            "scrub_pii_after_days": policy.scrub_pii_after_days,
            "last_purged_at": policy.last_purged_at.isoformat() if policy.last_purged_at else None,
        },
        "minimum_compliance_floors": MINIMUM_COMPLIANCE_DAYS,
        "retention_candidates": candidates,
    }


@router.put("/policy")
async def update_retention_policy(
    body: RetentionPolicyUpdate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Update retention windows and automated privacy scrubbing settings."""
    policy = await get_or_create_retention_policy(ws.id, db)
    before = {
        "task_payload_days": policy.task_payload_days,
        "telemetry_days": policy.telemetry_days,
        "violations_days": policy.violations_days,
        "soc_alerts_days": policy.soc_alerts_days,
        "audit_log_days": policy.audit_log_days,
        "auto_purge_enabled": policy.auto_purge_enabled,
        "scrub_pii_after_days": policy.scrub_pii_after_days,
    }

    if body.task_payload_days is not None:
        policy.task_payload_days = body.task_payload_days
    if body.telemetry_days is not None:
        policy.telemetry_days = body.telemetry_days
    if body.violations_days is not None:
        if body.violations_days < MINIMUM_COMPLIANCE_DAYS["violations"]:
            raise HTTPException(
                400,
                f"violations_days cannot be less than compliance minimum of {MINIMUM_COMPLIANCE_DAYS['violations']} days",
            )
        policy.violations_days = body.violations_days
    if body.soc_alerts_days is not None:
        if body.soc_alerts_days < MINIMUM_COMPLIANCE_DAYS["soc_alerts"]:
            raise HTTPException(
                400,
                f"soc_alerts_days cannot be less than compliance minimum of {MINIMUM_COMPLIANCE_DAYS['soc_alerts']} days",
            )
        policy.soc_alerts_days = body.soc_alerts_days
    if body.audit_log_days is not None:
        if body.audit_log_days < MINIMUM_COMPLIANCE_DAYS["audit_logs"]:
            raise HTTPException(
                400,
                f"audit_log_days cannot be less than compliance minimum of {MINIMUM_COMPLIANCE_DAYS['audit_logs']} days",
            )
        policy.audit_log_days = body.audit_log_days
    if body.auto_purge_enabled is not None:
        policy.auto_purge_enabled = body.auto_purge_enabled
    if body.scrub_pii_after_days is not None:
        policy.scrub_pii_after_days = body.scrub_pii_after_days

    policy.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(policy)

    await log_audit_event(
        workspace_id=ws.id,
        action="retention.policy_updated",
        entity_type="retention",
        entity_id=str(policy.id),
        actor_email=ws.admin_email,
        description="Updated workspace data retention lifecycle policy",
        diff={"before": before, "after": body.model_dump(exclude_unset=True)},
        db=db,
    )

    return {
        "task_payload_days": policy.task_payload_days,
        "telemetry_days": policy.telemetry_days,
        "violations_days": policy.violations_days,
        "soc_alerts_days": policy.soc_alerts_days,
        "audit_log_days": policy.audit_log_days,
        "auto_purge_enabled": policy.auto_purge_enabled,
        "scrub_pii_after_days": policy.scrub_pii_after_days,
    }


@router.post("/purge")
async def trigger_retention_purge(
    body: PurgeRequest,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Execute or dry-run a data retention purge and PII sanitization."""
    result = await execute_retention_purge(ws.id, dry_run=body.dry_run, db=db)

    if not body.dry_run:
        await log_audit_event(
            workspace_id=ws.id,
            action="retention.purge_executed",
            entity_type="retention",
            actor_email=ws.admin_email,
            description=f"Executed data retention purge: {result.get('purged_records', 0)} records removed",
            diff=result.get("breakdown", {}),
            db=db,
        )

    return result


@router.get("/stats")
async def get_storage_stats(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get active record counts per storage table."""
    tasks_count = (
        await db.execute(select(func.count(Task.id)).where(Task.workspace_id == ws.id))
    ).scalar() or 0
    telemetry_count = (
        await db.execute(
            select(func.count(TelemetryRow.id)).where(TelemetryRow.workspace_id == ws.id)
        )
    ).scalar() or 0
    violations_count = (
        await db.execute(select(func.count(Violation.id)).where(Violation.workspace_id == ws.id))
    ).scalar() or 0
    soc_count = (
        await db.execute(select(func.count(SOCAlert.id)).where(SOCAlert.workspace_id == ws.id))
    ).scalar() or 0
    audit_count = (
        await db.execute(select(func.count(AuditLog.id)).where(AuditLog.workspace_id == ws.id))
    ).scalar() or 0

    return {
        "workspace_id": str(ws.id),
        "total_records": tasks_count + telemetry_count + violations_count + soc_count + audit_count,
        "table_counts": {
            "tasks": tasks_count,
            "telemetry_events": telemetry_count,
            "violations": violations_count,
            "soc_alerts": soc_count,
            "audit_logs": audit_count,
        },
    }
