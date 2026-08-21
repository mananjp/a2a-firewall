"""Compliance rule packs — pre-built policy rule bundles per regulatory framework.

Supported frameworks:
  - RBI (Reserve Bank of India): blocks unmasked account numbers / PAN
  - DPDP (Digital Personal Data Protection Act, India): flags cross-border PII transfer
  - HIPAA (US healthcare): blocks PHI-pattern payloads
  - PCI-DSS: blocks unmasked card numbers (Luhn-validated)
  - GDPR (EU): flags personal data processing without consent
  - CCPA (California Consumer Privacy Act): flags PII exposure

Each pack is a set of policy rules installed into the existing `policy_rules`
table with a `framework_tag` column for traceability.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.db.models import ComplianceRulePack, PolicyRule

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pack definitions
# ---------------------------------------------------------------------------

COMPLIANCE_PACKS: dict[str, list[dict[str, Any]]] = {
    "RBI": [
        {
            "name": "RBI: Block Unmasked PAN",
            "description": "Block tasks containing unmasked Indian PAN numbers (XXXXX0000X format) in payloads.",
            "priority": 5,
            "action": "block",
            "block_reason": "RBI compliance: unmasked PAN detected in payload",
            "condition_expr": {"_pii_check": "indian_pan"},
        },
        {
            "name": "RBI: Block Unmasked Card Numbers",
            "description": "Block tasks containing unmasked credit/debit card numbers.",
            "priority": 5,
            "action": "block",
            "block_reason": "RBI compliance: unmasked card number detected",
            "condition_expr": {"_pii_check": "credit_card"},
        },
        {
            "name": "RBI: Flag High-Value Cross-Border Transfer",
            "description": "Flag wire transfers exceeding ₹50,000 to non-domestic accounts.",
            "priority": 10,
            "action": "review",
            "block_reason": "RBI compliance: high-value cross-border transfer requires review",
            "condition_expr": {"_compliance_check": "rbi_cross_border"},
        },
    ],
    "DPDP": [
        {
            "name": "DPDP: Flag Cross-Border PII Transfer",
            "description": "Flag tasks transferring personal data (Aadhaar, PAN, email, phone) outside declared jurisdiction without consent flag.",
            "priority": 5,
            "action": "review",
            "block_reason": "DPDP compliance: cross-border personal data transfer without consent",
            "condition_expr": {"_pii_check": "aadhaar"},
        },
        {
            "name": "DPDP: Block Aadhaar Exposure",
            "description": "Block tasks containing unmasked Aadhaar numbers.",
            "priority": 3,
            "action": "block",
            "block_reason": "DPDP compliance: unmasked Aadhaar number detected",
            "condition_expr": {"_pii_check": "aadhaar"},
        },
    ],
    "HIPAA": [
        {
            "name": "HIPAA: Block PHI Exposure (MRN)",
            "description": "Block tasks containing medical record numbers.",
            "priority": 3,
            "action": "block",
            "block_reason": "HIPAA compliance: medical record number detected in payload",
            "condition_expr": {"_pii_check": "medical_record_number"},
        },
        {
            "name": "HIPAA: Block PHI Exposure (SSN)",
            "description": "Block tasks containing Social Security Numbers in a healthcare context.",
            "priority": 3,
            "action": "block",
            "block_reason": "HIPAA compliance: SSN detected in payload",
            "condition_expr": {"_pii_check": "ssn"},
        },
        {
            "name": "HIPAA: Flag ICD-10 Codes",
            "description": "Flag tasks containing ICD-10 diagnosis codes for review.",
            "priority": 10,
            "action": "review",
            "block_reason": "HIPAA compliance: diagnosis code detected",
            "condition_expr": {"_pii_check": "icd10_code"},
        },
    ],
    "PCI-DSS": [
        {
            "name": "PCI-DSS: Block Unmasked Card Numbers",
            "description": "Block tasks containing unmasked credit/debit card numbers (Luhn-validated).",
            "priority": 2,
            "action": "block",
            "block_reason": "PCI-DSS compliance: unmasked card number detected",
            "condition_expr": {"_pii_check": "credit_card"},
        },
        {
            "name": "PCI-DSS: Block Card Number with IBAN",
            "description": "Block tasks containing IBAN numbers alongside card data.",
            "priority": 5,
            "action": "block",
            "block_reason": "PCI-DSS compliance: IBAN detected in payload",
            "condition_expr": {"_pii_check": "iban"},
        },
    ],
    "GDPR": [
        {
            "name": "GDPR: Flag Email/Phone PII Exposure",
            "description": "Flag tasks exposing email addresses or phone numbers for review.",
            "priority": 15,
            "action": "review",
            "block_reason": "GDPR compliance: personal contact data detected",
            "condition_expr": {"_pii_check": "email"},
        },
        {
            "name": "GDPR: Block IBAN Exposure",
            "description": "Block tasks containing unmasked IBAN numbers.",
            "priority": 5,
            "action": "block",
            "block_reason": "GDPR compliance: unmasked IBAN detected",
            "condition_expr": {"_pii_check": "iban"},
        },
    ],
    "CCPA": [
        {
            "name": "CCPA: Flag SSN Exposure",
            "description": "Flag tasks containing Social Security Numbers.",
            "priority": 5,
            "action": "block",
            "block_reason": "CCPA compliance: SSN detected in payload",
            "condition_expr": {"_pii_check": "ssn"},
        },
        {
            "name": "CCPA: Flag Email/Phone Exposure",
            "description": "Flag tasks exposing consumer contact information.",
            "priority": 15,
            "action": "review",
            "block_reason": "CCPA compliance: consumer PII detected",
            "condition_expr": {"_pii_check": "email"},
        },
    ],
}

# Map jurisdiction codes to default frameworks
JURISDICTION_FRAMEWORKS: dict[str, list[str]] = {
    "IN": ["RBI", "DPDP"],
    "EU": ["GDPR", "PCI-DSS"],
    "US": ["HIPAA", "CCPA", "PCI-DSS"],
    "US-CA": ["CCPA", "HIPAA", "PCI-DSS"],
    "UK": ["GDPR", "PCI-DSS"],
    "SG": ["PCI-DSS"],
    "AE": ["PCI-DSS"],
}

# Map industry verticals to default frameworks
INDUSTRY_FRAMEWORKS: dict[str, list[str]] = {
    "banking": ["RBI", "PCI-DSS"],
    "fintech": ["RBI", "PCI-DSS"],
    "healthcare": ["HIPAA"],
    "insurance": ["HIPAA", "PCI-DSS"],
    "retail": ["PCI-DSS", "CCPA"],
    "general": [],
}


# ---------------------------------------------------------------------------
# Pack installation / management
# ---------------------------------------------------------------------------


async def apply_compliance_pack(
    workspace_id: uuid.UUID,
    framework: str,
    db: AsyncSession,
) -> dict[str, Any]:
    """Install the compliance rule pack for a given framework.

    Inserts the policy rules into the policy_rules table with a framework_tag.
    Skips rules that already exist for this workspace+framework.

    Returns summary of installed rules.
    """
    pack_rules = COMPLIANCE_PACKS.get(framework)
    if pack_rules is None:
        return {"error": f"Unknown framework: {framework}", "installed": 0}

    installed = 0
    skipped = 0

    for rule_def in pack_rules:
        # Check if already installed
        existing = await db.execute(
            select(PolicyRule).where(
                PolicyRule.workspace_id == workspace_id,
                PolicyRule.name == rule_def["name"],
                PolicyRule.framework_tag == framework,
            )
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue

        rule = PolicyRule(
            workspace_id=workspace_id,
            priority=rule_def["priority"],
            name=rule_def["name"],
            description=rule_def.get("description"),
            action=rule_def["action"],
            block_reason=rule_def.get("block_reason"),
            condition_expr=rule_def.get("condition_expr"),
            is_active=True,
            framework_tag=framework,
        )
        db.add(rule)
        installed += 1

    # Record in compliance_rule_packs table
    existing_pack = await db.execute(
        select(ComplianceRulePack).where(
            ComplianceRulePack.workspace_id == workspace_id,
            ComplianceRulePack.framework == framework,
        )
    )
    if not existing_pack.scalar_one_or_none():
        db.add(
            ComplianceRulePack(
                workspace_id=workspace_id,
                framework=framework,
                version="1.0",
                rules_count=len(pack_rules),
                is_active=True,
            )
        )

    await db.commit()

    return {
        "framework": framework,
        "installed": installed,
        "skipped": skipped,
        "total_rules": len(pack_rules),
    }


async def remove_compliance_pack(
    workspace_id: uuid.UUID,
    framework: str,
    db: AsyncSession,
) -> dict[str, Any]:
    """Remove all policy rules for a given framework from a workspace."""
    result = await db.execute(
        select(PolicyRule).where(
            PolicyRule.workspace_id == workspace_id,
            PolicyRule.framework_tag == framework,
        )
    )
    rules = result.scalars().all()
    count = len(rules)
    for rule in rules:
        await db.delete(rule)

    # Remove pack record
    pack_result = await db.execute(
        select(ComplianceRulePack).where(
            ComplianceRulePack.workspace_id == workspace_id,
            ComplianceRulePack.framework == framework,
        )
    )
    pack = pack_result.scalar_one_or_none()
    if pack:
        await db.delete(pack)

    await db.commit()
    return {"framework": framework, "removed": count}


async def get_installed_frameworks(
    workspace_id: uuid.UUID,
    db: AsyncSession,
) -> list[dict[str, Any]]:
    """List all installed compliance frameworks for a workspace."""
    result = await db.execute(
        select(ComplianceRulePack).where(
            ComplianceRulePack.workspace_id == workspace_id
        )
    )
    packs = result.scalars().all()
    return [
        {
            "framework": str(p.framework),
            "version": str(p.version),
            "rules_count": p.rules_count,
            "is_active": p.is_active,
            "installed_at": str(p.created_at) if p.created_at else None,
        }
        for p in packs
    ]


def suggest_frameworks(
    jurisdiction: str | None, industry: str | None
) -> list[str]:
    """Suggest compliance frameworks based on jurisdiction and industry."""
    frameworks: set[str] = set()
    if jurisdiction:
        frameworks.update(JURISDICTION_FRAMEWORKS.get(jurisdiction, []))
    if industry:
        frameworks.update(INDUSTRY_FRAMEWORKS.get(industry.lower(), []))
    return sorted(frameworks)
