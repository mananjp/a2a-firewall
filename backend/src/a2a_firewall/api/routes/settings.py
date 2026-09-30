"""Settings endpoints for workspace configuration, including BYOK LLM provider management."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace_flexible
from a2a_firewall.core.byok_crypto import decrypt_api_key, encrypt_api_key, mask_api_key
from a2a_firewall.core.provider_adapters import (
    DEFAULT_MODEL,
    ProviderConfig,
    build_adapter,
)
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Workspace, WorkspaceLLMConfig

router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class LLMConfigResponse(BaseModel):
    provider: str
    model: str | None = None
    base_url: str | None = None
    llm_enabled: bool = True
    has_api_key: bool = False
    masked_api_key: str | None = None
    timeout_seconds: float = 5.0
    cache_enabled: bool = True


class UpdateLLMConfigRequest(BaseModel):
    provider: str = Field("groq", description="groq | openai | anthropic | local | ollama")
    model: str | None = Field(None, description="Model identifier e.g. llama-guard-3-8b, gpt-4o-mini")
    base_url: str | None = Field(None, description="Custom base URL for local/custom endpoints")
    api_key: str | None = Field(None, description="Raw API key (will be encrypted at rest)")
    llm_enabled: bool = Field(True, description="Enable or disable Layer 4 semantic inspection")
    timeout_seconds: float = Field(5.0, ge=0.5, le=60.0)
    cache_enabled: bool = Field(True, description="Enable response caching")


class TestLLMConfigRequest(BaseModel):
    provider: str | None = None
    model: str | None = None
    base_url: str | None = None
    api_key: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/llm", response_model=LLMConfigResponse)
async def get_llm_config(
    workspace: Workspace = Depends(get_current_workspace_flexible),
    db: AsyncSession = Depends(get_db),
) -> LLMConfigResponse:
    """Retrieve the current BYOK LLM provider configuration for the workspace."""
    result = await db.execute(
        select(WorkspaceLLMConfig).where(WorkspaceLLMConfig.workspace_id == workspace.id)
    )
    cfg = result.scalar_one_or_none()
    if not cfg:
        return LLMConfigResponse(
            provider="groq",
            model="llama-guard-3-8b",
            base_url=None,
            llm_enabled=True,
            has_api_key=False,
            masked_api_key=None,
            timeout_seconds=5.0,
            cache_enabled=True,
        )

    masked = None
    has_key = False
    if cfg.api_key_encrypted:
        try:
            raw = decrypt_api_key(cfg.api_key_encrypted)
            masked = mask_api_key(raw)
            has_key = bool(raw)
        except Exception:
            masked = "••••••••"
            has_key = True

    return LLMConfigResponse(
        provider=cfg.provider or "groq",
        model=cfg.model,
        base_url=cfg.base_url,
        llm_enabled=cfg.llm_enabled,
        has_api_key=has_key,
        masked_api_key=masked,
        timeout_seconds=cfg.timeout_seconds,
        cache_enabled=cfg.cache_enabled,
    )


@router.post("/llm")
async def update_llm_config(
    body: UpdateLLMConfigRequest,
    workspace: Workspace = Depends(get_current_workspace_flexible),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Configure or update the workspace's Bring-Your-Own-Key LLM provider."""
    result = await db.execute(
        select(WorkspaceLLMConfig).where(WorkspaceLLMConfig.workspace_id == workspace.id)
    )
    cfg = result.scalar_one_or_none()

    encrypted_key = None
    if body.api_key is not None:
        clean_key = body.api_key.strip()
        encrypted_key = encrypt_api_key(clean_key) if clean_key else None

    if not cfg:
        cfg = WorkspaceLLMConfig(
            workspace_id=workspace.id,
            provider=body.provider.strip().lower(),
            model=body.model.strip() if body.model else None,
            base_url=body.base_url.strip() if body.base_url else None,
            api_key_encrypted=encrypted_key,
            llm_enabled=body.llm_enabled,
            timeout_seconds=body.timeout_seconds,
            cache_enabled=body.cache_enabled,
        )
        db.add(cfg)
    else:
        cfg.provider = body.provider.strip().lower()
        if body.model is not None:
            cfg.model = body.model.strip() if body.model else None
        if body.base_url is not None:
            cfg.base_url = body.base_url.strip() if body.base_url else None
        if body.api_key is not None:
            cfg.api_key_encrypted = encrypted_key
        cfg.llm_enabled = body.llm_enabled
        cfg.timeout_seconds = body.timeout_seconds
        cfg.cache_enabled = body.cache_enabled

    await db.commit()
    await db.refresh(cfg)

    return {
        "status": "saved",
        "message": f"LLM provider updated to {cfg.provider}.",
        "provider": cfg.provider,
        "model": cfg.model,
        "llm_enabled": cfg.llm_enabled,
    }


@router.post("/llm/test")
async def test_llm_connection(
    body: TestLLMConfigRequest | None = None,
    workspace: Workspace = Depends(get_current_workspace_flexible),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Test LLM provider connectivity with a lightweight ping verification."""
    result = await db.execute(
        select(WorkspaceLLMConfig).where(WorkspaceLLMConfig.workspace_id == workspace.id)
    )
    saved_cfg = result.scalar_one_or_none()

    # Determine connection parameters (payload takes precedence over saved config)
    provider = (
        (body and body.provider)
        or (saved_cfg and saved_cfg.provider)
        or "groq"
    ).strip().lower()

    base_url = (body and body.base_url) or (saved_cfg and saved_cfg.base_url) or ""
    model = (body and body.model) or (saved_cfg and saved_cfg.model)

    raw_key = ""
    if body and body.api_key:
        raw_key = body.api_key.strip()
    elif saved_cfg and saved_cfg.api_key_encrypted:
        try:
            raw_key = decrypt_api_key(saved_cfg.api_key_encrypted)
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to decrypt stored API key.") from None


    if not raw_key and provider not in ("local", "ollama"):
        raise HTTPException(
            status_code=400,
            detail="No API key provided or configured for this LLM provider.",
        )

    # Build adapter and send test completion
    start = time.monotonic()
    adapter = build_adapter(
        provider,
        ProviderConfig(
            api_key=raw_key,
            model=model,
            base_url=base_url,
            timeout_seconds=5.0,
        ),
    )

    test_model = model or (
        "llama-guard-3-8b"
        if provider == "groq"
        else ("gpt-4o-mini" if provider == "openai" else DEFAULT_MODEL)
    )

    try:
        call_res = await adapter.chat(
            messages=[{"role": "user", "content": "Respond with the word 'ready'."}],
            model=test_model,
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        return {
            "status": "success",
            "provider": provider,
            "model": call_res.model or test_model,
            "latency_ms": latency_ms,
            "message": "LLM connection verified. Semantic analysis is active.",
        }
    except Exception as e:
        latency_ms = int((time.monotonic() - start) * 1000)
        return {
            "status": "error",
            "provider": provider,
            "model": test_model,
            "latency_ms": latency_ms,
            "message": f"Connection test failed: {str(e)[:150]}",
        }
    finally:
        await adapter.aclose()


@router.delete("/llm")
async def delete_llm_config(
    workspace: Workspace = Depends(get_current_workspace_flexible),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Remove workspace LLM credentials (falls back to 5-layer deterministic protection)."""
    result = await db.execute(
        select(WorkspaceLLMConfig).where(WorkspaceLLMConfig.workspace_id == workspace.id)
    )
    cfg = result.scalar_one_or_none()
    if cfg:
        await db.delete(cfg)
        await db.commit()

    return {
        "status": "removed",
        "message": "LLM credentials removed. Workspace will use 5-layer deterministic protection.",
    }
