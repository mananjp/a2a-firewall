from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.core.config import settings
from a2a_firewall.db.models import Task


async def preflight(
    request_data: dict[str, Any],
    sender: Any,
    workspace: Any,
    payload_size: int,
    db: AsyncSession,
) -> dict[str, Any] | None:
    """Layer 0: cheap pre-checks (size, agent status, depth, circular reference, idempotency)."""
    if payload_size > settings.MAX_PAYLOAD_BYTES:
        return {
            "block": True,
            "reason": "payload_too_large",
            "risk_score": 1.0,
            "violations": [
                {
                    "layer": "rule",
                    "violation_type": "payload_too_large",
                    "severity": "high",
                    "details": {"size": payload_size},
                }
            ],
        }
    if sender.status == "suspended":
        return {
            "block": True,
            "reason": "agent_suspended",
            "risk_score": 1.0,
            "violations": [
                {
                    "layer": "rule",
                    "violation_type": "agent_suspended",
                    "severity": "critical",
                    "details": {},
                }
            ],
        }
    depth = request_data.get("depth", 0)
    if depth > 10:
        return {
            "block": True,
            "reason": "max_depth_exceeded",
            "risk_score": 1.0,
            "violations": [
                {
                    "layer": "rule",
                    "violation_type": "max_depth_exceeded",
                    "severity": "high",
                    "details": {"depth": depth},
                }
            ],
        }
    if str(sender.id) == request_data.get("receiver_agent_id"):
        return {
            "block": True,
            "reason": "circular_reference",
            "risk_score": 1.0,
            "violations": [
                {
                    "layer": "rule",
                    "violation_type": "circular_reference",
                    "severity": "high",
                    "details": {},
                }
            ],
        }

    # Idempotency check: if task_id already exists, return cached decision (replay)
    try:
        task_id_uuid = uuid.UUID(request_data["task_id"])
    except (ValueError, TypeError, KeyError):
        return {
            "block": True,
            "reason": "invalid_task_id",
            "risk_score": 1.0,
            "violations": [
                {
                    "layer": "rule",
                    "violation_type": "invalid_task_id",
                    "severity": "high",
                    "details": {},
                }
            ],
        }
    existing = await db.execute(select(Task).where(Task.id == task_id_uuid))
    cached = existing.scalar_one_or_none()
    if cached is not None:
        return {"idempotent_replay": True, "cached_task": cached}

    return None
