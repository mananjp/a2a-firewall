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

from a2a_firewall.api.deps import get_current_workspace, get_current_workspace_flexible
from a2a_firewall.core.dlp_engine import DLPEngine, DlpRule
from a2a_firewall.core.vault import SecureTokenVault, create_dev_vault
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import DlpPolicy, Workspace

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


async def _load_engine(db: AsyncSession, ws: Workspace) -> DLPEngine:
    result = await db.execute(
        select(DlpPolicy).where(
            DlpPolicy.workspace_id == ws.id,
            DlpPolicy.enabled.is_(True),
        )
    )
    rules = [_to_rule(p) for p in result.scalars().all()]
    return DLPEngine(rules=rules)


@router.post("/inspect", response_model=InspectResponse)
async def inspect_payload(
    body: InspectRequest,
    ws: Workspace = Depends(get_current_workspace_flexible),
    db: AsyncSession = Depends(get_db),
) -> InspectResponse:
    """Classify and transform ``text`` for ``destination`` under tenant DLP rules."""
    engine = await _load_engine(db, ws)
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
    ws: Workspace = Depends(get_current_workspace_flexible),
    db: AsyncSession = Depends(get_db),
) -> InspectResponse:
    """Report how PII would be handled for a destination WITHOUT transforming.

    Mirrors ``inspect`` but returns the would-be action and findings while
    leaving the source text untouched for safe preview/audit.
    """
    engine = await _load_engine(db, ws)
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
    ws: Workspace = Depends(get_current_workspace_flexible),
    db: AsyncSession = Depends(get_db),
) -> list[PolicyResponse]:
    """List the tenant's current DLP policy rules."""
    result = await db.execute(select(DlpPolicy).where(DlpPolicy.workspace_id == ws.id))
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
    ws: Workspace = Depends(get_current_workspace_flexible),
    db: AsyncSession = Depends(get_db),
) -> list[PolicyResponse]:
    """Replace the tenant's DLP policy (idempotent full-write)."""
    for rule in body:
        if rule.action not in VALID_ACTIONS:
            raise HTTPException(status_code=422, detail=f"Invalid action: {rule.action}")
        if rule.data_class not in VALID_CLASSES:
            raise HTTPException(status_code=422, detail=f"Invalid data class: {rule.data_class}")

    await db.execute(delete(DlpPolicy).where(DlpPolicy.workspace_id == ws.id))
    for rule in body:
        db.add(
            DlpPolicy(
                workspace_id=ws.id,
                data_class=rule.data_class,
                destination=rule.destination,
                action=rule.action,
                allowed_purposes=rule.allowed_purposes,
                enabled=rule.enabled,
            )
        )
    await db.commit()

    result = await db.execute(select(DlpPolicy).where(DlpPolicy.workspace_id == ws.id))
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


# ---------------------------------------------------------------------------
# Tokenize / Detokenize endpoints (backed by SecureTokenVault)
# ---------------------------------------------------------------------------

# Module-level vault singleton (dev mode: in-memory).
# Production deployments override via startup event or DI.
_vault: SecureTokenVault | None = None


def _get_vault() -> SecureTokenVault:
    global _vault
    if _vault is None:
        _vault = create_dev_vault()
    return _vault


class TokenizeRequest(BaseModel):
    """Request to tokenize sensitive text."""

    text: str
    destination: str | None = None
    entity_type: str = "pii"


class TokenizeResponse(BaseModel):
    """Result of tokenization."""

    tokenized_text: str


class DetokenizeRequest(BaseModel):
    """Request to detokenize previously tokenized text."""

    text: str
    purpose: str


class DetokenizeResponse(BaseModel):
    """Result of detokenization."""

    text: str


@router.post("/tokenize", response_model=TokenizeResponse)
async def tokenize_text(
    body: TokenizeRequest,
    ws: Workspace = Depends(get_current_workspace_flexible),
) -> TokenizeResponse:
    """Tokenize sensitive entities in ``text``, replacing them with vault tokens.

    Uses the PII scanner to find sensitive spans, then replaces each with a
    secure vault token (AES-256-GCM encrypted, HMAC-SHA256 indexed).
    """
    from a2a_firewall.detection.pii_patterns import scan_all_pii

    vault = _get_vault()
    workspace_id = str(ws.id)
    text = body.text

    matches = scan_all_pii(text)
    if not matches:
        return TokenizeResponse(tokenized_text=text)

    # Sort by start position, widest first for overlap resolution
    matches.sort(key=lambda m: (m.start, -(m.end - m.start)))
    kept: list[Any] = []
    for m in matches:
        if any(k.start < m.end and m.start < k.end for k in kept):
            continue
        kept.append(m)

    # Replace spans from right to left to preserve offsets
    result = text
    for m in sorted(kept, key=lambda x: x.start, reverse=True):
        value = text[m.start : m.end]
        token = vault.tokenize(
            workspace_id=workspace_id,
            entity_type=body.entity_type or m.data_class,
            value=value,
            classification=m.data_class,
            actor=f"ws:{workspace_id}",
        )
        result = result[: m.start] + token + result[m.end :]

    return TokenizeResponse(tokenized_text=result)


@router.post("/detokenize", response_model=DetokenizeResponse)
async def detokenize_text(
    body: DetokenizeRequest,
    ws: Workspace = Depends(get_current_workspace),
) -> DetokenizeResponse:
    """Detokenize vault tokens in ``text`` back to their original values.

    Restricted to **workspace API keys** (not agent keys): detokenization
    reveals plaintext PII, so individual agents/n8n nodes cannot invoke it
    directly. Requires ``purpose`` for the audit trail of each look-up.
    """
    import re

    vault = _get_vault()
    workspace_id = str(ws.id)
    text = body.text

    # Find all vault tokens in the text
    token_pattern = re.compile(r"tok_[a-zA-Z0-9_]+_[A-Za-z0-9_-]{16,}")
    result = text

    for match in reversed(list(token_pattern.finditer(text))):
        token = match.group(0)
        try:
            original = vault.detokenize(
                workspace_id=workspace_id,
                token=token,
                actor=f"ws:{workspace_id}",
                purpose=body.purpose,
            )
            result = result[: match.start()] + original + result[match.end() :]
        except KeyError:
            # Unknown or expired token — leave it in place
            pass

    return DetokenizeResponse(text=result)
