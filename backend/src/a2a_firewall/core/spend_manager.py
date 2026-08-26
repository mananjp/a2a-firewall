"""Spend limit and cost governance engine.

Calculates estimated token usage & financial costs for inspections and LLM calls,
enforces org-level and agent-level monthly budgets and token caps, and records immutable spend ledgers.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.db.models import AgentSpendLimit, SpendLedger, WorkspaceSpendLimit

# Default cost estimates ($ per 1M tokens) for known models
MODEL_COST_PER_MILLION_TOKENS: dict[str, float] = {
    "openai/gpt-oss-120b": 0.59,
    "llama-3.3-70b-versatile": 0.59,
    "llama-3.1-8b-instant": 0.05,
    "mixtral-8x7b-32768": 0.24,
    "default": 0.50,
}


def estimate_tokens(payload: dict[str, Any] | str) -> int:
    """Rough heuristic estimate of tokens from payload (~4 chars per token + base framing)."""
    if isinstance(payload, str):
        char_count = len(payload)
    else:
        import json
        char_count = len(json.dumps(payload))
    return max(16, math.ceil(char_count / 4.0) + 12)


def calculate_cost_usd(tokens: int, model_name: str | None = None) -> float:
    """Calculate cost in USD based on tokens used and model rate."""
    model_key = (model_name or "default").lower()
    rate = MODEL_COST_PER_MILLION_TOKENS.get(model_key, MODEL_COST_PER_MILLION_TOKENS["default"])
    return round((tokens / 1_000_000.0) * rate, 6)


async def get_or_create_workspace_spend_limit(
    workspace_id: uuid.UUID, db: AsyncSession
) -> WorkspaceSpendLimit:
    """Retrieve or initialize default workspace spend limits."""
    stmt = select(WorkspaceSpendLimit).where(WorkspaceSpendLimit.workspace_id == workspace_id)
    res = await db.execute(stmt)
    ws_limit = res.scalar_one_or_none()

    if ws_limit is None:
        ws_limit = WorkspaceSpendLimit(
            workspace_id=workspace_id,
            monthly_budget_usd=1000.0,
            token_budget=10_000_000,
            current_spend_usd=0.0,
            current_tokens=0,
            hard_limit_action="block",
            alert_threshold_pct=80.0,
            reset_day_of_month=1,
            last_reset_at=datetime.utcnow(),
        )
        db.add(ws_limit)
        await db.commit()
        await db.refresh(ws_limit)

    return ws_limit


async def check_spend_limits(
    workspace_id: uuid.UUID,
    agent_id: uuid.UUID | None,
    estimated_tokens: int,
    db: AsyncSession,
) -> dict[str, Any]:
    """Verify if the inspection or agent action is allowed under current spend limits."""
    ws_limit = await get_or_create_workspace_spend_limit(workspace_id, db)
    estimated_cost = calculate_cost_usd(estimated_tokens)

    # 1. Check workspace org limit
    is_ws_spend_capped = (ws_limit.current_spend_usd + estimated_cost) > ws_limit.monthly_budget_usd
    is_ws_tokens_capped = (ws_limit.current_tokens + estimated_tokens) > ws_limit.token_budget

    if is_ws_spend_capped or is_ws_tokens_capped:
        if ws_limit.hard_limit_action == "block":
            return {
                "allowed": False,
                "reason": "workspace_spend_limit_exceeded",
                "details": {
                    "monthly_budget_usd": ws_limit.monthly_budget_usd,
                    "current_spend_usd": ws_limit.current_spend_usd,
                    "token_budget": ws_limit.token_budget,
                    "current_tokens": ws_limit.current_tokens,
                    "estimated_cost_usd": estimated_cost,
                    "hard_limit_action": ws_limit.hard_limit_action,
                },
            }

    # 2. Check per-agent limit if agent_id is provided
    if agent_id:
        agent_stmt = select(AgentSpendLimit).where(
            AgentSpendLimit.agent_id == agent_id,
            AgentSpendLimit.is_active == True,
        )
        agent_res = await db.execute(agent_stmt)
        ag_limit = agent_res.scalar_one_or_none()

        if ag_limit:
            is_ag_spend_capped = (ag_limit.current_spend_usd + estimated_cost) > ag_limit.monthly_budget_usd
            is_ag_tokens_capped = (ag_limit.current_tokens + estimated_tokens) > ag_limit.token_budget

            if is_ag_spend_capped or is_ag_tokens_capped:
                return {
                    "allowed": False,
                    "reason": "agent_spend_limit_exceeded",
                    "details": {
                        "agent_monthly_budget_usd": ag_limit.monthly_budget_usd,
                        "agent_current_spend_usd": ag_limit.current_spend_usd,
                        "agent_token_budget": ag_limit.token_budget,
                        "agent_current_tokens": ag_limit.current_tokens,
                    },
                }

    # Check alert threshold
    spend_pct = (ws_limit.current_spend_usd / max(1.0, ws_limit.monthly_budget_usd)) * 100.0
    alert_triggered = spend_pct >= ws_limit.alert_threshold_pct

    return {
        "allowed": True,
        "alert_triggered": alert_triggered,
        "current_spend_usd": ws_limit.current_spend_usd,
        "monthly_budget_usd": ws_limit.monthly_budget_usd,
        "spend_percentage": round(spend_pct, 2),
    }


async def record_spend_transaction(
    workspace_id: uuid.UUID,
    agent_id: uuid.UUID | None,
    task_id: uuid.UUID | None,
    tokens: int,
    model_name: str | None,
    operation: str,
    db: AsyncSession,
) -> SpendLedger:
    """Record consumption into SpendLedger and update current workspace & agent spend totals."""
    cost = calculate_cost_usd(tokens, model_name)

    # 1. Update workspace totals
    ws_limit = await get_or_create_workspace_spend_limit(workspace_id, db)
    ws_limit.current_spend_usd = float(ws_limit.current_spend_usd or 0.0) + cost
    ws_limit.current_tokens = int(ws_limit.current_tokens or 0) + tokens
    ws_limit.updated_at = datetime.utcnow()

    # 2. Update agent totals if configured
    if agent_id:
        agent_stmt = select(AgentSpendLimit).where(AgentSpendLimit.agent_id == agent_id)
        agent_res = await db.execute(agent_stmt)
        ag_limit = agent_res.scalar_one_or_none()
        if ag_limit:
            ag_limit.current_spend_usd = float(ag_limit.current_spend_usd or 0.0) + cost
            ag_limit.current_tokens = int(ag_limit.current_tokens or 0) + tokens
            ag_limit.updated_at = datetime.utcnow()

    # 3. Write immutable ledger entry
    ledger = SpendLedger(
        workspace_id=workspace_id,
        agent_id=agent_id,
        task_id=task_id,
        tokens_used=tokens,
        cost_usd=cost,
        model_name=model_name,
        operation=operation,
        created_at=datetime.utcnow(),
    )
    db.add(ledger)
    await db.commit()
    await db.refresh(ledger)
    return ledger
