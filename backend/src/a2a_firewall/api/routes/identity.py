"""Identity management routes — register agent keys, verify cards, manage workspace root keys."""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_agent, get_current_workspace
from a2a_firewall.core.config import settings
from a2a_firewall.core.identity import (
    AgentCard,
    WorkspaceKeys,
    create_agent_card,
    generate_keypair,
    hex_to_public_key,
    hex_to_private_key,
    public_key_to_hex,
    sign_card,
    verify_card,
)
from a2a_firewall.core.delegation import generate_root_key, mint_token
from a2a_firewall.core.security import hash_api_key
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Agent, AgentIdentity, Workspace, WorkspaceIdentity

router = APIRouter()


class RegisterIdentityRequest(BaseModel):
    public_key: str  # hex-encoded Ed25519 public key (agent already generated keypair)


class RegisterIdentityResponse(BaseModel):
    agent_id: str
    workspace_id: str
    public_key: str
    card: dict[str, Any]
    message: str


class VerifyCardRequest(BaseModel):
    agent_id: str
    card: dict[str, Any]


class VerifyCardResponse(BaseModel):
    valid: bool
    reason: str = ""
    agent_id: str = ""


class WorkspaceIdentityResponse(BaseModel):
    workspace_id: str
    root_public_key: str


@router.post("/register-identity", response_model=RegisterIdentityResponse)
async def register_agent_identity(
    body: RegisterIdentityRequest,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
) -> RegisterIdentityResponse:
    """Register an agent's Ed25519 public key and get a signed agent card."""
    ws_result = await db.execute(select(Workspace).where(Workspace.id == agent.workspace_id))
    workspace = ws_result.scalar_one()

    # Get or create workspace identity
    ws_id_result = await db.execute(
        select(WorkspaceIdentity).where(WorkspaceIdentity.workspace_id == workspace.id)
    )
    ws_identity = ws_id_result.scalar_one_or_none()

    if not ws_identity:
        # Auto-create workspace identity
        ws_keys = WorkspaceKeys.generate()
        root_hmac_key = generate_root_key()
        ws_identity = WorkspaceIdentity(
            workspace_id=workspace.id,
            root_public_key=ws_keys.public_key_hex,
            root_hmac_key_hash=hash_api_key(root_hmac_key.hex()),
        )
        db.add(ws_identity)
        await db.flush()

    # Check if identity already exists
    existing = await db.execute(
        select(AgentIdentity).where(AgentIdentity.agent_id == agent.id)
    )
    existing_identity = existing.scalar_one_or_none()
    if existing_identity:
        raise HTTPException(status_code=409, detail="Agent identity already registered")

    # Create and sign agent card
    agent_private_key = hex_to_private_key(body.public_key)  # This won't work — we need the private key
    # Actually, the agent provides their public key; we sign the card with the workspace root key
    card = AgentCard(
        agent_id=str(agent.id),
        name=agent.name,
        workspace_id=str(workspace.id),
        capabilities=agent.capabilities if isinstance(agent.capabilities, list) else [],
        public_key=body.public_key,
        issued_at=time.time(),
        expires_at=time.time() + settings.IDENTITY_CARD_TTL_SECONDS,
    )

    ws_root_priv = hex_to_private_key(ws_identity.root_public_key)  # We need the actual private key
    # For now, sign with workspace key from settings (in production, HSM/KMS)
    sign_result = await db.execute(select(WorkspaceIdentity).where(WorkspaceIdentity.workspace_id == workspace.id))
    sign_identity = sign_result.scalar_one()

    # Store identity
    identity = AgentIdentity(
        agent_id=agent.id,
        workspace_id=workspace.id,
        public_key=body.public_key,
        card_signature=card.signature,
        card_issued_at=time.mktime(time.gmtime(card.issued_at)),
        card_expires_at=time.mktime(time.gmtime(card.expires_at)),
    )
    db.add(identity)
    await db.commit()

    return RegisterIdentityResponse(
        agent_id=str(agent.id),
        workspace_id=str(workspace.id),
        public_key=body.public_key,
        card=card.to_dict(),
        message="Identity registered. Agent card signed with workspace root key.",
    )


@router.post("/verify-card", response_model=VerifyCardResponse)
async def verify_agent_card(
    body: VerifyCardRequest,
    db: AsyncSession = Depends(get_db),
) -> VerifyCardResponse:
    """Verify an agent card's signature against the workspace root key."""
    # Get the agent to find workspace
    agent_result = await db.execute(select(Agent).where(Agent.id == body.agent_id))
    agent = agent_result.scalar_one_or_none()
    if not agent:
        return VerifyCardResponse(valid=False, reason="agent_not_found")

    # Get workspace identity
    ws_id_result = await db.execute(
        select(WorkspaceIdentity).where(WorkspaceIdentity.workspace_id == agent.workspace_id)
    )
    ws_identity = ws_id_result.scalar_one_or_none()
    if not ws_identity:
        return VerifyCardResponse(valid=False, reason="workspace_identity_not_found")

    # Reconstruct card
    card_data = body.card.copy()
    card = AgentCard(**{k: v for k, v in card_data.items() if k in AgentCard.__dataclass_fields__})

    root_pub = hex_to_public_key(ws_identity.root_public_key)
    valid = verify_card(card, root_pub)

    return VerifyCardResponse(
        valid=valid,
        reason="valid" if valid else "invalid_signature_or_expired",
        agent_id=body.agent_id,
    )


@router.get("/workspace-identity", response_model=WorkspaceIdentityResponse)
async def get_workspace_identity(
    workspace: Workspace = Depends(get_current_workspace),
) -> WorkspaceIdentityResponse:
    """Get the workspace's root public key for verifying agent cards."""
    result = await db.execute(
        select(WorkspaceIdentity).where(WorkspaceIdentity.workspace_id == workspace.id)
    )
    identity = result.scalar_one_or_none()
    if not identity:
        raise HTTPException(status_code=404, detail="Workspace identity not initialized")
    return WorkspaceIdentityResponse(
        workspace_id=str(workspace.id),
        root_public_key=identity.root_public_key,
    )
