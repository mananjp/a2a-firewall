"""Enterprise Audit Logger.

Emits structured, immutable audit log events for administrative changes,
security policy updates, spend threshold configurations, network rule alterations, and user lifecycle events.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.db.models import AuditLog

logger = logging.getLogger(__name__)


async def log_audit_event(
    workspace_id: uuid.UUID,
    action: str,
    entity_type: str,
    actor_email: str = "admin@system.local",
    actor_id: str | None = None,
    actor_type: str = "user",
    entity_id: str | None = None,
    description: str | None = None,
    diff: dict[str, Any] | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    status: str = "success",
    db: AsyncSession | None = None,
) -> AuditLog | None:
    """Create and persist an enterprise audit log entry."""
    if db is None:
        return None

    try:
        audit_entry = AuditLog(
            workspace_id=workspace_id,
            actor_id=actor_id,
            actor_email=actor_email,
            actor_type=actor_type,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            description=description,
            diff=diff or {},
            ip_address=ip_address,
            user_agent=user_agent,
            status=status,
            created_at=datetime.utcnow(),
        )
        db.add(audit_entry)
        await db.commit()
        await db.refresh(audit_entry)
        return audit_entry
    except Exception as e:
        logger.error("Failed to write enterprise audit log: %s", e)
        return None
