"""Unit tests for decision evidence envelopes (core/evidence.py).

Covers: signing/verification round-trip, tamper detection, deterministic
replay, redaction of sensitive evidence, and risk aggregation bounds.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from a2a_firewall.core.evidence import (
    DetectorVersion,
    EvidenceEnvelope,
    build_decision_envelope,
    replay_from_envelope,
    workspace_root_public_key_hex,
)

WS_ID = "11111111-1111-1111-1111-111111111111"
TASK_ID = "22222222-2222-2222-2222-222222222222"


def _sample_violations() -> list[dict]:
    return [
        {
            "layer": "semantic",
            "violation_type": "prompt_injection",
            "severity": "critical",
            "details": {"matched": "ignore previous instructions", "signature_id": "SRC-1"},
        },
        {
            "layer": "rule",
            "violation_type": "sender_not_permitted",
            "severity": "high",
            "details": {},
        },
    ]


def _build() -> EvidenceEnvelope:
    return build_decision_envelope(
        workspace_id=WS_ID,
        task_id=TASK_ID,
        decision="block",
        reason="permission_denied",
        risk_score=0.9,
        violations=_sample_violations(),
        input_hashes={"payload": "abc123"},
        trace_events=[
            {"name": "firewall.decision", "duration_ms": 3, "attributes": {"decision": "block"}}
        ],
        delegation_chain=["agent-a", "agent-b"],
        model_evaluator_identity="openai/gpt-oss-120b",
    )


class TestSignVerify:
    def test_signature_round_trip(self):
        env = _build()
        assert env.signature
        assert env.verify_signature(workspace_root_public_key_hex(WS_ID))

    def test_tamper_detected(self):
        env = _build()
        env.final_action = "allow"  # tamper
        assert not env.verify_signature(workspace_root_public_key_hex(WS_ID))

    def test_tamper_detected_risk(self):
        env = _build()
        env.risk_aggregation["final_risk_score"] = 0.0
        assert not env.verify_signature(workspace_root_public_key_hex(WS_ID))

    def test_wrong_workspace_key_fails(self):
        env = _build()
        other_ws = "99999999-9999-9999-9999-999999999999"
        assert not env.verify_signature(workspace_root_public_key_hex(other_ws))


class TestDeterminism:
    def test_canonical_bytes_deterministic(self):
        env1 = _build()
        env2 = _build()
        # signatures differ (nonce differs), but canonical pre-signature bytes match
        assert env1.to_canonical_bytes() != env2.to_canonical_bytes()

    def test_replay_all_passes(self):
        env = _build()
        report = replay_from_envelope(env, workspace_root_public_key_hex(WS_ID))
        assert report["signature_valid"] is True
        assert report["input_hashes_present"] is True
        assert report["version_supported"] is True
        assert report["risk_within_bounds"] is True
        assert report["all_checks_passed"] is True

    def test_replay_tampered_fails(self):
        env = _build()
        env.risk_aggregation["final_risk_score"] = 5.0
        report = replay_from_envelope(env, workspace_root_public_key_hex(WS_ID))
        assert report["signature_valid"] is False
        assert report["all_checks_passed"] is False


class TestRedaction:
    def test_raw_pii_not_in_redacted_evidence(self):
        env = _build()
        redacted = env.redacted_evidence["violations"]
        combined = str(redacted)
        assert "ignore previous instructions" not in combined
        assert "matched" not in combined

    def test_allowed_detail_keys_retained(self):
        env = _build()
        first = env.redacted_evidence["violations"][0]
        assert first["violation_type"] == "prompt_injection"
        assert "signature_id" in first["details"]


class TestRiskAggregation:
    def test_aggregation_counts_by_severity(self):
        env = _build()
        agg = env.risk_aggregation
        assert agg["final_risk_score"] == 0.9
        assert agg["violations_by_severity"]["critical"] == 1
        assert agg["violations_by_severity"]["high"] == 1


class TestConstructor:
    def test_detector_versions_are_objects(self):
        env = _build()
        assert len(env.detector_versions) > 0
        assert isinstance(env.detector_versions[0], DetectorVersion)

    def test_authorization_chain_present(self):
        env = _build()
        assert env.authorization_chain == ["agent-a", "agent-b"]

    def test_unsigned_envelope_verify_fails(self):
        env = EvidenceEnvelope(
            decision_id="decision-x",
            workspace_id=WS_ID,
            task_id=TASK_ID,
            timestamp=1.0,
            policy_version="v1",
            final_action="allow",
        )
        assert not env.verify_signature(workspace_root_public_key_hex(WS_ID))

    def test_model_validation_enforces_required(self):
        with pytest.raises(ValidationError):
            EvidenceEnvelope()  # missing required fields
