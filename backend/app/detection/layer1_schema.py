import jsonschema
from sqlalchemy import select
from app.db.models import TaskSchema

async def validate_schema(request_data, workspace, db):
    violations = []
    task_type = request_data.get("task_type")
    version = request_data.get("schema_version", "v1")
    result = await db.execute(
        select(TaskSchema).where(
            TaskSchema.workspace_id == workspace.id,
            TaskSchema.task_type == task_type,
            TaskSchema.version == version,
            TaskSchema.is_active == True
        )
    )
    schema_row = result.scalar_one_or_none()
    if not schema_row:
        return {"violations": []}  # no schema registered = pass through
    try:
        jsonschema.validate(instance=request_data["payload"], schema=schema_row.json_schema)
    except jsonschema.ValidationError as e:
        violations.append({"layer": "schema", "violation_type": "schema_validation_failed",
                            "severity": "high", "details": {"message": e.message}})
    return {"violations": violations}
