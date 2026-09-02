"""Lineage-aware DLP routes.

Exposes tenant DLP policy management plus an inspect/classify API backed by
``core/dlp_engine.DLPEngine`` and the persisted ``dlp_policies`` table. All
endpoints require an authenticated agent (workspace-scoped key).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_agent
from a2a_firewall.core.dlp_engine import DLPEngine, DlpRule
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Agent, DlpPolicy

VALID_ACTIONS = {"allow", "redact", "tokenize", "hash", "block"}
VALID_CLASSES = {"financial", "identity", "health", "contact", "sensitive"}

router = APIRouter()


class DlpRuleIn(BaseModel):
    """A rule payload for GET/PUT policy."""

    data_class: str
    destination: str
    action: str
    allowed_purposes: list[str] | None = None
    enabled: bool = True


class PolicyResponse(BaseModel):
    """A persisted rule as returned to the client."""

    data_class: str
    destination: str
    action: str
    allowed_purposes: list[str] | None = None
    enabled: bool = True


class InspectRequest(BaseModel):
    """A payload to DLP-inspect before it flows to a destination."""

    text: str
    destination: str = "internal"
    purpose: str | None = None
    tokenize: bool = False


class InspectResponse(BaseModel):
    """Outcome of a DLP inspection."""

    action: str
    blocked: bool
    transformed_text: str | None = None
    derived: bool = False
    source_digest: str | None = None
    findings: list[dict[str, Any]] = []


def _to_rule(policy: DlpPolicy) -> DlpRule:
    return DlpRule(
        data_class=policy.data_class,
        destination=policy.destination,
        action=policy.action,
        allowed_purposes=policy.allowed_purposes or None,
        enabled=policy.enabled,
    )


async def _load_engine(db: AsyncSession, agent: Agent) -> DLPEngine:
    result = await db.execute(
        select(DlpPolicy).where(
            DlpPolicy.workspace_id == agent.workspace_id,
            DlpPolicy.enabled.is_(True),
        )
    )
    rules = [_to_rule(p) for p in result.scalars().all()]
    return DLPEngine(rules=rules)


@router.post("/inspect", response_model=InspectResponse)
async def inspect_payload(
    body: InspectRequest,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
) -> InspectResponse:
    """Classify and transform ``text`` for ``destination`` under tenant DLP rules."""
    engine = await _load_engine(db, agent)
    decision = engine.inspect(
        body.text,
        destination=body.destination,
        purpose=body.purpose,
    )
    return InspectResponse(
        action=decision.action,
        blocked=decision.blocked,
        transformed_text=decision.transformed_text,
        derived=decision.derived,
        source_digest=decision.source_digest,
        findings=decision.findings,
    )


@router.post("/classify", response_model=InspectResponse)
async def classify_payload(
    body: InspectRequest,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
) -> InspectResponse:
    """Report how PII would be handled for a destination WITHOUT transforming.

    Mirrors ``inspect`` but returns the would-be action and findings while
    leaving the source text untouched for safe preview/audit.
    """
    engine = await _load_engine(db, agent)
    decision = engine.inspect(
        body.text,
        destination=body.destination,
        purpose=body.purpose,
    )
    return InspectResponse(
        action=decision.action,
        blocked=decision.blocked,
        transformed_text=body.text,
        derived=decision.derived,
        source_digest=decision.source_digest,
        findings=decision.findings,
    )


@router.get("/policy", response_model=list[PolicyResponse])
async def get_policy(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
) -> list[PolicyResponse]:
    """List the tenant's current DLP policy rules."""
    result = await db.execute(select(DlpPolicy).where(DlpPolicy.workspace_id == agent.workspace_id))
    return [
        PolicyResponse(
            data_class=p.data_class,
            destination=p.destination,
            action=p.action,
            allowed_purposes=p.allowed_purposes or None,
            enabled=p.enabled,
        )
        for p in result.scalars().all()
    ]


@router.put("/policy", response_model=list[PolicyResponse])
async def put_policy(
    body: list[DlpRuleIn],
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
) -> list[PolicyResponse]:
    """Replace the tenant's DLP policy (idempotent full-write)."""
    for rule in body:
        if rule.action not in VALID_ACTIONS:
            raise HTTPException(status_code=422, detail=f"Invalid action: {rule.action}")
        if rule.data_class not in VALID_CLASSES:
            raise HTTPException(status_code=422, detail=f"Invalid data class: {rule.data_class}")

    await db.execute(delete(DlpPolicy).where(DlpPolicy.workspace_id == agent.workspace_id))
    for rule in body:
        db.add(
            DlpPolicy(
                workspace_id=agent.workspace_id,
                data_class=rule.data_class,
                destination=rule.destination,
                action=rule.action,
                allowed_purposes=rule.allowed_purposes,
                enabled=rule.enabled,
            )
        )
    await db.commit()

    result = await db.execute(select(DlpPolicy).where(DlpPolicy.workspace_id == agent.workspace_id))
    return [
        PolicyResponse(
            data_class=p.data_class,
            destination=p.destination,
            action=p.action,
            allowed_purposes=p.allowed_purposes or None,
            enabled=p.enabled,
        )
        for p in result.scalars().all()
    ]
