from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import TaskSchema, Workspace

router = APIRouter()


class SchemaCreate(BaseModel):
    task_type: str
    version: str = "v1"
    json_schema: dict[str, Any]


@router.post("")
async def register_schema(
    body: SchemaCreate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    ts = TaskSchema(
        workspace_id=ws.id,
        task_type=body.task_type,
        version=body.version,
        json_schema=body.json_schema,
    )
    db.add(ts)
    await db.commit()
    await db.refresh(ts)
    return {"id": str(ts.id), "task_type": ts.task_type, "version": ts.version}


@router.get("")
async def list_schemas(
    ws: Workspace = Depends(get_current_workspace), db: AsyncSession = Depends(get_db)
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(TaskSchema).where(TaskSchema.workspace_id == ws.id, TaskSchema.is_active.is_(True))
    )
    schemas = result.scalars().all()
    return [{"id": str(s.id), "task_type": s.task_type, "version": s.version} for s in schemas]
