from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_agent
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Agent, Workspace
from a2a_firewall.detection.orchestrator import run_inspection

router = APIRouter()


class InspectRequest(BaseModel):
    task_id: str
    parent_task_id: str | None = None
    root_task_id: str | None = None
    receiver_agent_id: str
    task_type: str
    schema_version: str = "v1"
    payload: dict[str, Any]
    resource_type: str | None = None  # e.g. "account", "payment", "customer_data"
    resource_id: str | None = None  # e.g. "ACC-42", "TX-100"
    action: str | None = None  # e.g. "read", "transfer", "delete", "approve"
    declared_intent: str | None = None  # root task's purpose statement for intent-binding
    delegation_token: str | None = None  # macaroon-style parent token for non-amplification
    trace_id: str | None = None
    parent_span_id: str | None = None
    sdk_version: str | None = None
    depth: int = 0


class InspectResponseRequest(BaseModel):
    """A response body / tool result to inspect before it reaches the agent."""

    response_body: Any
    context: str | None = None  # e.g. "llm_response" | "tool_result" | "rag_chunk"
    redact_pii: bool = True


@router.post("/inspect")
async def inspect(
    body: InspectRequest,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    ws_result = await db.execute(select(Workspace).where(Workspace.id == agent.workspace_id))
    workspace = ws_result.scalar_one()
    result = await run_inspection(body.model_dump(), agent, workspace, db)
    return result


@router.post("/inspect-response")
async def inspect_response(
    body: InspectResponseRequest,
    agent: Agent = Depends(get_current_agent),
) -> dict[str, Any]:
    """Inspect a response body / tool result before it reaches the agent.

    Catches PII leaks, prompt injections, destructive instructions and IPS
    signatures in upstream LLM responses and MCP tool results — the direction
    the proxy historically did not inspect.
    """
    from a2a_firewall.proxy.response_scanner import scan_response_body

    decision = scan_response_body(
        body.response_body,
        redact_pii=body.redact_pii,
    )
    return {
        "agent_id": str(agent.id),
        "context": body.context,
        "decision": decision["decision"],
        "allowed_to_proceed": decision["decision"] == "allow",
        "findings": decision["findings"],
        "redacted_body": decision["redacted_body"],
    }
