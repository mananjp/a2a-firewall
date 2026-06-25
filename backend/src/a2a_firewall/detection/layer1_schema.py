from __future__ import annotations

from typing import Any

import jsonschema
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.db.models import TaskSchema


async def validate_schema(
    request_data: dict[str, Any], workspace: Any, db: AsyncSession
) -> dict[str, Any]:
    violations: list[dict[str, Any]] = []
    task_type = request_data.get("task_type")
    version = request_data.get("schema_version", "v1")
    result = await db.execute(
        select(TaskSchema).where(
            TaskSchema.workspace_id == workspace.id,
            TaskSchema.task_type == task_type,
            TaskSchema.version == version,
            TaskSchema.is_active.is_(True),
        )
    )
    schema_row = result.scalar_one_or_none()
    if not schema_row:
        return {"violations": violations}  # no schema registered = pass through
    try:
        jsonschema.validate(instance=request_data["payload"], schema=schema_row.json_schema)
    except jsonschema.ValidationError as e:
        violations.append(
            {
                "layer": "schema",
                "violation_type": "schema_validation_failed",
                "severity": "high",
                "details": {"message": e.message},
            }
        )
    return {"violations": violations}
