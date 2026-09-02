"""Decision Evidence Envelopes — signed, replayable bundles for every firewall decision.

Each decision produces a machine-verifiable evidence envelope containing everything
needed for an independent auditor to reconstruct and re-verify the decision offline:

- Which policy version ran
- Which detector versions were applied
- Input hashes (payload, schema, request)
- Redacted matched evidence (PII/tokens scrubbed)
- Rule outputs
- The model-evaluator identity (Groq model)
- Risk aggregation
- The authorization chain (delegation lineage)
- Timestamp + nonce
- The final action

The envelope is signed with the workspace root Ed25519 private key (derived
deterministically from the workspace UUID + the server-side API_KEY_SALT secret,
mirroring the identity layer). Verification uses the workspace root *public* key,
so any party who holds the public key can independently verify the envelope.

Deterministic replay: the same envelope bytes (policy + detector versions + input
hashes) can be re-run by a downstream verifier against the pinned policy version
to confirm the decision reproduces.
"""

from __future__ import annotations

import json
import secrets
import time
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from pydantic import BaseModel, Field


class DetectorVersion(BaseModel):
    """A detector/validator that contributed to the decision, pinned by version."""

    name: str
    version: str


class EvidenceEnvelope(BaseModel):
    """Signed evidence bundle for a single security decision."""

    envelope_version: str = "1.0"
    decision_id: str
    workspace_id: str
    task_id: str
    timestamp: float
    nonce: str = Field(default_factory=lambda: secrets.token_hex(16))
    policy_version: str
    detector_versions: list[DetectorVersion] = Field(default_factory=list)
    input_hashes: dict[str, str] = Field(default_factory=dict)
    redacted_evidence: dict[str, Any] = Field(default_factory=dict)
    rule_outputs: list[dict[str, Any]] = Field(default_factory=list)
    model_evaluator_identity: str | None = None
    risk_aggregation: dict[str, Any] = Field(default_factory=dict)
    authorization_chain: list[str] = Field(default_factory=list)
    final_action: str
    reason: str | None = None
    signature: str = ""

    # ------------------------------------------------------------------
    # Canonical serialization (deterministic, for signing/verification)
    # ------------------------------------------------------------------

    def to_canonical_bytes(self) -> bytes:
        """Deterministic JSON of all fields except the signature.

        Keys sorted, no whitespace — identical bytes across any consumer.
        """
        d = self.model_dump(exclude={"signature"})
        return json.dumps(d, sort_keys=True, separators=(",", ":")).encode()

    def to_dict(self) -> dict[str, Any]:
        d = self.model_dump()
        d["detector_versions"] = [dv.model_dump() for dv in self.detector_versions]
        return d

    def verify_signature(self, public_key_hex: str) -> bool:
        """Verify the Ed25519 signature against a workspace root public key."""
        from a2a_firewall.core.identity import parse_public_key

        if not self.signature:
            return False
        try:
            pub_key = parse_public_key(public_key_hex)
            pub_key.verify(bytes.fromhex(self.signature), self.to_canonical_bytes())
            return True
        except Exception:
            return False


def workspace_root_signing_key(workspace_id: str) -> Ed25519PrivateKey:
    """Deterministically derive the workspace root Ed25519 private key.

    Mirrors ``identity._workspace_root_private_key``: PBKDF2 of
    (API_KEY_SALT, workspace_id). In production this would be an HSM/KMS lookup.
    """
    from a2a_firewall.core.security import derive_workspace_signing_seed

    seed = derive_workspace_signing_seed(workspace_id)
    return Ed25519PrivateKey.from_private_bytes(seed)


def workspace_root_public_key_hex(workspace_id: str) -> str:
    """Public hex of the workspace root signing key."""
    from a2a_firewall.core.identity import public_key_to_hex

    return public_key_to_hex(workspace_root_signing_key(workspace_id).public_key())


def sign_envelope(envelope: EvidenceEnvelope, workspace_id: str) -> EvidenceEnvelope:
    """Sign an envelope in place with the workspace root key."""
    key = workspace_root_signing_key(workspace_id)
    envelope.signature = key.sign(envelope.to_canonical_bytes()).hex()
    return envelope


DEFAULT_DETECTOR_VERSIONS: list[tuple[str, str]] = [
    ("policy_engine", "1.0"),
    ("schema_validator", "1.0"),
    ("permissions", "1.0"),
    ("rules_engine", "1.0"),
    ("ips_signatures", "1.0"),
    ("pii_patterns", "1.0"),
    ("cve_risk", "1.0"),
    ("semantic_evaluator", "1.0"),
    ("decision", "1.0"),
]


def build_decision_envelope(
    *,
    workspace_id: str,
    task_id: str,
    decision: str,
    reason: str | None,
    risk_score: float,
    violations: list[dict[str, Any]],
    input_hashes: dict[str, str],
    trace_events: list[dict[str, Any]],
    delegation_chain: list[str],
    model_evaluator_identity: str | None,
    policy_version: str | None = None,
    detector_versions: list[DetectorVersion] | None = None,
    decision_id: str | None = None,
) -> EvidenceEnvelope:
    """Assemble and sign a full evidence envelope for a decision.

    ``redacted_evidence`` contains a scrubbed view of matched evidence: the
    violation types/layers plus any non-sensitive details (severity, matched rule)
    but never raw payload contents or PII.
    """
    env = EvidenceEnvelope(
        decision_id=decision_id or _make_decision_id(task_id),
        workspace_id=workspace_id,
        task_id=task_id,
        timestamp=time.time(),
        policy_version=policy_version or "workspace.default",
        detector_versions=detector_versions
        or [DetectorVersion(name=n, version=v) for n, v in DEFAULT_DETECTOR_VERSIONS],
        input_hashes=input_hashes,
        redacted_evidence=_redact_violations(violations),
        rule_outputs=_safe_rule_outputs(trace_events),
        model_evaluator_identity=model_evaluator_identity,
        risk_aggregation=_aggregate_risk(risk_score, violations),
        authorization_chain=list(delegation_chain),
        final_action=decision,
        reason=reason,
    )
    return sign_envelope(env, workspace_id)


def _make_decision_id(task_id: str) -> str:
    return f"decision-{task_id}"


def _redact_violations(violations: list[dict[str, Any]]) -> dict[str, Any]:
    """Scrub violations to a non-sensitive, verifiable projection."""
    redacted: list[dict[str, Any]] = []
    for v in violations:
        entry: dict[str, Any] = {
            "layer": v.get("layer"),
            "violation_type": v.get("violation_type"),
            "severity": v.get("severity"),
        }
        details = v.get("details")
        allowed_keys = {"matched_rule", "signature_id", "category", "ips_action", "subtype"}
        if isinstance(details, dict):
            entry["details"] = {k: details[k] for k in allowed_keys if k in details}
        redacted.append(entry)
    return {"violations": redacted}


def _safe_rule_outputs(trace_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Project trace events to rule-level outputs that are safe to share."""
    outputs: list[dict[str, Any]] = []
    for ev in trace_events:
        name = ev.get("name", "")
        if name.startswith("firewall."):
            attr = ev.get("attributes", {})
            safe = {
                k: v
                for k, v in attr.items()
                if k
                in {
                    "blocked",
                    "decision",
                    "risk_delta",
                    "violations_count",
                    "allowed",
                    "non_amplification_enforced",
                    "called",
                    "matches_count",
                    "pii_matches_count",
                    "sig_matches_count",
                    "model",
                }
            }
            outputs.append({"name": name, "duration_ms": ev.get("duration_ms", 0), "summary": safe})
    return outputs


def _aggregate_risk(risk_score: float, violations: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate the final risk score by severity."""
    by_severity: dict[str, int] = {}
    for v in violations:
        sev = v.get("severity", "low")
        by_severity[sev] = by_severity.get(sev, 0) + 1
    return {"final_risk_score": round(float(risk_score), 4), "violations_by_severity": by_severity}


def replay_from_envelope(envelope: EvidenceEnvelope, public_key_hex: str) -> dict[str, bool]:
    """Deterministically re-verify an envelope offline.

    Returns a report of every integrity check that an independent auditor can run
    without re-executing the (costly) pipeline:
    - signature valid against the workspace root public key
    - input hashes present and non-empty (consistency marker)
    - envelope schema version supported
    """
    signature_valid = envelope.verify_signature(public_key_hex)
    has_inputs = bool(envelope.input_hashes)
    version_supported = envelope.envelope_version == "1.0"
    well_formed = _risk_within_bounds(envelope.risk_aggregation)
    return {
        "signature_valid": signature_valid,
        "input_hashes_present": has_inputs,
        "version_supported": version_supported,
        "risk_within_bounds": well_formed,
        "all_checks_passed": all([signature_valid, has_inputs, version_supported, well_formed]),
    }


def _risk_within_bounds(risk_aggregation: dict[str, Any]) -> bool:
    score = risk_aggregation.get("final_risk_score")
    if not isinstance(score, (int, float)):
        return True
    return 0.0 <= float(score) <= 1.0
