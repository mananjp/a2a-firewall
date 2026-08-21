"""IDS/IPS routes — signature management, mode configuration, reinstate."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Agent, Workspace
from a2a_firewall.detection.ips_signatures import get_engine, get_violation_counter

router = APIRouter()


@router.get("/signatures")
async def list_signatures(
    ws: Workspace = Depends(get_current_workspace),
) -> list[dict[str, Any]]:
    """Return the loaded IPS signature database with hit counts."""
    engine = get_engine()
    return engine.get_stats()


@router.get("/mode")
async def get_ips_mode(
    ws: Workspace = Depends(get_current_workspace),
) -> dict[str, Any]:
    """Return the current IPS action mode for the workspace."""
    return {
        "ips_mode": ws.ips_mode or "block",
        "modes_available": ["monitor", "block", "block_and_suspend"],
        "descriptions": {
            "monitor": "Log only — detect but do not block (IDS mode)",
            "block": "Block threats but do not auto-suspend agents",
            "block_and_suspend": "Full IPS — block and auto-suspend repeat offenders",
        },
    }


class IPSModeUpdate(BaseModel):
    ips_mode: str


@router.patch("/mode")
async def set_ips_mode(
    body: IPSModeUpdate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Update the IPS action mode for the workspace."""
    valid_modes = {"monitor", "block", "block_and_suspend"}
    if body.ips_mode not in valid_modes:
        raise HTTPException(400, f"Invalid IPS mode. Must be one of: {', '.join(valid_modes)}")

    ws.ips_mode = body.ips_mode  # type: ignore[assignment]
    await db.commit()
    await db.refresh(ws)
    return {"ips_mode": ws.ips_mode}


@router.post("/agents/{agent_id}/reinstate")
async def reinstate_agent(
    agent_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Admin-only action to lift an auto-suspension and reset violation counters.

    Logged as an audit event.
    """
    result = await db.execute(
        select(Agent).where(Agent.id == uuid.UUID(agent_id), Agent.workspace_id == ws.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agent not found")

    if agent.status != "suspended":
        raise HTTPException(400, "Agent is not suspended")

    agent.status = "active"  # type: ignore[assignment]

    # Reset violation counter
    counter = get_violation_counter()
    counter.reset(str(agent.id))

    await db.commit()
    return {
        "id": str(agent.id),
        "name": agent.name,
        "status": agent.status,
        "message": "Agent reinstated. Violation counters reset.",
    }


@router.get("/agents/{agent_id}/violation-counts")
async def get_agent_violation_counts(
    agent_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return current violation window counts for an agent."""
    result = await db.execute(
        select(Agent).where(Agent.id == uuid.UUID(agent_id), Agent.workspace_id == ws.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Agent not found")

    counter = get_violation_counter()
    counts = counter.get_counts(agent_id)
    return {
        "agent_id": agent_id,
        **counts,
        "auto_suspend_threshold": counter.critical_threshold,
        "window_seconds": counter.window_seconds,
    }
