from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, Dict, Any
from app.db.database import get_db
from app.db.models import Agent, Workspace
from app.api.deps import get_current_agent
from app.detection.orchestrator import run_inspection

router = APIRouter()

class InspectRequest(BaseModel):
    task_id: str
    parent_task_id: Optional[str] = None
    root_task_id: Optional[str] = None
    receiver_agent_id: str
    task_type: str
    schema_version: str = "v1"
    payload: Dict[str, Any]
    trace_id: Optional[str] = None
    parent_span_id: Optional[str] = None
    sdk_version: Optional[str] = None
    depth: int = 0

@router.post("/inspect")
async def inspect(
    body: InspectRequest,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db)
):
    ws_result = await db.execute(select(Workspace).where(Workspace.id == agent.workspace_id))
    workspace = ws_result.scalar_one()
    result = await run_inspection(body.model_dump(), agent, workspace, db)
    return result
