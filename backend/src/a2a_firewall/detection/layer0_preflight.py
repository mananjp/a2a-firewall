from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.core.anti_pentest import check_anti_pentest
from a2a_firewall.core.config import settings
from a2a_firewall.db.models import Task

# Nonce store for replay protection: (sender_id, nonce) -> expiry_timestamp
#
# In-memory module-level dict. Safe for single-process deployments
# (uvicorn --workers 1 / Docker single replica). With multiple worker
# processes the store is per-process, so a replay split across workers will
# not be detected; move this to Redis (or a DB-backed store) before scaling
# horizontally. Idempotent task_id replay above is DB-backed and therefore
# already safe across workers.
_SEEN_NONCES: dict[tuple[str, str], float] = {}


async def preflight(
    request_data: dict[str, Any],
    sender: Any,
    workspace: Any,
    payload_size: int,
    db: AsyncSession,
) -> dict[str, Any] | None:
    """Layer 0: cheap pre-checks (size, agent status, depth, circular reference, canary trap, idempotency)."""
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
    if depth > settings.DELEGATION_MAX_DEPTH:
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

    # Anti-pentest canary & quarantine check
    import json

    sender_id_str = str(getattr(sender, "id", "unknown"))
    payload_str = json.dumps(request_data.get("payload", {})).lower()
    pentest_check = check_anti_pentest(request_data, sender_id_str, payload_str)
    if pentest_check.get("block") and any(
        v.get("violation_type") in ("canary_trap_triggered", "agent_in_quarantine")
        for v in pentest_check.get("violations", [])
    ):
        return {
            "block": True,
            "reason": pentest_check.get("reason", "agentic_pentest_blocked"),
            "risk_score": 1.0,
            "violations": pentest_check.get("violations", []),
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

    # Stale timestamp protection (part2 1.3.2)
    import time
    from datetime import datetime

    now = time.time()
    raw_ts = request_data.get("timestamp")
    if raw_ts is not None:
        ts_val: float | None = None
        if isinstance(raw_ts, (int, float)):
            ts_val = float(raw_ts) / 1000.0 if raw_ts > 1e11 else float(raw_ts)
        elif isinstance(raw_ts, str):
            try:
                val = float(raw_ts)
                ts_val = val / 1000.0 if val > 1e11 else val
            except ValueError:
                try:
                    dt = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                    ts_val = dt.timestamp()
                except Exception:
                    pass
        if ts_val is not None and abs(now - ts_val) > 300:
            return {
                "block": True,
                "reason": "stale_request",
                "risk_score": 1.0,
                "violations": [
                    {
                        "layer": "rule",
                        "violation_type": "stale_request",
                        "severity": "high",
                        "details": {"timestamp": raw_ts, "delta_seconds": abs(now - ts_val)},
                    }
                ],
            }

    # Nonce replay protection (part2 1.3.2)
    nonce = request_data.get("nonce")
    if nonce:
        expired_keys = [k for k, exp in _SEEN_NONCES.items() if exp < now]
        for k in expired_keys:
            _SEEN_NONCES.pop(k, None)

        sender_key = (sender_id_str, str(nonce))
        if sender_key in _SEEN_NONCES:
            return {
                "block": True,
                "reason": "nonce_replayed",
                "risk_score": 1.0,
                "violations": [
                    {
                        "layer": "rule",
                        "violation_type": "nonce_replayed",
                        "severity": "high",
                        "details": {"nonce": str(nonce)},
                    }
                ],
            }
        _SEEN_NONCES[sender_key] = now + 600.0

    return None
