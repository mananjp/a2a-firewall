"""Stateful workflow security engine.

Evaluates the *entire* workflow graph (all tasks sharing a ``root_task_id``),
not just a single inspection. It detects attacker-oriented anomalies that are
invisible at the per-request layer:

- **Circular delegation**: a descendant whose chain revisits an ancestor agent,
  forming a loop (potential delegation/liveness attack).
- **Fan-out explosion**: a workflow that fans out to an unusually large number of
  distinct descendants (resource exhaustion / task injection).
- **Privilege accumulation**: cumulative expansion of requested capabilities
  across hops, or repeated blocking by high-severity policy rules.

It also scores cumulative risk and cumulative data exposure across the whole
workflow, and supports quarantining (revoking) the entire root workflow when a
descendant becomes compromised.

This module is intentionally **pure** (no DB, no I/O) so the anomaly rules are
unit-testable in isolation. The DB-persistence + API layer wraps it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Default anomaly thresholds (tunable per deployment via config).
DEFAULT_FANOUT_LIMIT = 12
DEFAULT_PRIVILEGE_ACCUMULATION_LIMIT = 0.9


@dataclass
class WorkflowNode:
    """A single task node within a workflow, as seen by the engine."""

    task_id: str
    agent_id: str
    parent_task_id: str | None
    depth: int = 0
    risk_score: float = 0.0
    decision: str | None = None
    resource_type: str | None = None
    action: str | None = None
    task_type: str | None = None
    capabilities: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "agent_id": self.agent_id,
            "parent_task_id": self.parent_task_id,
            "depth": self.depth,
            "risk_score": self.risk_score,
            "decision": self.decision,
            "resource_type": self.resource_type,
            "action": self.action,
            "task_type": self.task_type,
            "capabilities": self.capabilities,
        }


@dataclass
class WorkflowAnomaly:
    """A detected anomaly in the workflow graph."""

    anomaly_type: str  # circular_delegation | fan_out_explosion | privilege_accumulation
    severity: str
    description: str
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class WorkflowState:
    """The computed state of a whole workflow."""

    root_task_id: str
    node_count: int
    depth: int
    cumulative_risk: float
    cumulative_exposure: int  # count of distinct resources touched
    distinct_agents: int
    distinct_tasks: int
    anomalies: list[WorkflowAnomaly] = field(default_factory=list)
    quarantined: bool = False

    @property
    def healthy(self) -> bool:
        return not any(a.severity == "critical" for a in self.anomalies)

    def to_dict(self) -> dict[str, Any]:
        return {
            "root_task_id": self.root_task_id,
            "node_count": self.node_count,
            "depth": self.depth,
            "cumulative_risk": round(self.cumulative_risk, 4),
            "cumulative_exposure": self.cumulative_exposure,
            "distinct_agents": self.distinct_agents,
            "distinct_tasks": self.distinct_tasks,
            "quarantined": self.quarantined,
            "anomalies": [
                {
                    "type": a.anomaly_type,
                    "severity": a.severity,
                    "description": a.description,
                    "details": a.details,
                }
                for a in self.anomalies
            ],
        }


def compute_workflow_state(
    nodes: list[WorkflowNode],
    *,
    fanout_limit: int = DEFAULT_FANOUT_LIMIT,
    privilege_accumulation_limit: float = DEFAULT_PRIVILEGE_ACCUMULATION_LIMIT,
) -> WorkflowState:
    """Compute the state/anomalies of a workflow given its nodes.

    ``nodes`` is the full set of tasks sharing a root task id (any order).
    The engine reconstructs the tree, walks it, and flags anomalies.
    """
    if not nodes:
        return WorkflowState(
            root_task_id="",
            node_count=0,
            depth=0,
            cumulative_risk=0.0,
            cumulative_exposure=0,
            distinct_agents=0,
            distinct_tasks=0,
        )

    root_task_id = nodes[0].task_id
    depth = max((n.depth for n in nodes), default=0)

    # --- basic aggregates ---
    distinct_agents = {n.agent_id for n in nodes}
    resources = {f"{n.resource_type}:{n.action}" for n in nodes if n.resource_type}
    cumulative_risk = min(1.0, sum(max(0.0, n.risk_score or 0.0) for n in nodes) * 0.5)
    cumulative_exposure = len(resources)

    anomalies: list[WorkflowAnomaly] = []

    # --- fan-out explosion: count distinct children per parent ---
    parent_to_children: dict[str, list[WorkflowNode]] = {}
    for n in nodes:
        if n.parent_task_id:
            parent_to_children.setdefault(n.parent_task_id, []).append(n)
    for parent, children in parent_to_children.items():
        if len(children) > fanout_limit:
            anomalies.append(
                WorkflowAnomaly(
                    anomaly_type="fan_out_explosion",
                    severity="high",
                    description=f"Workflow fans out to {len(children)} children under task {parent}.",
                    details={"parent_task_id": parent, "child_count": len(children)},
                )
            )

    # --- circular delegation: a node whose parent chain loops back on itself ---
    parent_of = {n.task_id: n.parent_task_id for n in nodes}
    for start in nodes:
        seen: set[str] = set()
        cursor = start.parent_task_id
        while cursor:
            if cursor == start.task_id or cursor in seen:
                anomalies.append(
                    WorkflowAnomaly(
                        anomaly_type="circular_delegation",
                        severity="critical",
                        description=(
                            f"Task {start.task_id} participates in a circular "
                            "delegation chain (its ancestors loop back on it)."
                        ),
                        details={"task_id": start.task_id, "agent_id": start.agent_id},
                    )
                )
                break
            seen.add(cursor)
            cursor = parent_of.get(cursor)

    # --- privilege accumulation: cumulative risk high + multiple blocked highs ---
    high_severity_blocks = sum(
        1 for n in nodes if n.decision == "block" and (n.risk_score or 0.0) > 0.5
    )
    if cumulative_risk >= privilege_accumulation_limit - 1e-9 and high_severity_blocks >= 2:
        anomalies.append(
            WorkflowAnomaly(
                anomaly_type="privilege_accumulation",
                severity="high",
                description="Workflow shows privilege accumulation: high cumulative risk with repeated high-severity blocks.",
                details={
                    "cumulative_risk": round(cumulative_risk, 4),
                    "high_severity_blocks": high_severity_blocks,
                },
            )
        )

    return WorkflowState(
        root_task_id=root_task_id,
        node_count=len(nodes),
        depth=depth,
        cumulative_risk=cumulative_risk,
        cumulative_exposure=cumulative_exposure,
        distinct_agents=len(distinct_agents),
        distinct_tasks=len(nodes),
        anomalies=anomalies,
    )


def should_quarantine(state: WorkflowState) -> bool:
    """Whether a workflow should be quarantined based on its anomalies."""
    return any(a.severity == "critical" for a in state.anomalies)


def node_from_task(task: Any) -> WorkflowNode:
    """Project a SQLAlchemy ``Task`` row into a :class:`WorkflowNode`."""
    return WorkflowNode(
        task_id=str(task.id),
        agent_id=str(task.sender_id),
        parent_task_id=str(task.parent_task_id) if task.parent_task_id else None,
        depth=int(task.depth or 0),
        risk_score=float(task.risk_score or 0.0),
        decision=task.decision,
        resource_type=task.resource_type,
        action=task.action,
        task_type=task.task_type,
        capabilities=getattr(getattr(task, "payload", None) or {}, "capabilities", [])
        if isinstance(getattr(task, "payload", None), dict)
        else [],
    )
