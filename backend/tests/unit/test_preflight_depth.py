"""Unit tests for Layer 0 preflight delegation-depth enforcement."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from a2a_firewall.core.config import settings
from a2a_firewall.detection.layer0_preflight import preflight


def _base_request(depth: int) -> dict:
    return {
        "task_id": "00000000-0000-0000-0000-000000000001",
        "receiver_agent_id": "00000000-0000-0000-0000-000000000002",
        "depth": depth,
    }


def _mock_db_no_cached_task() -> AsyncMock:
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result
    return db


@pytest.mark.asyncio
async def test_depth_within_limit_passes(monkeypatch):
    monkeypatch.setattr(settings, "DELEGATION_MAX_DEPTH", 3)
    sender = MagicMock(status="active", id="00000000-0000-0000-0000-000000000001")
    db = _mock_db_no_cached_task()

    result = await preflight(_base_request(depth=2), sender, MagicMock(), 100, db)
    assert result is None


@pytest.mark.asyncio
async def test_depth_over_limit_blocks(monkeypatch):
    monkeypatch.setattr(settings, "DELEGATION_MAX_DEPTH", 3)
    sender = MagicMock(status="active", id="00000000-0000-0000-0000-000000000001")
    db = AsyncMock()

    result = await preflight(_base_request(depth=4), sender, MagicMock(), 100, db)
    assert result is not None
    assert result["block"] is True
    assert result["reason"] == "max_depth_exceeded"
    assert result["violations"][0]["violation_type"] == "max_depth_exceeded"


@pytest.mark.asyncio
async def test_depth_limit_is_config_driven(monkeypatch):
    monkeypatch.setattr(settings, "DELEGATION_MAX_DEPTH", 10)
    sender = MagicMock(status="active", id="00000000-0000-0000-0000-000000000001")
    db = _mock_db_no_cached_task()

    # depth 5 is fine with limit 10
    result = await preflight(_base_request(depth=5), sender, MagicMock(), 100, db)
    assert result is None
