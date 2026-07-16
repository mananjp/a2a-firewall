"""Simulation route — runs multi-step bank agent scenarios through the real inspection pipeline.

Auto-provisions agents and permissions on first run so the user never has to
manually configure anything.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.core.security import generate_api_key
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Agent, AgentPermission, Workspace
from a2a_firewall.detection.orchestrator import run_inspection

router = APIRouter()

# Default bank agents for the simulation mesh
DEFAULT_AGENTS = [
    {
        "name": "Customer Service",
        "description": "First point of contact for customer queries",
        "capabilities": ["customer_interaction", "ticket_creation"],
    },
    {
        "name": "Fraud Investigation",
        "description": "Investigates suspicious activity and fraud alerts",
        "capabilities": ["investigation", "fraud_detection", "case_management"],
    },
    {
        "name": "KYC Agent",
        "description": "Know Your Customer identity verification",
        "capabilities": ["identity_verification", "document_check", "compliance"],
    },
    {
        "name": "Payments Agent",
        "description": "Processes payments, holds, and wire transfers",
        "capabilities": ["payment_processing", "wire_transfer", "hold_management"],
    },
]


# For each (sender, receiver, task_type) triple the simulation is allowed to request.
# Any pair+task_type not in this set will be blocked by default_deny.
ALLOWED_TASK_PERMISSIONS: list[tuple[str, str, str]] = [
    ("Customer Service", "Fraud Investigation", "investigation"),
    ("Customer Service", "Fraud Investigation", "status_update"),
    ("Customer Service", "Payments Agent", "payment_request"),
    ("Customer Service", "KYC Agent", "identity_check"),
    ("Fraud Investigation", "Payments Agent", "payment_hold"),
    ("Fraud Investigation", "Payments Agent", "payment_approval"),
    ("Fraud Investigation", "Customer Service", "status_update"),
    ("Fraud Investigation", "KYC Agent", "verification_request"),
    ("Fraud Investigation", "KYC Agent", "identity_verification"),
    ("KYC Agent", "Fraud Investigation", "identity_verification"),
    ("KYC Agent", "Fraud Investigation", "verification_request"),
    ("KYC Agent", "Payments Agent", "compliance_check"),
    ("KYC Agent", "Customer Service", "kyc_status"),
    ("Payments Agent", "Customer Service", "payment_confirmation"),
    ("Payments Agent", "Fraud Investigation", "transaction_report"),
    ("Payments Agent", "KYC Agent", "risk_assessment"),
]

TASK_TYPE_MAP: dict[str, dict[str, str]] = {
    "customer service": {
        "fraud investigation": "investigation",
        "payments agent": "payment_request",
        "kyc agent": "identity_check",
    },
    "fraud investigation": {
        "payments agent": "payment_hold",
        "customer service": "status_update",
        "kyc agent": "verification_request",
    },
    "kyc agent": {
        "fraud investigation": "identity_verification",
        "payments agent": "compliance_check",
        "customer service": "kyc_status",
    },
    "payments agent": {
        "customer service": "payment_confirmation",
        "fraud investigation": "transaction_report",
        "kyc agent": "risk_assessment",
    },
}


def _infer_task_type(sender_name: str, receiver_name: str, payload: dict[str, Any]) -> str:
    """Infer the task type from agent pair and payload content."""
    pair_map = TASK_TYPE_MAP.get(sender_name.lower(), {}).get(receiver_name.lower())
    if pair_map:
        return pair_map
    if "document_type" in payload or "verification" in payload or "kyc" in payload:
        return "identity_verification"
    if "amount" in payload or "transaction_id" in payload or "currency" in payload:
        return "payment_processing"
    if "account_id" in payload or "reason" in payload:
        return "investigation"
    if "instructions" in payload or "context" in payload:
        return "investigation"
    return "task"


class SimulationStep(BaseModel):
    sender: str
    receiver: str
    task_type: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    action: str | None = None
    payload: dict[str, Any]


class SimulationRunRequest(BaseModel):
    steps: list[SimulationStep]


async def _ensure_agents(workspace: Workspace, db: AsyncSession) -> dict[str, Agent]:
    """Get or create the standard bank agents for this workspace."""
    result = await db.execute(
        select(Agent).where(Agent.workspace_id == workspace.id, Agent.status == "active")
    )
    existing = {a.name.lower(): a for a in result.scalars().all()}

    # Create any missing agents
    created_any = False
    for agent_def in DEFAULT_AGENTS:
        key = str(agent_def["name"]).lower()
        if key not in existing:
            _, key_hash = generate_api_key("agt")
            agent = Agent(
                workspace_id=workspace.id,
                name=agent_def["name"],
                description=agent_def["description"],
                api_key_hash=key_hash,
                status="active",
                capabilities=agent_def["capabilities"],
            )
            db.add(agent)
            existing[key] = agent
            created_any = True

    if created_any:
        await db.flush()

        name_to_id = {v.name.lower(): v.id for v in existing.values()}

        for sender_name, receiver_name, task_type in ALLOWED_TASK_PERMISSIONS:
            sender_id = name_to_id.get(sender_name.lower())
            receiver_id = name_to_id.get(receiver_name.lower())
            if sender_id and receiver_id:
                db.add(
                    AgentPermission(
                        workspace_id=workspace.id,
                        sender_id=sender_id,
                        receiver_id=receiver_id,
                        task_type=task_type,
                        allowed=True,
                    )
                )
        await db.flush()

    return existing


@router.post("/run")
async def run_simulation(
    body: SimulationRunRequest,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Run a multi-step simulation. Auto-provisions agents if needed."""
    agent_map = await _ensure_agents(workspace, db)

    step_results: list[dict[str, Any]] = []

    for i, step in enumerate(body.steps):
        sender = agent_map.get(step.sender.lower())
        receiver = agent_map.get(step.receiver.lower())

        if not sender:
            sender = list(agent_map.values())[0]
        if not receiver:
            receiver = (
                list(agent_map.values())[1] if len(agent_map) > 1 else list(agent_map.values())[0]
            )

        task_type = step.task_type or _infer_task_type(step.sender, step.receiver, step.payload)
        task_id = str(uuid.uuid4())
        trace_id = uuid.uuid4().hex

        request_data = {
            "task_id": task_id,
            "parent_task_id": None,
            "root_task_id": task_id,
            "receiver_agent_id": str(receiver.id),
            "task_type": task_type,
            "schema_version": "v1",
            "resource_type": step.resource_type,
            "resource_id": step.resource_id,
            "action": step.action,
            "payload": step.payload,
            "trace_id": trace_id,
            "parent_span_id": None,
            "sdk_version": "simulation-v1",
            "depth": i,
        }

        inspection = await run_inspection(request_data, sender, workspace, db)

        step_results.append(
            {
                "step": i,
                "sender": step.sender,
                "receiver": step.receiver,
                "task_type": task_type,
                **inspection,
            }
        )

    return {
        "steps": step_results,
        "total": len(step_results),
    }
