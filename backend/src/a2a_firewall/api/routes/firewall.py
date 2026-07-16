from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_agent
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Agent, Workspace
from a2a_firewall.detection.orchestrator import run_inspection

router = APIRouter()


class InspectRequest(BaseModel):
    task_id: str
    parent_task_id: str | None = None
    root_task_id: str | None = None
    receiver_agent_id: str
    task_type: str
    schema_version: str = "v1"
    payload: dict[str, Any]
    resource_type: str | None = None  # e.g. "account", "payment", "customer_data"
    resource_id: str | None = None  # e.g. "ACC-42", "TX-100"
    action: str | None = None  # e.g. "read", "transfer", "delete", "approve"
    trace_id: str | None = None
    parent_span_id: str | None = None
    sdk_version: str | None = None
    depth: int = 0


@router.post("/inspect")
async def inspect(
    body: InspectRequest,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    ws_result = await db.execute(select(Workspace).where(Workspace.id == agent.workspace_id))
    workspace = ws_result.scalar_one()
    result = await run_inspection(body.model_dump(), agent, workspace, db)
    return result
