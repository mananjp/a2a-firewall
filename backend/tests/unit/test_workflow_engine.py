"""Unit tests for the stateful workflow security engine (core/workflow_engine.py)."""

from __future__ import annotations

from a2a_firewall.core.workflow_engine import (
    DEFAULT_FANOUT_LIMIT,
    WorkflowNode,
    compute_workflow_state,
    node_from_task,
    should_quarantine,
)


def _node(
    task_id: str,
    agent: str,
    parent: str | None,
    depth: int,
    risk: float = 0.0,
    decision: str = "allow",
    resource: str | None = None,
    action: str | None = None,
) -> WorkflowNode:
    return WorkflowNode(
        task_id=task_id,
        agent_id=agent,
        parent_task_id=parent,
        depth=depth,
        risk_score=risk,
        decision=decision,
        resource_type=resource,
        action=action,
    )


class TestHealthyWorkflow:
    def test_single_node_healthy(self):
        nodes = [_node("t1", "a", None, 0)]
        state = compute_workflow_state(nodes)
        assert state.healthy
        assert state.node_count == 1
        assert state.depth == 0
        assert state.anomalies == []

    def test_linear_chain_healthy(self):
        nodes = [
            _node("t1", "a", None, 0),
            _node("t2", "b", "t1", 1),
            _node("t3", "c", "t2", 2),
        ]
        state = compute_workflow_state(nodes)
        assert state.healthy
        assert state.depth == 2
        assert state.distinct_agents == 3
        assert state.anomalies == []

    def test_empty_nodes(self):
        state = compute_workflow_state([])
        assert state.node_count == 0


class TestCircularDelegation:
    def test_real_parent_cycle_flags_circle(self):
        # b's parent is a, c's parent is b, a's parent is c → a closed loop.
        nodes = [
            _node("a", "agentA", "c", 0),
            _node("b", "agentB", "a", 1),
            _node("c", "agentC", "b", 2),
        ]
        state = compute_workflow_state(nodes)
        circular = [a for a in state.anomalies if a.anomaly_type == "circular_delegation"]
        assert circular, "expected a circular_delegation anomaly"
        assert any(a.severity == "critical" for a in state.anomalies)
        assert should_quarantine(state)

    def test_self_referential_parent_flags_circle(self):
        nodes = [_node("a", "agentA", "a", 0)]
        state = compute_workflow_state(nodes)
        circular = [a for a in state.anomalies if a.anomaly_type == "circular_delegation"]
        assert circular

    def test_linear_chain_not_flagged(self):
        nodes = [
            _node("a", "agentA", None, 0),
            _node("b", "agentB", "a", 1),
            _node("c", "agentC", "b", 2),
        ]
        state = compute_workflow_state(nodes)
        circular = [a for a in state.anomalies if a.anomaly_type == "circular_delegation"]
        assert circular == []


class TestFanOut:
    def test_fan_out_explosion_detected(self):
        parent = _node("root", "a", None, 0)
        children = [_node(f"c{i}", f"agent{i}", "root", 1) for i in range(DEFAULT_FANOUT_LIMIT + 5)]
        state = compute_workflow_state([parent] + children)
        fanout = [a for a in state.anomalies if a.anomaly_type == "fan_out_explosion"]
        assert fanout


class TestPrivilegeAccumulation:
    def test_high_risk_multi_block_flags_accumulation(self):
        nodes = [
            _node("t1", "a", None, 0, risk=0.6, decision="block"),
            _node("t2", "b", "t1", 1, risk=0.6, decision="block"),
            _node("t3", "c", "t2", 2, risk=0.6, decision="block"),
        ]
        state = compute_workflow_state(nodes)
        acc = [a for a in state.anomalies if a.anomaly_type == "privilege_accumulation"]
        assert acc

    def test_low_risk_no_accumulation(self):
        nodes = [
            _node("t1", "a", None, 0, risk=0.1, decision="allow"),
            _node("t2", "b", "t1", 1, risk=0.1, decision="allow"),
        ]
        state = compute_workflow_state(nodes)
        acc = [a for a in state.anomalies if a.anomaly_type == "privilege_accumulation"]
        assert acc == []


class TestCumulativeStats:
    def test_cumulative_exposure_counts_resources(self):
        nodes = [
            _node("t1", "a", None, 0, resource="db", action="read"),
            _node("t2", "b", "t1", 1, resource="fs", action="write"),
            _node("t3", "c", "t2", 2, resource="db", action="read"),  # duplicate
        ]
        state = compute_workflow_state(nodes)
        assert state.cumulative_exposure == 2

    def test_cumulative_risk_bounded(self):
        nodes = [
            _node(f"t{i}", f"a{i}", None if i == 1 else f"t{i - 1}", i - 1, risk=1.0)
            for i in range(1, 6)
        ]
        state = compute_workflow_state(nodes)
        assert 0.0 <= state.cumulative_risk <= 1.0


class TestNodeFromTask:
    class _FakeTask:
        def __init__(self) -> None:
            import uuid

            self.id = uuid.uuid4()
            self.sender_id = uuid.uuid4()
            self.parent_task_id = None
            self.depth = 2
            self.risk_score = 0.4
            self.decision = "allow"
            self.resource_type = "db"
            self.action = "read"
            self.task_type = "research"
            self.payload = {"capabilities": ["x"]}

    def test_projects_task_row(self):
        t = self._FakeTask()
        node = node_from_task(t)
        assert node.task_id == str(t.id)
        assert node.agent_id == str(t.sender_id)
        assert node.depth == 2
        assert node.risk_score == 0.4
        assert node.resource_type == "db"

    def test_projects_parent(self):
        import uuid

        t = self._FakeTask()
        t.parent_task_id = uuid.uuid4()
        node = node_from_task(t)
        assert node.parent_task_id == str(t.parent_task_id)
