"""Spend limit and cost governance routes."""

from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.core.audit_logger import log_audit_event
from a2a_firewall.core.spend_manager import (
    MODEL_COST_PER_MILLION_TOKENS,
    get_or_create_workspace_spend_limit,
)
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Agent, AgentSpendLimit, SpendLedger, Workspace, WorkspaceSpendLimit

router = APIRouter()


class WorkspaceSpendUpdate(BaseModel):
    monthly_budget_usd: float | None = Field(None, ge=0.0)
    token_budget: int | None = Field(None, ge=0)
    hard_limit_action: str | None = Field(None, description="block or warn")
    alert_threshold_pct: float | None = Field(None, ge=1.0, le=100.0)
    reset_day_of_month: int | None = Field(None, ge=1, le=28)


class AgentSpendUpdate(BaseModel):
    monthly_budget_usd: float = Field(..., ge=0.0)
    token_budget: int = Field(..., ge=0)
    is_active: bool = True


@router.get("/overview")
async def get_spend_overview(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get high-level workspace budget status, utilization percentages, and top spenders."""
    limit = await get_or_create_workspace_spend_limit(ws.id, db)

    spend_pct = (limit.current_spend_usd / max(0.01, limit.monthly_budget_usd)) * 100.0
    token_pct = (limit.current_tokens / max(1, limit.token_budget)) * 100.0

    # Top spending agents
    agent_limits_res = await db.execute(
        select(AgentSpendLimit, Agent)
        .join(Agent, AgentSpendLimit.agent_id == Agent.id)
        .where(AgentSpendLimit.workspace_id == ws.id)
        .order_by(AgentSpendLimit.current_spend_usd.desc())
        .limit(10)
    )
    top_agents = [
        {
            "agent_id": str(ag_lim.agent_id),
            "agent_name": ag.name,
            "current_spend_usd": ag_lim.current_spend_usd,
            "monthly_budget_usd": ag_lim.monthly_budget_usd,
            "current_tokens": ag_lim.current_tokens,
            "token_budget": ag_lim.token_budget,
            "is_active": ag_lim.is_active,
            "spend_pct": round((ag_lim.current_spend_usd / max(0.01, ag_lim.monthly_budget_usd)) * 100.0, 1),
        }
        for ag_lim, ag in agent_limits_res.all()
    ]

    return {
        "workspace_id": str(ws.id),
        "monthly_budget_usd": limit.monthly_budget_usd,
        "current_spend_usd": round(limit.current_spend_usd, 4),
        "spend_percentage": round(spend_pct, 2),
        "token_budget": limit.token_budget,
        "current_tokens": limit.current_tokens,
        "token_percentage": round(token_pct, 2),
        "hard_limit_action": limit.hard_limit_action,
        "alert_threshold_pct": limit.alert_threshold_pct,
        "alert_triggered": spend_pct >= limit.alert_threshold_pct,
        "pricing_rates_per_million": MODEL_COST_PER_MILLION_TOKENS,
        "top_spending_agents": top_agents,
        "last_reset_at": limit.last_reset_at.isoformat() if limit.last_reset_at else None,
    }


@router.patch("/workspace")
async def update_workspace_spend(
    body: WorkspaceSpendUpdate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Update org-wide monthly budgets and spend limits."""
    limit = await get_or_create_workspace_spend_limit(ws.id, db)
    before_state = {
        "monthly_budget_usd": limit.monthly_budget_usd,
        "token_budget": limit.token_budget,
        "hard_limit_action": limit.hard_limit_action,
        "alert_threshold_pct": limit.alert_threshold_pct,
    }

    if body.monthly_budget_usd is not None:
        limit.monthly_budget_usd = body.monthly_budget_usd
    if body.token_budget is not None:
        limit.token_budget = body.token_budget
    if body.hard_limit_action is not None:
        if body.hard_limit_action not in ("block", "warn"):
            raise HTTPException(400, "hard_limit_action must be 'block' or 'warn'")
        limit.hard_limit_action = body.hard_limit_action
    if body.alert_threshold_pct is not None:
        limit.alert_threshold_pct = body.alert_threshold_pct
    if body.reset_day_of_month is not None:
        limit.reset_day_of_month = body.reset_day_of_month

    limit.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(limit)

    await log_audit_event(
        workspace_id=ws.id,
        action="spend.workspace_limit_updated",
        entity_type="spend_limit",
        entity_id=str(limit.id),
        actor_email=ws.admin_email,
        description=f"Updated workspace spend limits: budget=${limit.monthly_budget_usd}, action={limit.hard_limit_action}",
        diff={"before": before_state, "after": body.model_dump(exclude_unset=True)},
        db=db,
    )

    return {
        "workspace_id": str(ws.id),
        "monthly_budget_usd": limit.monthly_budget_usd,
        "token_budget": limit.token_budget,
        "hard_limit_action": limit.hard_limit_action,
        "alert_threshold_pct": limit.alert_threshold_pct,
        "reset_day_of_month": limit.reset_day_of_month,
    }


@router.get("/agents")
async def list_agent_spend_limits(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all agents in workspace with their assigned spend limits and consumption."""
    # Get all agents
    agents_res = await db.execute(select(Agent).where(Agent.workspace_id == ws.id).order_by(Agent.name))
    agents = agents_res.scalars().all()

    # Get limits map
    limits_res = await db.execute(select(AgentSpendLimit).where(AgentSpendLimit.workspace_id == ws.id))
    limits_map = {lim.agent_id: lim for lim in limits_res.scalars().all()}

    result = []
    for ag in agents:
        lim = limits_map.get(ag.id)
        result.append({
            "agent_id": str(ag.id),
            "agent_name": ag.name,
            "status": ag.status,
            "monthly_budget_usd": lim.monthly_budget_usd if lim else 100.0,
            "token_budget": lim.token_budget if lim else 1000000,
            "current_spend_usd": round(lim.current_spend_usd, 4) if lim else 0.0,
            "current_tokens": lim.current_tokens if lim else 0,
            "is_active": lim.is_active if lim else True,
            "has_custom_limit": lim is not None,
        })
    return result


@router.put("/agents/{agent_id}")
async def set_agent_spend_limit(
    agent_id: str,
    body: AgentSpendUpdate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Set or update spend budget and token cap for a specific agent."""
    try:
        agent_uuid = uuid.UUID(agent_id)
    except ValueError as e:
        raise HTTPException(400, "Invalid agent_id UUID format") from e

    ag_res = await db.execute(select(Agent).where(Agent.id == agent_uuid, Agent.workspace_id == ws.id))
    ag = ag_res.scalar_one_or_none()
    if not ag:
        raise HTTPException(404, "Agent not found in authenticated workspace")

    lim_res = await db.execute(select(AgentSpendLimit).where(AgentSpendLimit.agent_id == agent_uuid))
    lim = lim_res.scalar_one_or_none()

    if lim is None:
        lim = AgentSpendLimit(
            agent_id=agent_uuid,
            workspace_id=ws.id,
            monthly_budget_usd=body.monthly_budget_usd,
            token_budget=body.token_budget,
            is_active=body.is_active,
        )
        db.add(lim)
    else:
        lim.monthly_budget_usd = body.monthly_budget_usd
        lim.token_budget = body.token_budget
        lim.is_active = body.is_active
        lim.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(lim)

    await log_audit_event(
        workspace_id=ws.id,
        action="spend.agent_limit_updated",
        entity_type="agent_spend_limit",
        entity_id=str(lim.id),
        actor_email=ws.admin_email,
        description=f"Set spend limit for agent '{ag.name}': budget=${lim.monthly_budget_usd}",
        diff={"monthly_budget_usd": lim.monthly_budget_usd, "token_budget": lim.token_budget},
        db=db,
    )

    return {
        "agent_id": str(agent_uuid),
        "agent_name": ag.name,
        "monthly_budget_usd": lim.monthly_budget_usd,
        "token_budget": lim.token_budget,
        "current_spend_usd": lim.current_spend_usd,
        "current_tokens": lim.current_tokens,
        "is_active": lim.is_active,
    }


@router.get("/ledger")
async def list_spend_ledger(
    agent_id: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    format: str = Query("json", description="json or csv"),
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Query immutable spend transactions ledger with CSV and JSON exports."""
    stmt = (
        select(SpendLedger, Agent)
        .outerjoin(Agent, SpendLedger.agent_id == Agent.id)
        .where(SpendLedger.workspace_id == ws.id)
        .order_by(desc(SpendLedger.created_at))
        .limit(limit)
    )
    if agent_id:
        try:
            stmt = stmt.where(SpendLedger.agent_id == uuid.UUID(agent_id))
        except ValueError:
            pass

    res = await db.execute(stmt)
    rows = res.all()

    items = [
        {
            "id": str(ledger.id),
            "task_id": str(ledger.task_id) if ledger.task_id else None,
            "agent_id": str(ledger.agent_id) if ledger.agent_id else None,
            "agent_name": ag.name if ag else "Workspace / Direct",
            "tokens_used": ledger.tokens_used,
            "cost_usd": ledger.cost_usd,
            "model_name": ledger.model_name or "default",
            "operation": ledger.operation,
            "created_at": ledger.created_at.isoformat() if ledger.created_at else None,
        }
        for ledger, ag in rows
    ]

    if format.lower() == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=["id", "created_at", "agent_name", "tokens_used", "cost_usd", "model_name", "operation", "task_id"],
        )
        writer.writeheader()
        for it in items:
            writer.writerow(it)

        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=spend_ledger_{ws.id}.csv"},
        )

    return {
        "workspace_id": str(ws.id),
        "count": len(items),
        "transactions": items,
    }
