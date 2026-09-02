"""Response-body scanning hook for the transparent proxy.

Wraps :class:`~a2a_firewall.core.response_inspector.ResponseInspector` into a
convenient helper for the proxy's upstream-response path (both the CONNECT TLS
MITM flow and the MCP HTTP gateway). Returns a decision plus optional redacted
body so the proxy can decide whether to forward a response back to the agent.
"""

from __future__ import annotations

import json
from typing import Any

from a2a_firewall.core.response_inspector import InspectionResult, ResponseInspector


def scan_response_body(
    body: bytes | str | dict[str, Any] | list[Any],
    *,
    redact_pii: bool = True,
    inspector: ResponseInspector | None = None,
) -> dict[str, Any]:
    """Scan a response body and return a normalized decision dict.

    Mirrors the proxy's ``inspect_request`` return shape so callers can use the
    same ``decision == "block"`` branch without special-casing response bodies.
    """
    engine = inspector or ResponseInspector()
    result = engine.inspect_json(body, redact_pii=redact_pii)
    decision = "block" if result.blocked else "allow"
    return {
        "decision": decision,
        "risk_score": 1.0 if result.blocked else 0.0,
        "violations": [
            {
                "layer": "response",
                "violation_type": f"response_{f.finding_type}",
                "severity": f.severity,
                "details": f.details if f.details else {"description": f.description},
            }
            for f in result.findings
        ],
        "findings": result.to_dict(),
        "redacted_body": result.redacted_text,
    }


def redact_response_json(text: str) -> str:
    """Apply the inspector's PII redaction to a JSON string (best effort)."""
    try:
        parsed = json.loads(text)
    except Exception:
        parsed = text
    result: InspectionResult
    result = ResponseInspector().inspect_json(parsed, redact_pii=True)
    return result.redacted_text or text
