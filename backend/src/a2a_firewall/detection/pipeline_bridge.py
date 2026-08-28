"""Bridge from the transparent proxy into the full enterprise detection pipeline.

The proxy's fast built-in gate runs by default (no DB / no Groq / no agents). When
the A2A_INSPECT_ENABLED flag is set, this module maps a normalized AI request into
the enterprise ``run_inspection`` shape and routes it through the full 5-layer
pipeline (identity, delegation, schema, permissions, rules, IPS, PII, CVE, Groq,
decision) with the database and a resolved agent/workspace.

The bridge is fully async so it runs directly inside the proxy's event loop
(no ``asyncio.run`` re-entrancy). Any failure to resolve the enterprise context
(no DB, no agent match, no Groq key) is deliberately non-fatal: the bridge
returns an ``allow`` so the proxy's deterministic built-in gate remains the
authority and the proxy never goes down because the analytical pipeline is
unavailable.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

logger = logging.getLogger("a2a_firewall.detection.bridge")

_ALLOW = {"decision": "allow", "risk_score": 0.0, "violations": []}


async def inspect_from_proxy(req: Any) -> dict[str, Any]:
    """Run the full pipeline for a normalized request, or allow on any outage.

    :param req: a ``NormalizedAIRequest`` (or any object exposing
        ``to_orchestrator_dict(sender_id, receiver_id)``).
    """
    try:
        request_data = _to_enterprise_request(req)
        sender, workspace, session = await _resolve_context()
        try:
            from a2a_firewall.detection.orchestrator import run_inspection

            return await run_inspection(request_data, sender, workspace, session)
        finally:
            await session.close()
    except Exception as e:  # noqa: BLE001
        logger.warning("Full inspect pipeline failed (%s) — allowing built-in gate", e)
        return dict(_ALLOW)


def _to_enterprise_request(req: Any) -> dict[str, Any]:
    """Convert a normalized proxy request into the enterprise request_data dict.

    Prefers the dedicated ``to_orchestrator_dict`` method; falls back to
    attribute reconstruction otherwise.
    """
    sender_id = str(uuid.uuid4())
    receiver_id = str(uuid.uuid4())

    if hasattr(req, "to_orchestrator_dict"):
        base: dict[str, Any] = req.to_orchestrator_dict(
            sender_id=sender_id, receiver_id=receiver_id
        )
        base.setdefault("parent_task_id", None)
        base.setdefault("root_task_id", None)
        base.setdefault("schema_version", "v1")
        base.setdefault("depth", 0)
        base.setdefault("declared_intent", None)
        base.setdefault("parent_span_id", uuid.uuid4().hex)
        return base

    payload = getattr(req, "payload", {}) or {}
    path = getattr(req, "path", "") or "/"
    return {
        "task_id": str(uuid.uuid4()),
        "parent_task_id": None,
        "root_task_id": None,
        "sender_id": sender_id,
        "receiver_agent_id": receiver_id,
        "task_type": getattr(req, "task_type", "proxy_transparent"),
        "schema_version": "v1",
        "payload": payload,
        "resource_type": getattr(req, "resource_type", None),
        "resource_id": getattr(req, "resource_id", None),
        "action": getattr(req, "action", None) or path,
        "declared_intent": None,
        "trace_id": str(uuid.uuid4()),
        "parent_span_id": str(uuid.uuid4()),
        "depth": 0,
    }


async def _resolve_context() -> tuple[Any, Any, Any]:
    """Resolve (agent, workspace, db_session) from the configured database.

    Looks up the first available agent/workspace for transparent traffic. Raises
    if the DB is unavailable or no agent exists, which the caller turns into an
    allow.
    """
    from sqlalchemy import select

    from a2a_firewall.db.database import AsyncSessionLocal
    from a2a_firewall.db.models import Agent, Workspace

    async with AsyncSessionLocal() as session:
        agent_result = await session.execute(select(Agent).limit(1))
        agent = agent_result.scalar_one_or_none()
        if agent is None:
            raise RuntimeError("No agent available for enterprise inspection")
        ws_result = await session.execute(
            select(Workspace).where(Workspace.id == agent.workspace_id)
        )
        workspace = ws_result.scalar_one()
        return agent, workspace, session
