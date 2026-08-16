"""Unit tests for the non-amplification scope check (core/scope.py).

These tests define the contract for `parse_requested_scope` and `is_subset`.
They are pure-function tests with no DB, no network, no I/O.

Contract:
- `parse_requested_scope(request_data)` extracts the set of capability strings
  a request is asking for (task_type, resource_type+action, risk_threshold).
- `is_subset(child, parent_caveats)` returns True only when every child string
  is covered by the parent's caveats. Widening is rejected.

Coverage matrix (TDD):
- equality caveat: child == parent    -> pass
- equality caveat: child != parent    -> reject
- max_ caveat: child <= parent        -> pass
- max_ caveat: child > parent         -> reject
- child has caveat parent lacks       -> reject
- empty parent + empty child          -> pass
- empty parent + non-empty child      -> reject
"""

from __future__ import annotations

from a2a_firewall.core.scope import is_subset, parse_requested_scope

# ---------------------------------------------------------------------------
# parse_requested_scope
# ---------------------------------------------------------------------------


class TestParseRequestedScope:
    def test_extracts_task_type(self):
        req = {"task_type": "research", "payload": {}}
        assert "task_type=research" in parse_requested_scope(req)

    def test_extracts_resource_type_and_action(self):
        req = {
            "task_type": "research",
            "resource_type": "filesystem",
            "action": "read",
            "payload": {},
        }
        scope = parse_requested_scope(req)
        assert "resource_type=filesystem" in scope
        assert "action=read" in scope

    def test_extracts_risk_threshold_from_payload(self):
        req = {"task_type": "research", "payload": {"risk_threshold": 0.8}}
        scope = parse_requested_scope(req)
        assert "max_risk=0.8" in scope

    def test_empty_when_no_task_type_or_resource(self):
        assert parse_requested_scope({"payload": {}}) == set()

    def test_handles_missing_payload(self):
        # request_data is a dict; payload may be absent in edge cases
        assert "task_type=research" in parse_requested_scope({"task_type": "research"})

    def test_resource_without_action_excluded(self):
        # If action is missing, do not emit a half-formed resource caveat
        req = {"resource_type": "filesystem", "payload": {}}
        scope = parse_requested_scope(req)
        assert "resource_type=filesystem" not in scope

    def test_action_without_resource_excluded(self):
        req = {"action": "read", "payload": {}}
        scope = parse_requested_scope(req)
        assert "action=read" not in scope

    def test_payload_risk_threshold_clamped_nonnegative(self):
        req = {"task_type": "x", "payload": {"risk_threshold": -0.1}}
        scope = parse_requested_scope(req)
        # Negative thresholds are nonsensical; treat as 0.0
        assert "max_risk=0.0" in scope


# ---------------------------------------------------------------------------
# is_subset
# ---------------------------------------------------------------------------


class TestIsSubset:
    def test_equal_equality_caveat_passes(self):
        child = {"task_type=research"}
        parent = ["task_type=research"]
        assert is_subset(child, parent) is True

    def test_different_equality_caveat_rejected(self):
        child = {"task_type=research"}
        parent = ["task_type=payments"]
        assert is_subset(child, parent) is False

    def test_max_caveat_narrowing_passes(self):
        # Parent allows up to 0.8 risk; child asks for 0.5 — covered
        child = {"max_risk=0.5"}
        parent = ["max_risk=0.8"]
        assert is_subset(child, parent) is True

    def test_max_caveat_widening_rejected(self):
        # Parent allows up to 0.3 risk; child asks for 0.8 — widening
        child = {"max_risk=0.8"}
        parent = ["max_risk=0.3"]
        assert is_subset(child, parent) is False

    def test_max_caveat_equal_passes(self):
        child = {"max_risk=0.5"}
        parent = ["max_risk=0.5"]
        assert is_subset(child, parent) is True

    def test_child_caveat_unparented_rejected(self):
        child = {"task_type=research"}
        parent: list[str] = []
        assert is_subset(child, parent) is False

    def test_empty_child_with_no_parent_passes(self):
        assert is_subset(set(), []) is True

    def test_empty_child_with_parent_passes(self):
        assert is_subset(set(), ["task_type=research", "max_risk=0.5"]) is True

    def test_mixed_caveats_all_covered(self):
        child = {"task_type=research", "max_risk=0.3"}
        parent = ["task_type=research", "max_risk=0.8", "receiver=agent-b"]
        assert is_subset(child, parent) is True

    def test_mixed_caveats_one_widening_rejects_all(self):
        child = {"task_type=research", "max_risk=0.9"}
        parent = ["task_type=research", "max_risk=0.3"]
        assert is_subset(child, parent) is False

    def test_resource_caveat_must_match(self):
        child = {"resource_type=filesystem", "action=read"}
        parent = ["resource_type=filesystem", "action=write"]
        assert is_subset(child, parent) is False

    def test_parent_caveat_not_requested_is_fine(self):
        # Parent has an extra restriction — child doesn't need it
        child = {"task_type=research"}
        parent = ["task_type=research", "max_depth=2"]
        assert is_subset(child, parent) is True

    def test_max_depth_narrowing_passes(self):
        child = {"max_depth=1"}
        parent = ["max_depth=3"]
        assert is_subset(child, parent) is True

    def test_malformed_child_caveat_skipped(self):
        # If child has a malformed caveat, the function does not crash;
        # it just doesn't match any parent caveat and is rejected.
        child = {"=broken"}
        parent = ["task_type=research"]
        assert is_subset(child, parent) is False
