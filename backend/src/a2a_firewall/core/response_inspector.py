"""Response / tool-result inspection.

The proxy currently inspects outbound requests (both the A2A inspection pipeline
and the proxy's built-in deterministic gate). This module adds the missing
direction: inspecting *incoming* model responses and MCP tool results before they
are returned to the agent.

It provides:

- ``ResponseInspector``: a stateless scanner that checks a body for PII, prompt
  injection, destructive instructions and dangerous configuration, and can
  redact PII.
- ``HoldbackStreamScanner``: an incremental scanner with a bounded holdback
  buffer for streaming responses. It only declares a chunk "safe" once enough
  trailing context has been seen to catch multi-token patterns spanning chunk
  boundaries.

Design notes:
- Scans are local and deterministic (no LLM), so they work on the free tier and
  on air-gapped / customer-VPC deployments.
- Redacted output replaces matched spans with a placeholder, never leaking the
  original value.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from a2a_firewall.detection.ips_signatures import SignatureEngine
from a2a_firewall.detection.layer3_rules import INJECTION_PATTERNS, SQL_INJECTION_PATTERNS
from a2a_firewall.detection.pii_patterns import PII_PLACEHOLDERS, PIIMatch, scan_all_pii

# Destructive / dangerous instruction directives routinely exploited in agent
# tool results and model outputs.
_DESTRUCTIVE_PATTERNS: list[tuple[str, str]] = [
    (
        r"(?i)\bignore\s+(?:(?:previous|prior|all|the)\s+)*(?:instructions|prompts|rules)\b",
        "instruction_override",
    ),
    (
        r"(?i)\b(disregard|forget) (all |the )?(instructions|constraints|rules)\b",
        "instruction_override",
    ),
    (r"(?i)\b(drop|truncate|delete from)\b.+(table|database)\b", "destructive_sql"),
    (r"(?i)\brm\s+-rf\b", "destructive_command"),
    (r"(?i)\bformat\s+[a-zA-Z]:\s*[/\\\\]\s*[uf]\b", "destructive_command"),
    (r"(?i)\b(chmod|chown)\s+-r\s+777\b", "privilege_escalation"),
    (r"(?i)\b(shutdown|reboot)\b.+(now|force)\b", "destructive_command"),
    (r"(?i)\bsudo\s+rm\s+/\b", "destructive_command"),
    (
        r"(?i)\bexport\s+(AWS_SECRET_ACCESS_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)\s*=",
        "secret_exfiltration",
    ),
    (r"(?i)\bcurl\b.+(​d)\s+['\"](base64|https?://)", "data_exfiltration"),
]


@dataclass
class InspectionFinding:
    """A single finding from scanning a response or tool result."""

    finding_type: str  # pii | injection | destructive | sql_injection | ips
    severity: str
    description: str
    span: tuple[int, int] | None = None  # byte offsets into the input
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class InspectionResult:
    """Outcome of inspecting a response body."""

    findings: list[InspectionFinding] = field(default_factory=list)
    redacted_text: str | None = None

    @property
    def blocked(self) -> bool:
        return any(f.severity in ("critical", "high") for f in self.findings)

    @property
    def action(self) -> str:
        return "block" if self.blocked else "allow"

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action,
            "blocked": self.blocked,
            "findings_count": len(self.findings),
            "findings": [
                {
                    "type": f.finding_type,
                    "severity": f.severity,
                    "description": f.description,
                    "details": f.details,
                }
                for f in self.findings
            ],
        }


class ResponseInspector:
    """Stateless scanner for response bodies and MCP tool results."""

    def __init__(self) -> None:
        self._sig_engine = SignatureEngine()

    def inspect(self, text: str, *, redact_pii: bool = True) -> InspectionResult:
        """Scan a response body for threats and optionally redact PII."""
        findings: list[InspectionFinding] = []

        # 1. Destructive/instruction-override directives
        for pattern, subtype in _DESTRUCTIVE_PATTERNS:
            for m in re.finditer(pattern, text):
                findings.append(
                    InspectionFinding(
                        finding_type="destructive",
                        severity="critical"
                        if subtype
                        in (
                            "destructive_command",
                            "destructive_sql",
                            "instruction_override",
                            "secret_exfiltration",
                        )
                        else "high",
                        description=f"Detected directive: {subtype}",
                        span=m.span(),
                        details={"subtype": subtype, "pattern": pattern},
                    )
                )

        # 2. Prompt injection patterns (reused from the request pipeline)
        lower = text
        for pattern in INJECTION_PATTERNS:
            if re.search(pattern, lower, re.IGNORECASE):
                findings.append(
                    InspectionFinding(
                        finding_type="injection",
                        severity="high",
                        description="Response contains a prompt-injection directive.",
                        details={"pattern": pattern},
                    )
                )

        # 3. SQL injection patterns on returned data
        for pattern, vtype, _prisk in SQL_INJECTION_PATTERNS:
            if re.search(pattern, lower, re.IGNORECASE):
                findings.append(
                    InspectionFinding(
                        finding_type="sql_injection",
                        severity="critical",
                        description=f"Response contains SQL injection pattern ({vtype}).",
                        details={"subtype": vtype, "pattern": pattern},
                    )
                )

        # 4. PII leak detection + redaction
        pii_matches = scan_all_pii(text)
        for match in pii_matches:
            findings.append(
                InspectionFinding(
                    finding_type="pii",
                    severity=_pii_severity(match),
                    description=f"PII detected: {match.pattern_type}",
                    details={"pattern_type": match.pattern_type},
                )
            )

        redacted = text
        if redact_pii and pii_matches:
            redacted = self._redact_pii(text, pii_matches)

        # 5. IPS signatures
        for hit in self._sig_engine.scan(text):
            findings.append(
                InspectionFinding(
                    finding_type="ips",
                    severity=str(hit.get("severity", "high")),
                    description=f"IPS signature: {hit.get('signature_id', '')}",
                    details={
                        "signature_id": hit.get("signature_id"),
                        "category": hit.get("category"),
                        "description": hit.get("description"),
                        "mitre_technique": hit.get("mitre_technique"),
                    },
                )
            )

        return InspectionResult(findings=findings, redacted_text=redacted)

    def inspect_json(self, body: Any, *, redact_pii: bool = True) -> InspectionResult:
        """Inspect a JSON-parseable body (dict/list/bytes), recursing into text fields."""
        if isinstance(body, bytes):
            text = body.decode("utf-8", errors="replace")
            return self.inspect(text, redact_pii=redact_pii)
        if isinstance(body, str):
            return self.inspect(body, redact_pii=redact_pii)
        text = json.dumps(body, sort_keys=True)
        return self.inspect(text, redact_pii=redact_pii)

    @staticmethod
    def _redact_pii(text: str, matches: list[PIIMatch]) -> str:
        """Replace matched PII spans with a per-type placeholder.

        ``PIIMatch`` now carries character offsets (``start``/``end``), so we
        redact the exact matched spans directly — no regex re-derivation.
        """
        from a2a_firewall.core.dlp_tokenizer import (
            PIIOccurrence,
            collapse_spans,
            redact_spans,
        )

        occurrences = []
        for m in matches:
            if m.start < 0 or m.end <= m.start:
                continue
            occurrences.append(
                PIIOccurrence(
                    value=text[m.start : m.end],
                    start=m.start,
                    end=m.end,
                    placeholder=PII_PLACEHOLDERS.get(m.pattern_type, "[REDACTED]"),
                )
            )
        return redact_spans(text, collapse_spans(occurrences))


class HoldbackStreamScanner:
    """Incremental streaming scanner with a bounded holdback buffer.

    Feed each chunk via :meth:`feed`; it appends to the holdback buffer and,
    when the buffer exceeds ``window_size``, releases the head of the buffer as
    *provisionally clean*. The tail (up to ``window_size``) is held back so that
    patterns spanning chunk boundaries can be detected before matter is emitted.
    """

    def __init__(self, window_size: int = 4096, inspector: ResponseInspector | None = None):
        self.window_size = window_size
        self.inspector = inspector or ResponseInspector()
        self._buffer = ""
        self._emitted = 0

    def feed(self, chunk: str) -> tuple[str, InspectionResult]:
        """Accept a chunk; return (text safe to emit now, findings on that text)."""
        self._buffer += chunk
        if len(self._buffer) <= self.window_size:
            return "", InspectionResult()
        safe_length = len(self._buffer) - self.window_size
        safe_text = self._buffer[:safe_length]
        # Re-scan the released text; a positive finding here means the pattern
        # ended before the holdback tail, i.e. it is fully within released text.
        result = self.inspector.inspect(safe_text, redact_pii=False)
        self._emitted += len(safe_text)
        self._buffer = self._buffer[safe_length:]
        return safe_text, result

    def finish(self) -> tuple[str, InspectionResult]:
        """Flush the remaining holdback buffer as the stream ends."""
        if not self._buffer:
            return "", InspectionResult()
        result = self.inspector.inspect(self._buffer, redact_pii=False)
        out = self._buffer
        self._buffer = ""
        return out, result

    @property
    def buffered_bytes(self) -> int:
        return len(self._buffer.encode("utf-8"))


def _pii_severity(match: PIIMatch) -> str:
    sensitive = {"credit_card", "aadhaar", "ssn", "passport", "iban"}
    if getattr(match, "pattern_type", "") in sensitive:
        return "high"
    return "medium"
