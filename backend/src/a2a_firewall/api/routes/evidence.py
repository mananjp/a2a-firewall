"""Decision Evidence Envelope routes — fetch, verify, and replay signed decisions."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.core.evidence import (
    EvidenceEnvelope,
    replay_from_envelope,
    workspace_root_public_key_hex,
)
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import EvidenceEnvelopeRow, Workspace

router = APIRouter()


class EvidenceResponse(BaseModel):
    decision_id: str
    task_id: str
    final_action: str
    risk_score: float
    envelope_version: str
    signature: str
    signer_public_key: str
    envelope: dict[str, Any]
    created_at: str | None = None


class VerifyResponse(BaseModel):
    decision_id: str
    checks: dict[str, bool]
    valid: bool


class ReplayResponse(BaseModel):
    decision_id: str
    replay: dict[str, bool]


@router.get("", response_model=list[EvidenceResponse])
async def list_evidence(
    limit: int = 50,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[EvidenceResponse]:
    """List recent signed evidence envelopes for the current workspace."""
    result = await db.execute(
        select(EvidenceEnvelopeRow)
        .where(EvidenceEnvelopeRow.workspace_id == workspace.id)
        .order_by(EvidenceEnvelopeRow.created_at.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        EvidenceResponse(
            decision_id=row.decision_id,
            task_id=str(row.task_id),
            final_action=row.final_action,
            risk_score=row.risk_score,
            envelope_version=row.envelope_version,
            signature=row.signature,
            signer_public_key=row.signer_public_key,
            envelope=row.envelope,
            created_at=row.created_at.isoformat() if row.created_at else None,
        )
        for row in rows
    ]


@router.get("/{decision_id}", response_model=EvidenceResponse)
async def get_evidence(
    decision_id: str,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> EvidenceResponse:
    """Fetch a signed evidence envelope by its decision_id."""
    result = await db.execute(
        select(EvidenceEnvelopeRow).where(
            EvidenceEnvelopeRow.workspace_id == workspace.id,
            EvidenceEnvelopeRow.decision_id == decision_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Evidence envelope not found")
    return EvidenceResponse(
        decision_id=row.decision_id,
        task_id=str(row.task_id),
        final_action=row.final_action,
        risk_score=row.risk_score,
        envelope_version=row.envelope_version,
        signature=row.signature,
        signer_public_key=row.signer_public_key,
        envelope=row.envelope,
        created_at=row.created_at.isoformat() if row.created_at else None,
    )


@router.get("/{decision_id}/verify", response_model=VerifyResponse)
async def verify_evidence(
    decision_id: str,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> VerifyResponse:
    """Verify an evidence envelope's signature against the workspace root key."""
    result = await db.execute(
        select(EvidenceEnvelopeRow).where(
            EvidenceEnvelopeRow.workspace_id == workspace.id,
            EvidenceEnvelopeRow.decision_id == decision_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Evidence envelope not found")

    envelope = EvidenceEnvelope.model_validate(row.envelope)
    valid = envelope.verify_signature(str(row.signer_public_key))
    return VerifyResponse(
        decision_id=decision_id,
        checks={"signature_valid": valid},
        valid=valid,
    )


@router.get("/{decision_id}/replay", response_model=ReplayResponse)
async def replay_evidence(
    decision_id: str,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> ReplayResponse:
    """Deterministically replay/verify an envelope offline against pinned versions."""
    result = await db.execute(
        select(EvidenceEnvelopeRow).where(
            EvidenceEnvelopeRow.workspace_id == workspace.id,
            EvidenceEnvelopeRow.decision_id == decision_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Evidence envelope not found")

    envelope = EvidenceEnvelope.model_validate(row.envelope)
    public_key = str(row.signer_public_key) or workspace_root_public_key_hex(str(workspace.id))
    replay = replay_from_envelope(envelope, public_key)
    return ReplayResponse(decision_id=decision_id, replay=replay)
