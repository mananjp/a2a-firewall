"""Delegation chain routes — create, attenuate, and verify delegation tokens."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.core.delegation import (
    attenuate_token,
    check_capability,
    mint_token,
    token_from_compact,
    verify_token,
)
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Agent, DelegationChain, Workspace

router = APIRouter()


class MintTokenRequest(BaseModel):
    agent_id: str
    initial_caveats: list[str] | None = None


class MintTokenResponse(BaseModel):
    token: dict[str, Any]
    message: str


class AttenuateRequest(BaseModel):
    token_compact: str
    new_caveats: list[str]


class AttenuateResponse(BaseModel):
    token: dict[str, Any]
    message: str


class VerifyTokenRequest(BaseModel):
    token_compact: str


class VerifyTokenResponse(BaseModel):
    valid: bool
    reason: str = ""
    caveats: list[str] = []
    parsed: dict[str, str] = {}


class CheckCapabilityRequest(BaseModel):
    token_compact: str
    required: str  # e.g. "task_type=research"


class CheckCapabilityResponse(BaseModel):
    granted: bool
    token_caveats: list[str] = []


class DelegationChainResponse(BaseModel):
    task_id: str
    chain: list[dict[str, Any]]


@router.post("/mint", response_model=MintTokenResponse)
async def mint_delegation_token(
    body: MintTokenRequest,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> MintTokenResponse:
    """Mint a root delegation token for an agent.

    The workspace root HMAC key is used to sign the token. In production,
    this key should be in an HSM — never returned to clients.
    """
    # Verify agent belongs to this workspace
    agent_result = await db.execute(
        select(Agent).where(Agent.id == body.agent_id, Agent.workspace_id == workspace.id)
    )
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found in workspace")

    # Generate root key for this workspace (in production, retrieve from HSM/vault)
    from a2a_firewall.core.security import hash_api_key
    root_key = hash_api_key(str(workspace.id)).encode()[:32]

    initial = body.initial_caveats or [f"workspace_id={workspace.id}"]
    token = mint_token(root_key, str(workspace.id), body.agent_id, initial)

    return MintTokenResponse(
        token=token.to_dict(),
        message="Root delegation token minted. Store securely — it cannot be recovered.",
    )


@router.post("/attenuate", response_model=AttenuateResponse)
async def attenuate_delegation_token(
    body: AttenuateRequest,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> AttenuateResponse:
    """Create a delegated token with additional caveats (narrowing only).

    Each delegation hop can only restrict, never widen, the token's capabilities.
    """
    from a2a_firewall.core.security import hash_api_key
    root_key = hash_api_key(str(workspace.id)).encode()[:32]

    parent_token = token_from_compact(body.token_compact)

    # Verify parent token first
    verification = verify_token(parent_token, root_key)
    if not verification.valid:
        raise HTTPException(status_code=403, detail=f"Invalid parent token: {verification.reason}")

    try:
        child_token = attenuate_token(parent_token, root_key, body.new_caveats)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=f"Caveat narrowing violation: {e}") from e

    return AttenuateResponse(
        token=child_token.to_dict(),
        message=f"Token attenuated with {len(body.new_caveats)} new caveats. Total caveats: {len(child_token.caveats)}",
    )


@router.post("/verify", response_model=VerifyTokenResponse)
async def verify_delegation_token(
    body: VerifyTokenRequest,
    workspace: Workspace = Depends(get_current_workspace),
) -> VerifyTokenResponse:
    """Verify a delegation token's signature and check expiry."""
    from a2a_firewall.core.security import hash_api_key
    root_key = hash_api_key(str(workspace.id)).encode()[:32]

    token = token_from_compact(body.token_compact)
    result = verify_token(token, root_key)

    return VerifyTokenResponse(
        valid=result.valid,
        reason=result.reason,
        caveats=result.caveats,
        parsed=result.parsed,
    )


@router.post("/check-capability", response_model=CheckCapabilityResponse)
async def check_token_capability(
    body: CheckCapabilityRequest,
    workspace: Workspace = Depends(get_current_workspace),
) -> CheckCapabilityResponse:
    """Check if a delegation token grants a specific capability."""
    from a2a_firewall.core.security import hash_api_key
    root_key = hash_api_key(str(workspace.id)).encode()[:32]

    token = token_from_compact(body.token_compact)
    result = verify_token(token, root_key)
    if not result.valid:
        raise HTTPException(status_code=403, detail=f"Invalid token: {result.reason}")

    granted = check_capability(token, body.required)

    return CheckCapabilityResponse(
        granted=granted,
        token_caveats=token.caveats,
    )


@router.get("/chain/{task_id}", response_model=DelegationChainResponse)
async def get_delegation_chain(
    task_id: str,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> DelegationChainResponse:
    """Get the full delegation chain for a task (audit trail)."""
    result = await db.execute(
        select(DelegationChain)
        .where(DelegationChain.workspace_id == workspace.id, DelegationChain.task_id == task_id)
        .order_by(DelegationChain.delegation_depth)
    )
    rows = result.scalars().all()

    return DelegationChainResponse(
        task_id=task_id,
        chain=[
            {
                "depth": r.delegation_depth,
                "sender": str(r.sender_agent_id),
                "receiver": str(r.receiver_agent_id),
                "caveats": r.caveats,
                "signature_valid": r.signature_valid,
                "chain_hash": r.chain_hash,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    )
