from __future__ import annotations

from unittest.mock import MagicMock

from a2a_firewall.detection.layer5_decision import make_decision


def test_make_decision_respects_custom_review_threshold():
    ws = MagicMock()
    ws.block_threshold = 0.8
    ws.review_threshold = 0.4

    assert make_decision(0.45, None, ws) == "review"
    assert make_decision(0.35, None, ws) == "allow"
    assert make_decision(0.85, None, ws) == "block"


def test_make_decision_default_review_threshold():
    ws = MagicMock()
    ws.block_threshold = 0.8
    del ws.review_threshold  # simulate workspace without review_threshold set

    assert make_decision(0.6, None, ws) == "review"
    assert make_decision(0.4, None, ws) == "allow"
    assert make_decision(0.8, None, ws) == "block"


def test_make_decision_explicit_policy_action():
    ws = MagicMock()
    ws.block_threshold = 0.8
    ws.review_threshold = 0.5

    assert make_decision(0.1, "review", ws) == "review"
    assert make_decision(0.9, "review", ws) == "review"
    assert make_decision(0.1, "block", ws) == "block"
    assert make_decision(0.9, "allow", ws) == "allow"
