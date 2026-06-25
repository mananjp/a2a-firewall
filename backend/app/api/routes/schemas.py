from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Dict, Any
from app.db.database import get_db
from app.db.models import TaskSchema, Workspace
from app.api.deps import get_current_workspace

router = APIRouter()

class SchemaCreate(BaseModel):
    task_type: str
    version: str = "v1"
    json_schema: Dict[str, Any]

@router.post("")
async def register_schema(
    body: SchemaCreate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    ts = TaskSchema(
        workspace_id=ws.id,
        task_type=body.task_type,
        version=body.version,
        json_schema=body.json_schema
    )
    db.add(ts)
    await db.commit()
    await db.refresh(ts)
    return {"id": str(ts.id), "task_type": ts.task_type, "version": ts.version}

@router.get("")
async def list_schemas(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(TaskSchema).where(TaskSchema.workspace_id == ws.id, TaskSchema.is_active == True))
    schemas = result.scalars().all()
    return [{"id": str(s.id), "task_type": s.task_type, "version": s.version} for s in schemas]
