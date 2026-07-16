from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.db.models import AgentPermission, ResourcePermission


async def check_permissions(
    request_data: dict[str, Any], sender: Any, workspace: Any, db: AsyncSession
) -> dict[str, Any]:
    """Layer 2: agent permission check with task-type + resource scoping.

    Resolution order:
    1. Exact match (sender, receiver, task_type) → allowed/blocked.
    2. Wildcard match (sender, receiver, task_type=None) → allowed/blocked.
    3. Resource-level check (agent, resource_type, action) → allowed/blocked.
    4. No match → controlled by workspace.default_deny.
    """
    receiver_id = uuid.UUID(request_data["receiver_agent_id"])
    task_type = request_data.get("task_type")

    # Try exact task_type match first
    if task_type:
        result = await db.execute(
            select(AgentPermission).where(
                AgentPermission.workspace_id == workspace.id,
                AgentPermission.sender_id == sender.id,
                AgentPermission.receiver_id == receiver_id,
                AgentPermission.task_type == task_type,
            )
        )
        perm = result.scalar_one_or_none()
        if perm:
            return {"allowed": perm.allowed, "check": f"task_type:{task_type}"}

    # Fall back to wildcard (task_type=None) match
    result = await db.execute(
        select(AgentPermission).where(
            AgentPermission.workspace_id == workspace.id,
            AgentPermission.sender_id == sender.id,
            AgentPermission.receiver_id == receiver_id,
            AgentPermission.task_type.is_(None),
        )
    )
    perm = result.scalar_one_or_none()
    if perm:
        return {"allowed": perm.allowed, "check": "task_type:wildcard"}

    # Resource-level permission check
    resource_type = request_data.get("resource_type")
    action = request_data.get("action")
    if resource_type and action:
        result = await db.execute(
            select(ResourcePermission).where(
                ResourcePermission.workspace_id == workspace.id,
                ResourcePermission.agent_id == sender.id,
                ResourcePermission.resource_type == resource_type,
                ResourcePermission.action == action,
            )
        )
        rp = result.scalar_one_or_none()
        if rp:
            return {"allowed": rp.allowed, "check": f"resource:{resource_type}:{action}"}

    return {"allowed": not workspace.default_deny, "check": "default_deny"}
