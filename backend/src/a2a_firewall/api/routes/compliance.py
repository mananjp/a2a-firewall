"""Compliance reporting and framework management routes."""

from __future__ import annotations

import contextlib
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import PolicyRule, SOCAlert, Violation, Workspace
from a2a_firewall.detection.compliance_packs import (
    COMPLIANCE_PACKS,
    INDUSTRY_FRAMEWORKS,
    JURISDICTION_FRAMEWORKS,
    apply_compliance_pack,
    get_installed_frameworks,
    remove_compliance_pack,
    suggest_frameworks,
)

router = APIRouter()


@router.get("/frameworks")
async def list_available_frameworks(
    ws: Workspace = Depends(get_current_workspace),
) -> dict[str, Any]:
    """List all available compliance frameworks and their rule counts."""
    return {
        "frameworks": {
            name: {"rules_count": len(rules), "rule_names": [r["name"] for r in rules]}
            for name, rules in COMPLIANCE_PACKS.items()
        },
        "jurisdiction_mapping": JURISDICTION_FRAMEWORKS,
        "industry_mapping": INDUSTRY_FRAMEWORKS,
    }


@router.get("/installed")
async def list_installed_frameworks(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List compliance frameworks installed for this workspace."""
    return await get_installed_frameworks(ws.id, db)


class FrameworkApplyRequest(BaseModel):
    framework: str


@router.post("/apply")
async def apply_framework(
    body: FrameworkApplyRequest,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Install a compliance rule pack for the workspace."""
    if body.framework not in COMPLIANCE_PACKS:
        raise HTTPException(
            400,
            f"Unknown framework: {body.framework}. Available: {', '.join(COMPLIANCE_PACKS.keys())}",
        )
    return await apply_compliance_pack(ws.id, body.framework, db)


class FrameworkRemoveRequest(BaseModel):
    framework: str


@router.post("/remove")
async def remove_framework(
    body: FrameworkRemoveRequest,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Remove a compliance rule pack from the workspace."""
    return await remove_compliance_pack(ws.id, body.framework, db)


@router.get("/suggest")
async def suggest_compliance_frameworks(
    ws: Workspace = Depends(get_current_workspace),
) -> dict[str, Any]:
    """Suggest compliance frameworks based on workspace jurisdiction and industry."""
    jurisdiction = ws.jurisdiction if hasattr(ws, "jurisdiction") else None
    industry = ws.industry if hasattr(ws, "industry") else None
    suggestions = suggest_frameworks(jurisdiction, industry)
    return {
        "jurisdiction": jurisdiction,
        "industry": industry,
        "suggested_frameworks": suggestions,
    }


@router.get("/rules")
async def list_compliance_rules(
    framework: str | None = Query(None, description="Filter by framework tag"),
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List policy rules installed by compliance packs."""
    query = select(PolicyRule).where(
        PolicyRule.workspace_id == ws.id,
        PolicyRule.framework_tag.isnot(None),
    )
    if framework:
        query = query.where(PolicyRule.framework_tag == framework)

    query = query.order_by(PolicyRule.priority)
    result = await db.execute(query)
    rules = result.scalars().all()

    return [
        {
            "id": str(r.id),
            "name": r.name,
            "description": r.description,
            "priority": r.priority,
            "action": r.action,
            "block_reason": r.block_reason,
            "framework_tag": r.framework_tag,
            "is_active": r.is_active,
        }
        for r in rules
    ]


@router.get("/report")
async def compliance_report(
    framework: str = Query(..., description="Framework to generate report for"),
    from_date: str | None = Query(None, alias="from", description="Start date (ISO format)"),
    to_date: str | None = Query(None, alias="to", description="End date (ISO format)"),
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Generate an audit-ready compliance report.

    Returns: blocked counts, PII exposure attempts blocked, violations by type,
    filtered by framework_tag on the stored violations/SOC alerts.
    """
    # Count violations with framework-related rule types
    framework_rule_types = _framework_rule_types(framework)

    violation_query = select(Violation).where(Violation.workspace_id == ws.id)
    if from_date:
        from datetime import datetime

        with contextlib.suppress(ValueError):
            violation_query = violation_query.where(
                Violation.created_at >= datetime.fromisoformat(from_date)
            )
    if to_date:
        from datetime import datetime

        with contextlib.suppress(ValueError):
            violation_query = violation_query.where(
                Violation.created_at <= datetime.fromisoformat(to_date)
            )

    result = await db.execute(violation_query)
    all_violations = result.scalars().all()

    # Filter by framework-related violation types
    framework_violations = [
        v for v in all_violations if str(v.violation_type) in framework_rule_types
    ]

    # Count by violation type
    by_type: dict[str, int] = {}
    for v in framework_violations:
        vtype = str(v.violation_type)
        by_type[vtype] = by_type.get(vtype, 0) + 1

    # Count by severity
    by_severity: dict[str, int] = {}
    for v in framework_violations:
        sev = str(v.severity)
        by_severity[sev] = by_severity.get(sev, 0) + 1

    # SOC alerts count
    soc_query = select(func.count()).select_from(
        select(SOCAlert).where(SOCAlert.workspace_id == ws.id).subquery()
    )
    soc_result = await db.execute(soc_query)
    total_soc_alerts = soc_result.scalar() or 0

    return {
        "framework": framework,
        "workspace_id": str(ws.id),
        "period": {"from": from_date, "to": to_date},
        "summary": {
            "total_framework_violations": len(framework_violations),
            "total_all_violations": len(all_violations),
            "total_soc_alerts": total_soc_alerts,
        },
        "violations_by_type": by_type,
        "violations_by_severity": by_severity,
        "compliance_status": "compliant" if len(framework_violations) == 0 else "violations_found",
    }


@router.get("/posture")
async def get_compliance_posture(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Calculate real-time continuous compliance posture scores (0-100%) across all frameworks."""
    # Installed frameworks
    installed = await get_installed_frameworks(ws.id, db)
    installed_names = [f["framework"] for f in installed]

    # Fetch recent violations
    v_res = await db.execute(select(Violation).where(Violation.workspace_id == ws.id))
    all_violations = v_res.scalars().all()

    frameworks_posture = {}
    for fw, rules in COMPLIANCE_PACKS.items():
        is_inst = fw in installed_names
        fw_vtypes = _framework_rule_types(fw)
        matching_v = [v for v in all_violations if str(v.violation_type) in fw_vtypes]
        unresolved_v = [v for v in matching_v if not v.resolved]

        # Calculate score: baseline 100%, deduct 5% per unresolved violation, min 10%
        score = max(10, 100 - (len(unresolved_v) * 5)) if is_inst else 0

        controls_passing = max(0, len(rules) - len(unresolved_v))
        controls_total = max(len(rules), 1)

        frameworks_posture[fw] = {
            "installed": is_inst,
            "score": score,
            "controls_passing": controls_passing,
            "controls_total": controls_total,
            "pass_rate_pct": round((controls_passing / controls_total) * 100.0, 1),
            "unresolved_violations_count": len(unresolved_v),
            "total_violations_count": len(matching_v),
            "status": "PASSING" if score >= 90 else ("WARNING" if score >= 70 else "FAILING"),
        }

    # Overall enterprise compliance index
    active_scores = [fp["score"] for fp in frameworks_posture.values() if fp["installed"]]
    overall_index = (
        round(sum(float(s) for s in active_scores) / len(active_scores), 1)
        if active_scores
        else 100.0
    )

    return {
        "workspace_id": str(ws.id),
        "overall_compliance_score": overall_index,
        "installed_frameworks_count": len(installed_names),
        "frameworks": frameworks_posture,
    }


@router.get("/timeline")
async def get_compliance_timeline(
    days: int = Query(30, ge=7, le=90),
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return historical 30-day compliance violations and posture trendline."""
    from datetime import datetime, timedelta

    now = datetime.utcnow()
    res = await db.execute(
        select(Violation).where(
            Violation.workspace_id == ws.id,
            Violation.created_at >= (now - timedelta(days=days)),
        )
    )
    violations = res.scalars().all()

    # Bucket by date
    timeline_map: dict[str, dict[str, int]] = {}
    for i in range(days):
        d_str = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        timeline_map[d_str] = {"blocked": 0, "review": 0, "critical": 0}

    for v in violations:
        if v.created_at:
            d_str = v.created_at.strftime("%Y-%m-%d")
            if d_str in timeline_map:
                if v.severity == "critical":
                    timeline_map[d_str]["critical"] += 1
                else:
                    timeline_map[d_str]["blocked"] += 1

    return [
        {"date": date, "blocked": counts["blocked"], "critical": counts["critical"]}
        for date, counts in sorted(timeline_map.items())
    ]


@router.get("/export-bundle")
async def export_compliance_bundle(
    framework: str = Query("RBI"),
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Generate a formal regulatory compliance evidence bundle."""
    from a2a_firewall.db.models import AuditLog

    # 1. Rules
    rules_res = await db.execute(select(PolicyRule).where(PolicyRule.workspace_id == ws.id))
    rules = rules_res.scalars().all()

    # 2. Violations
    v_res = await db.execute(select(Violation).where(Violation.workspace_id == ws.id).limit(100))
    violations = v_res.scalars().all()

    # 3. Audit Logs
    a_res = await db.execute(select(AuditLog).where(AuditLog.workspace_id == ws.id).limit(100))
    audit_logs = a_res.scalars().all()

    return {
        "bundle_id": f"EVIDENCE-{ws.id}-{datetime.now(UTC).strftime('%Y%m%d%H%M')}",
        "framework": framework,
        "workspace_id": str(ws.id),
        "workspace_name": ws.name,
        "jurisdiction": ws.jurisdiction,
        "industry": ws.industry,
        "generated_at": datetime.now(UTC).isoformat(),
        "rules_installed": [
            {"id": str(r.id), "name": r.name, "framework_tag": r.framework_tag, "action": r.action}
            for r in rules
        ],
        "violations_logged_sample": [
            {
                "id": str(v.id),
                "type": v.violation_type,
                "severity": v.severity,
                "timestamp": v.created_at.isoformat() if v.created_at else None,
            }
            for v in violations
        ],
        "audit_trail_sample": [
            {
                "id": str(a.id),
                "action": a.action,
                "actor": a.actor_email,
                "timestamp": a.created_at.isoformat() if a.created_at else None,
            }
            for a in audit_logs
        ],
    }


def _framework_rule_types(framework: str) -> set[str]:
    """Return violation types relevant to a compliance framework."""
    mapping: dict[str, set[str]] = {
        "RBI": {
            "pii_exposure_credit_card",
            "pii_exposure_indian_pan",
            "high_value_transaction",
            "suspicious_beneficiary",
        },
        "DPDP": {"pii_exposure_aadhaar", "pii_exposure_email", "pii_exposure_phone"},
        "HIPAA": {
            "pii_exposure_ssn",
            "pii_exposure_medical_record_number",
            "pii_exposure_icd10_code",
        },
        "PCI-DSS": {"pii_exposure_credit_card", "pii_exposure_iban"},
        "GDPR": {"pii_exposure_email", "pii_exposure_phone", "pii_exposure_iban"},
        "CCPA": {"pii_exposure_ssn", "pii_exposure_email", "pii_exposure_phone"},
    }
    return mapping.get(framework, set())
