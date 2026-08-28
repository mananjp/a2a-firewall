"""Custom Data Retention & Privacy Lifecycle Engine.

Enforces configurable data retention windows, candidate calculation, automated PII scrubbing,
and secure pruning for tasks, telemetry, violations, and SOC alerts while preserving compliance audit floors.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.db.models import (
    AuditLog,
    DataRetentionPolicy,
    SOCAlert,
    Task,
    TelemetryRow,
    Violation,
)

logger = logging.getLogger(__name__)

# Minimum compliance retention limits (days) to prevent accidental data destruction
MINIMUM_COMPLIANCE_DAYS = {
    "audit_logs": 365,  # 1 year minimum for financial & security audits (RBI/SOC2)
    "violations": 90,
    "soc_alerts": 90,
}


async def get_or_create_retention_policy(
    workspace_id: uuid.UUID, db: AsyncSession
) -> DataRetentionPolicy:
    """Retrieve or initialize default retention policy for a workspace."""
    stmt = select(DataRetentionPolicy).where(DataRetentionPolicy.workspace_id == workspace_id)
    res = await db.execute(stmt)
    policy = res.scalar_one_or_none()

    if policy is None:
        policy = DataRetentionPolicy(
            workspace_id=workspace_id,
            task_payload_days=30,
            telemetry_days=90,
            violations_days=180,
            soc_alerts_days=180,
            audit_log_days=365,
            auto_purge_enabled=False,
            scrub_pii_after_days=14,
            last_purged_at=None,
        )
        db.add(policy)
        await db.commit()
        await db.refresh(policy)

    return policy


async def calculate_retention_candidates(
    workspace_id: uuid.UUID,
    policy: DataRetentionPolicy,
    db: AsyncSession,
) -> dict[str, Any]:
    """Calculate the number of records eligible for retention purge and PII redaction."""
    now = datetime.utcnow()

    task_cutoff = now - timedelta(days=max(1, policy.task_payload_days))
    telemetry_cutoff = now - timedelta(days=max(1, policy.telemetry_days))
    violations_cutoff = now - timedelta(
        days=max(MINIMUM_COMPLIANCE_DAYS["violations"], policy.violations_days)
    )
    soc_cutoff = now - timedelta(
        days=max(MINIMUM_COMPLIANCE_DAYS["soc_alerts"], policy.soc_alerts_days)
    )
    audit_cutoff = now - timedelta(
        days=max(MINIMUM_COMPLIANCE_DAYS["audit_logs"], policy.audit_log_days)
    )
    pii_scrub_cutoff = now - timedelta(days=max(1, policy.scrub_pii_after_days))

    # Count eligible records
    tasks_count = (
        await db.execute(
            select(func.count(Task.id)).where(
                Task.workspace_id == workspace_id, Task.created_at < task_cutoff
            )
        )
    ).scalar() or 0

    telemetry_count = (
        await db.execute(
            select(func.count(TelemetryRow.id)).where(
                TelemetryRow.workspace_id == workspace_id,
                TelemetryRow.created_at < telemetry_cutoff,
            )
        )
    ).scalar() or 0

    violations_count = (
        await db.execute(
            select(func.count(Violation.id)).where(
                Violation.workspace_id == workspace_id, Violation.created_at < violations_cutoff
            )
        )
    ).scalar() or 0

    soc_count = (
        await db.execute(
            select(func.count(SOCAlert.id)).where(
                SOCAlert.workspace_id == workspace_id, SOCAlert.created_at < soc_cutoff
            )
        )
    ).scalar() or 0

    audit_count = (
        await db.execute(
            select(func.count(AuditLog.id)).where(
                AuditLog.workspace_id == workspace_id, AuditLog.created_at < audit_cutoff
            )
        )
    ).scalar() or 0

    pii_scrub_count = (
        await db.execute(
            select(func.count(Task.id)).where(
                Task.workspace_id == workspace_id,
                Task.created_at < pii_scrub_cutoff,
                Task.created_at >= task_cutoff,
            )
        )
    ).scalar() or 0

    return {
        "cutoffs": {
            "task_payload_before": task_cutoff.isoformat(),
            "telemetry_before": telemetry_cutoff.isoformat(),
            "violations_before": violations_cutoff.isoformat(),
            "soc_alerts_before": soc_cutoff.isoformat(),
            "audit_logs_before": audit_cutoff.isoformat(),
            "pii_scrub_before": pii_scrub_cutoff.isoformat(),
        },
        "candidates": {
            "expired_tasks": tasks_count,
            "expired_telemetry": telemetry_count,
            "expired_violations": violations_count,
            "expired_soc_alerts": soc_count,
            "expired_audit_logs": audit_count,
            "pii_scrub_eligible_tasks": pii_scrub_count,
        },
        "total_records_eligible": tasks_count
        + telemetry_count
        + violations_count
        + soc_count
        + audit_count,
    }


async def execute_retention_purge(
    workspace_id: uuid.UUID,
    dry_run: bool,
    db: AsyncSession,
) -> dict[str, Any]:
    """Perform data retention purging and PII redaction."""
    policy = await get_or_create_retention_policy(workspace_id, db)
    candidates_info = await calculate_retention_candidates(workspace_id, policy, db)

    if dry_run:
        return {
            "dry_run": True,
            "workspace_id": str(workspace_id),
            "summary": candidates_info,
            "purged_records": 0,
            "scrubbed_records": 0,
        }

    now = datetime.utcnow()
    task_cutoff = now - timedelta(days=max(1, policy.task_payload_days))
    telemetry_cutoff = now - timedelta(days=max(1, policy.telemetry_days))
    violations_cutoff = now - timedelta(
        days=max(MINIMUM_COMPLIANCE_DAYS["violations"], policy.violations_days)
    )
    soc_cutoff = now - timedelta(
        days=max(MINIMUM_COMPLIANCE_DAYS["soc_alerts"], policy.soc_alerts_days)
    )
    audit_cutoff = now - timedelta(
        days=max(MINIMUM_COMPLIANCE_DAYS["audit_logs"], policy.audit_log_days)
    )
    pii_scrub_cutoff = now - timedelta(days=max(1, policy.scrub_pii_after_days))

    # 1. PII Redaction on aging payloads before hard delete
    await db.execute(
        update(Task)
        .where(
            Task.workspace_id == workspace_id,
            Task.created_at < pii_scrub_cutoff,
            Task.created_at >= task_cutoff,
        )
        .values(payload={"_redacted": True, "_scrubbed_at": now.isoformat()})
    )

    # 2. Hard deletion of expired records
    del_telemetry = await db.execute(
        delete(TelemetryRow).where(
            TelemetryRow.workspace_id == workspace_id, TelemetryRow.created_at < telemetry_cutoff
        )
    )
    del_violations = await db.execute(
        delete(Violation).where(
            Violation.workspace_id == workspace_id, Violation.created_at < violations_cutoff
        )
    )
    del_soc = await db.execute(
        delete(SOCAlert).where(
            SOCAlert.workspace_id == workspace_id, SOCAlert.created_at < soc_cutoff
        )
    )
    del_audit = await db.execute(
        delete(AuditLog).where(
            AuditLog.workspace_id == workspace_id, AuditLog.created_at < audit_cutoff
        )
    )
    del_tasks = await db.execute(
        delete(Task).where(Task.workspace_id == workspace_id, Task.created_at < task_cutoff)
    )

    policy.last_purged_at = now
    await db.commit()

    total_purged = (
        (del_telemetry.rowcount or 0)
        + (del_violations.rowcount or 0)
        + (del_soc.rowcount or 0)
        + (del_audit.rowcount or 0)
        + (del_tasks.rowcount or 0)
    )

    return {
        "dry_run": False,
        "workspace_id": str(workspace_id),
        "executed_at": now.isoformat(),
        "purged_records": total_purged,
        "breakdown": {
            "tasks_purged": del_tasks.rowcount or 0,
            "telemetry_purged": del_telemetry.rowcount or 0,
            "violations_purged": del_violations.rowcount or 0,
            "soc_alerts_purged": del_soc.rowcount or 0,
            "audit_logs_purged": del_audit.rowcount or 0,
        },
    }
