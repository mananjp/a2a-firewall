"""Unit tests for Phase 4 — Delegation-Chain Audit endpoints."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from a2a_firewall.api.routes.audit import export_delegation_chains, get_task_delegation_chain


@dataclass
class FakeWorkspace:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = "test-ws"


@dataclass
class FakeAgent:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: str = "Agent Alpha"


@dataclass
class FakeTask:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    workspace_id: uuid.UUID = field(default_factory=uuid.uuid4)
    root_task_id: uuid.UUID = field(default_factory=uuid.uuid4)
    declared_intent: str | None = "Perform data synthesis"
    intent_drift_score: float | None = 0.2


@dataclass
class FakeDelegationChain:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    workspace_id: uuid.UUID = field(default_factory=uuid.uuid4)
    task_id: uuid.UUID = field(default_factory=uuid.uuid4)
    sender_agent_id: uuid.UUID = field(default_factory=uuid.uuid4)
    receiver_agent_id: uuid.UUID = field(default_factory=uuid.uuid4)
    delegation_depth: int = 1
    caveats: list[str] = field(default_factory=lambda: ["task_type=research"])
    delegation_token: str = "token"
    signature_valid: bool = True
    chain_hash: str = "abc123hash"
    created_at: datetime = field(default_factory=datetime.utcnow)


class FakeQueryResult:
    def __init__(self, value: Any = None):
        self._value = value

    def scalar_one_or_none(self) -> Any:
        return self._value

    def all(self) -> list[Any]:
        if isinstance(self._value, list):
            return self._value
        return [self._value] if self._value is not None else []

    def scalars(self) -> Any:
        return self


@pytest.mark.asyncio
async def test_get_task_delegation_chain_invalid_uuid() -> None:
    ws = FakeWorkspace()
    db = AsyncMock()
    with pytest.raises(HTTPException) as exc_info:
        await get_task_delegation_chain("invalid-uuid", ws, db)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_get_task_delegation_chain_task_not_found() -> None:
    ws = FakeWorkspace()
    db = AsyncMock()
    db.execute.return_value = FakeQueryResult(None)

    with pytest.raises(HTTPException) as exc_info:
        await get_task_delegation_chain(str(uuid.uuid4()), ws, db)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_task_delegation_chain_success() -> None:
    ws = FakeWorkspace()
    task = FakeTask(workspace_id=ws.id)
    sender = FakeAgent(name="SenderAgent")
    receiver = FakeAgent(name="ReceiverAgent")
    chain_row = FakeDelegationChain(
        workspace_id=ws.id,
        task_id=task.id,
        sender_agent_id=sender.id,
        receiver_agent_id=receiver.id,
    )

    db = AsyncMock()

    # Call 1: query Task -> return task
    # Call 2: query DelegationChain join Agent -> return [(chain_row, sender)]
    # Call 3: query Agent for names map -> return [sender, receiver]
    task_res = FakeQueryResult(task)
    chain_res = FakeQueryResult([(chain_row, sender)])
    agents_res = FakeQueryResult([sender, receiver])

    db.execute.side_effect = [task_res, chain_res, agents_res]

    result = await get_task_delegation_chain(str(task.id), ws, db)

    assert result["task_id"] == str(task.id)
    assert result["declared_intent"] == "Perform data synthesis"
    assert result["hops_count"] == 1
    assert result["hops"][0]["sender_name"] == "SenderAgent"
    assert result["hops"][0]["receiver_name"] == "ReceiverAgent"


@pytest.mark.asyncio
async def test_export_delegation_chains_json() -> None:
    ws = FakeWorkspace()
    sender = FakeAgent(name="SenderAgent")
    receiver = FakeAgent(name="ReceiverAgent")
    chain_row = FakeDelegationChain(
        workspace_id=ws.id,
        sender_agent_id=sender.id,
        receiver_agent_id=receiver.id,
    )

    db = AsyncMock()
    chain_res = FakeQueryResult([(chain_row, sender)])
    agents_res = FakeQueryResult([sender, receiver])
    db.execute.side_effect = [chain_res, agents_res]

    result = await export_delegation_chains(since=None, limit=50, format="json", ws=ws, db=db)

    assert result["workspace_id"] == str(ws.id)
    assert result["count"] == 1
    assert result["events"][0]["sender_name"] == "SenderAgent"


@pytest.mark.asyncio
async def test_export_delegation_chains_csv() -> None:
    ws = FakeWorkspace()
    sender = FakeAgent(name="SenderAgent")
    receiver = FakeAgent(name="ReceiverAgent")
    chain_row = FakeDelegationChain(
        workspace_id=ws.id,
        sender_agent_id=sender.id,
        receiver_agent_id=receiver.id,
    )

    db = AsyncMock()
    chain_res = FakeQueryResult([(chain_row, sender)])
    agents_res = FakeQueryResult([sender, receiver])
    db.execute.side_effect = [chain_res, agents_res]

    response = await export_delegation_chains(since=None, limit=50, format="csv", ws=ws, db=db)

    assert response.media_type == "text/csv"
    content = response.body.decode("utf-8")
    assert "timestamp,task_id,sender_id,sender_name" in content
    assert "SenderAgent" in content
