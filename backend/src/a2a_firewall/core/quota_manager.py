from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any, TypedDict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.db.models import Account, AccountWorkspace, UsageMeter


class TierLimits(TypedDict):
    """Per-tier entitlements. ``None`` means unlimited."""

    inspections_per_month: int | None
    llm_layer_enabled: bool
    workspaces: int | None
    api_keys: int | None
    members: int | None
    log_retention_days: int
    dlp_vault: bool
    mcp_proxy: bool
    alerts: bool


TIER_LIMITS: dict[str, TierLimits] = {
    "free": {
        "inspections_per_month": 10_000,
        "llm_layer_enabled": False,
        "workspaces": 1,
        "api_keys": 2,
        "members": 1,
        "log_retention_days": 7,
        "dlp_vault": False,
        "mcp_proxy": False,
        "alerts": False,
    },
    "pro": {
        "inspections_per_month": 100_000,
        "llm_layer_enabled": True,
        "workspaces": 3,
        "api_keys": 10,
        "members": 1,
        "log_retention_days": 30,
        "dlp_vault": True,
        "mcp_proxy": True,
        "alerts": False,
    },
    "team": {
        "inspections_per_month": 500_000,
        "llm_layer_enabled": True,
        "workspaces": 10,
        "api_keys": 50,
        "members": 25,
        "log_retention_days": 90,
        "dlp_vault": True,
        "mcp_proxy": True,
        "alerts": True,
    },
    "enterprise": {
        "inspections_per_month": None,  # Unlimited
        "llm_layer_enabled": True,
        "workspaces": None,
        "api_keys": None,
        "members": None,
        "log_retention_days": 365,
        "dlp_vault": True,
        "mcp_proxy": True,
        "alerts": True,
    },
}


async def get_workspace_tier(workspace_id: uuid.UUID, db: AsyncSession) -> str:
    """Resolve the tier of the workspace owner."""
    # Find the owner of this workspace
    stmt = select(Account).join(AccountWorkspace).where(
        AccountWorkspace.workspace_id == workspace_id,
        AccountWorkspace.role == "owner"
    )
    res = await db.execute(stmt)
    owner = res.scalar_one_or_none()
    if owner:
        return owner.tier or "free"
    return "free"


async def get_or_create_usage_meter(workspace_id: uuid.UUID, db: AsyncSession) -> UsageMeter:
    """Retrieve or create the usage meter for the current month."""
    period = datetime.now(UTC).strftime("%Y-%m")

    stmt = select(UsageMeter).where(
        UsageMeter.workspace_id == workspace_id,
        UsageMeter.period == period
    )
    res = await db.execute(stmt)
    meter = res.scalar_one_or_none()

    if not meter:
        tier = await get_workspace_tier(workspace_id, db)
        limits = TIER_LIMITS.get(tier, TIER_LIMITS["free"])

        meter = UsageMeter(
            workspace_id=workspace_id,
            period=period,
            inspections_limit=limits["inspections_per_month"] or 999999999,
            llm_inspections_limit=limits["inspections_per_month"] if limits["llm_layer_enabled"] else 0,
        )
        db.add(meter)
        await db.commit()
        await db.refresh(meter)

    return meter


async def check_tier_quota(workspace_id: uuid.UUID, db: AsyncSession) -> tuple[bool, dict[str, Any]]:
    """Check if the workspace has remaining inspections for the month."""
    meter = await get_or_create_usage_meter(workspace_id, db)

    # Check if we hit the limit
    # For enterprise, inspections_limit could be logically infinite or high
    used = meter.inspections_count or 0
    if meter.inspections_limit and used >= meter.inspections_limit:
        return False, {
            "used": meter.inspections_count,
            "limit": meter.inspections_limit
        }

    return True, {
        "used": meter.inspections_count,
        "limit": meter.inspections_limit
    }


async def record_inspection_usage(
    workspace_id: uuid.UUID,
    llm_called: bool,
    payload_size: int,
    db: AsyncSession
) -> None:
    """Increment the usage counters after an inspection."""
    meter = await get_or_create_usage_meter(workspace_id, db)

    meter.inspections_count += 1
    if llm_called:
        meter.llm_inspections_count += 1
    meter.api_calls_count += 1
    meter.bandwidth_bytes += payload_size
    meter.updated_at = datetime.now(UTC)

    db.add(meter)
    await db.commit()
