"""Compliance reporting and framework management routes."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import PolicyRule, SOCAlert, Violation, Workspace
from a2a_firewall.detection.compliance_packs import (
    COMPLIANCE_PACKS,
    JURISDICTION_FRAMEWORKS,
    INDUSTRY_FRAMEWORKS,
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
        raise HTTPException(400, f"Unknown framework: {body.framework}. Available: {', '.join(COMPLIANCE_PACKS.keys())}")
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
    jurisdiction = ws.jurisdiction if hasattr(ws, 'jurisdiction') else None
    industry = ws.industry if hasattr(ws, 'industry') else None
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

    violation_query = (
        select(Violation)
        .where(Violation.workspace_id == ws.id)
    )
    if from_date:
        from datetime import datetime
        try:
            violation_query = violation_query.where(Violation.created_at >= datetime.fromisoformat(from_date))
        except ValueError:
            pass
    if to_date:
        from datetime import datetime
        try:
            violation_query = violation_query.where(Violation.created_at <= datetime.fromisoformat(to_date))
        except ValueError:
            pass

    result = await db.execute(violation_query)
    all_violations = result.scalars().all()

    # Filter by framework-related violation types
    framework_violations = [
        v for v in all_violations
        if str(v.violation_type) in framework_rule_types
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
        select(SOCAlert)
        .where(SOCAlert.workspace_id == ws.id)
        .subquery()
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


def _framework_rule_types(framework: str) -> set[str]:
    """Return violation types relevant to a compliance framework."""
    mapping: dict[str, set[str]] = {
        "RBI": {"pii_exposure_credit_card", "pii_exposure_indian_pan", "high_value_transaction", "suspicious_beneficiary"},
        "DPDP": {"pii_exposure_aadhaar", "pii_exposure_email", "pii_exposure_phone"},
        "HIPAA": {"pii_exposure_ssn", "pii_exposure_medical_record_number", "pii_exposure_icd10_code"},
        "PCI-DSS": {"pii_exposure_credit_card", "pii_exposure_iban"},
        "GDPR": {"pii_exposure_email", "pii_exposure_phone", "pii_exposure_iban"},
        "CCPA": {"pii_exposure_ssn", "pii_exposure_email", "pii_exposure_phone"},
    }
    return mapping.get(framework, set())
