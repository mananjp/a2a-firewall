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

    def test_projects_sender_and_receiver(self):
        import uuid

        t = self._FakeTask()
        t.receiver_id = uuid.uuid4()
        node = node_from_task(t)
        assert node.sender_agent_id == str(t.sender_id)
        assert node.receiver_agent_id == str(t.receiver_id)

    def test_receiver_absent_is_none(self):
        # The projection must stay total for row-like objects that omit
        # ``receiver_id`` (e.g. legacy rows, partial projections, test doubles).
        t = self._FakeTask()
        assert not hasattr(t, "receiver_id")
        node = node_from_task(t)
        assert node.receiver_agent_id is None


class TestSerializationContract:
    """The API/JSONB shape the frontend depends on.

    These lock the response contract that ``frontend/src/lib/types.ts`` models.
    A rename here silently breaks the dashboard, so it must fail loudly.
    """

    def test_node_dict_includes_agent_pair(self):
        node = WorkflowNode(
            task_id="t1",
            agent_id="agentA",
            parent_task_id=None,
            sender_agent_id="agentA",
            receiver_agent_id="agentB",
        )
        d = node.to_dict()
        assert d["sender_agent_id"] == "agentA"
        assert d["receiver_agent_id"] == "agentB"
        assert d["agent_id"] == "agentA"

    def test_node_dict_falls_back_to_agent_id(self):
        node = WorkflowNode(task_id="t1", agent_id="agentA", parent_task_id=None)
        d = node.to_dict()
        assert d["sender_agent_id"] == "agentA"
        assert d["receiver_agent_id"] == "agentA"

    def test_anomaly_dict_is_json_serializable(self):
        import json

        from a2a_firewall.core.workflow_engine import WorkflowAnomaly

        a = WorkflowAnomaly(
            anomaly_type="circular_delegation",
            severity="critical",
            description="loop",
            details={"task_id": "t1"},
        )
        d = a.to_dict()
        # The key is ``anomaly_type`` (not ``type``) to match the dataclass
        # field and the frontend type.
        assert d["anomaly_type"] == "circular_delegation"
        assert d["severity"] == "critical"
        assert d["description"] == "loop"
        assert d["details"] == {"task_id": "t1"}
        # Regression: this value is assigned to a JSONB column. Before
        # WorkflowAnomaly gained to_dict(), the raw dataclass was passed
        # through and psycopg raised "not JSON serializable" on commit.
        json.dumps(d)

    def test_state_dict_anomalies_match_anomaly_dict(self):
        nodes = [
            _node("a", "agentA", "c", 0),
            _node("b", "agentB", "a", 1),
            _node("c", "agentC", "b", 2),
        ]
        state = compute_workflow_state(nodes)
        d = state.to_dict()
        assert d["anomalies"]
        for serialized, original in zip(d["anomalies"], state.anomalies, strict=True):
            assert serialized == original.to_dict()
            assert "anomaly_type" in serialized
        assert d["quarantined"] is False
