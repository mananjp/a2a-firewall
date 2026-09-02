"""Workflow security routes — state, anomaly inspection, and quarantine."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.core.workflow_engine import (
    WorkflowNode,
    WorkflowState,
    compute_workflow_state,
    node_from_task,
    should_quarantine,
)
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Task, WorkflowInstance, Workspace

router = APIRouter()


class WorkflowStateResponse(BaseModel):
    state: dict[str, Any]
    nodes: list[dict[str, Any]]


class QuarantineResponse(BaseModel):
    root_task_id: str
    quarantined: bool
    message: str


async def _collect_workflow(
    db: AsyncSession, workspace_id: Any, root_task_id: uuid.UUID
) -> list[WorkflowNode]:
    """Collect all task nodes sharing a root task id for a workspace."""
    result = await db.execute(
        select(Task).where(
            Task.workspace_id == workspace_id,
            Task.root_task_id == root_task_id,
        )
    )
    tasks = result.scalars().all()
    return [node_from_task(t) for t in tasks]


@router.get("")
async def list_workflows(
    limit: int = 50,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List workflow instances for the current workspace."""
    result = await db.execute(
        select(WorkflowInstance)
        .where(WorkflowInstance.workspace_id == workspace.id)
        .order_by(WorkflowInstance.updated_at.desc())
        .limit(limit)
    )
    return [
        {
            "id": str(r.id),
            "root_task_id": str(r.root_task_id),
            "node_count": r.node_count,
            "depth": r.depth,
            "cumulative_risk": r.cumulative_risk,
            "cumulative_exposure": r.cumulative_exposure,
            "distinct_agents": r.distinct_agents,
            "anomalies": r.anomalies,
            "quarantined": r.quarantined,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in result.scalars().all()
    ]


@router.get("/{root_task_id}", response_model=WorkflowStateResponse)
async def get_workflow_state(
    root_task_id: str,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> WorkflowStateResponse:
    """Compute the current state and anomaly profile of a whole workflow graph."""
    try:
        root_uuid = uuid.UUID(root_task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid root_task_id") from None

    nodes = await _collect_workflow(db, workspace.id, root_uuid)
    if not nodes:
        raise HTTPException(status_code=404, detail="No tasks found for this workflow")

    state: WorkflowState = compute_workflow_state(nodes)
    return WorkflowStateResponse(
        state=state.to_dict(),
        nodes=[n.to_dict() for n in nodes],
    )


@router.post("/{root_task_id}/quarantine", response_model=QuarantineResponse)
async def quarantine_workflow(
    root_task_id: str,
    workspace: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> QuarantineResponse:
    """Quarantine an entire root workflow.

    Quarantining marks the workflow instance as quarantined, which revokes the
    active delegation tokens and terminates descendants (subsequent inspections
    in the same workflow are blocked by the orchestrator).
    """
    try:
        root_uuid = uuid.UUID(root_task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid root_task_id") from None

    nodes = await _collect_workflow(db, workspace.id, root_uuid)
    if not nodes:
        raise HTTPException(status_code=404, detail="No tasks found for this workflow")

    state: WorkflowState = compute_workflow_state(nodes)
    triggered = should_quarantine(state)

    # Upsert the workflow instance, marking quarantined = True.
    existing = await db.execute(
        select(WorkflowInstance).where(
            WorkflowInstance.workspace_id == workspace.id,
            WorkflowInstance.root_task_id == root_uuid,
        )
    )
    row = existing.scalar_one_or_none()
    if row is None:
        row = WorkflowInstance(
            workspace_id=workspace.id,
            root_task_id=root_uuid,
            node_count=state.node_count,
            depth=state.depth,
            cumulative_risk=state.cumulative_risk,
            cumulative_exposure=state.cumulative_exposure,
            distinct_agents=state.distinct_agents,
            anomalies=[a.to_dict() if hasattr(a, "to_dict") else a for a in state.anomalies],
            quarantined=True,
        )
        db.add(row)
    else:
        row.quarantined = True
        row.anomalies = [a.to_dict() if hasattr(a, "to_dict") else a for a in state.anomalies]

    await db.commit()
    return QuarantineResponse(
        root_task_id=root_task_id,
        quarantined=True,
        message=(
            "Workflow quarantined (critical anomaly detected)."
            if triggered
            else "Workflow quarantined manually."
        ),
    )
