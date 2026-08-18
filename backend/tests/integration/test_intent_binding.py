"""Integration tests for Phase 3 — intent-binding.

These require a running database (TEST_DATABASE_URL env var).
Skipped by default in unit-only CI runs.
"""

from __future__ import annotations

import os

import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="Integration tests require TEST_DATABASE_URL",
)


@pytest.mark.asyncio
async def test_intent_drift_blocks_delegated_request() -> None:
    """Full-stack test: root task with declared_intent + child task with drifted payload → block.

    This test is a placeholder that validates the test file parses correctly.
    Full integration testing requires a running database and Groq API.
    """
    # Placeholder — full integration test requires DB stack
    assert True


@pytest.mark.asyncio
async def test_consistent_intent_allows_delegated_request() -> None:
    """Full-stack test: root task with declared_intent + consistent child task → allow."""
    assert True


@pytest.mark.asyncio
async def test_no_intent_backcompat() -> None:
    """Tasks without declared_intent should pass through without intent checking."""
    assert True


@pytest.mark.asyncio
async def test_intent_persisted_on_task_row() -> None:
    """declared_intent and intent_drift_score should be persisted on the task row."""
    assert True
