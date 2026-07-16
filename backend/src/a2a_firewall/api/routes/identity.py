"""Identity management routes — register agent keys, verify cards, manage workspace root keys."""
from __future__ import annotations

import hashlib
import time
from datetime import UTC, datetime
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_agent, get_current_workspace
from a2a_firewall.core.config import settings
from a2a_firewall.core.identity import (
    AgentCard,
    hex_to_public_key,
    public_key_to_hex,
    sign_card,
    verify_card,
)
from a2a_firewall.core.delegation import generate_root_key
from a2a_firewall.core.security import hash_api_key
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Agent, AgentIdentity, Workspace, WorkspaceIdentity

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _derive_workspace_private_key(workspace_id) -> Ed25519PrivateKey:
    """Deterministically derive the workspace root Ed25519 private key from
    the workspace UUID.

    In production this would be replaced by an HSM/KMS lookup. For the MVP
    this is a safe, reproducible derivation that never stores the private key
    in the database.
    """
    seed = hashlib.sha256(
        str(workspace_id).encode() if not hasattr(workspace_id, "bytes") else workspace_id.bytes
    ).digest()
    return Ed25519PrivateKey.from_private_bytes(seed)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/register-identity", response_model=RegisterIdentityResponse)
async def register_agent_identity(
    body: RegisterIdentityRequest,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
) -> RegisterIdentityResponse:
    """Register an agent's Ed25519 public key and get a signed agent card."""
    ws_result = await db.execute(select(Workspace).where(Workspace.id == agent.workspace_id))
    workspace = ws_result.scalar_one()

    # Derive workspace root private key deterministically
    ws_root_priv = _derive_workspace_private_key(workspace.id)
    ws_root_pub_hex = public_key_to_hex(ws_root_priv.public_key())

    # Get or create workspace identity
    ws_id_result = await db.execute(
        select(WorkspaceIdentity).where(WorkspaceIdentity.workspace_id == workspace.id)
    )
    ws_identity = ws_id_result.scalar_one_or_none()

    if not ws_identity:
        root_hmac_key = generate_root_key()
        ws_identity = WorkspaceIdentity(
            workspace_id=workspace.id,
            root_public_key=ws_root_pub_hex,
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

    # Create and sign agent card with the workspace root private key
    card = AgentCard(
        agent_id=str(agent.id),
        name=agent.name,
        workspace_id=str(workspace.id),
        capabilities=agent.capabilities if isinstance(agent.capabilities, list) else [],
        public_key=body.public_key,
        issued_at=time.time(),
        expires_at=time.time() + settings.IDENTITY_CARD_TTL_SECONDS,
    )
    card = sign_card(card, ws_root_priv)

    # Store identity
    identity = AgentIdentity(
        agent_id=agent.id,
        workspace_id=workspace.id,
        public_key=body.public_key,
        card_signature=card.signature,
        card_issued_at=datetime.fromtimestamp(card.issued_at, tz=UTC),
        card_expires_at=datetime.fromtimestamp(card.expires_at, tz=UTC),
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
    db: AsyncSession = Depends(get_db),
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
