from sqlalchemy import select
from app.db.models import AgentPermission
import uuid

async def check_permissions(request_data, sender, workspace, db):
    receiver_id = uuid.UUID(request_data["receiver_agent_id"])
    result = await db.execute(
        select(AgentPermission).where(
            AgentPermission.workspace_id == workspace.id,
            AgentPermission.sender_id == sender.id,
            AgentPermission.receiver_id == receiver_id
        )
    )
    perm = result.scalar_one_or_none()
    if perm:
        return {"allowed": perm.allowed}
    return {"allowed": True}  # default allow if no explicit rule
