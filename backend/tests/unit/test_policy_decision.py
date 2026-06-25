from unittest.mock import MagicMock

from a2a_firewall.detection.layer5_decision import make_decision


def make_ws(block=0.8):
    ws = MagicMock()
    ws.block_threshold = block
    return ws


def test_explicit_block():
    assert make_decision(0.1, "block", make_ws()) == "block"


def test_explicit_allow():
    assert make_decision(0.9, "allow", make_ws()) == "allow"


def test_high_risk_score_blocks():
    assert make_decision(0.9, None, make_ws()) == "block"


def test_medium_risk_review():
    assert make_decision(0.6, None, make_ws()) == "review"


def test_low_risk_allows():
    assert make_decision(0.1, None, make_ws()) == "allow"
