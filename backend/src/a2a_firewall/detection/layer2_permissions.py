from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.db.models import AgentPermission


async def check_permissions(
    request_data: dict[str, Any], sender: Any, workspace: Any, db: AsyncSession
) -> dict[str, Any]:
    """Layer 2: agent permission check.

    Behavior controlled by workspace.default_deny:
    - default_deny=True: any unregistered sender->receiver pair is blocked (whitelist).
    - default_deny=False: any unregistered pair is allowed (legacy).
    """
    receiver_id = uuid.UUID(request_data["receiver_agent_id"])
    result = await db.execute(
        select(AgentPermission).where(
            AgentPermission.workspace_id == workspace.id,
            AgentPermission.sender_id == sender.id,
            AgentPermission.receiver_id == receiver_id,
        )
    )
    perm = result.scalar_one_or_none()
    if perm:
        return {"allowed": perm.allowed}
    return {"allowed": not workspace.default_deny}
