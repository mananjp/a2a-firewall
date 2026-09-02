"""Memory / RAG content scanner.

A firewall layer that inspects content an agent writes to (or retrieves from)
shared memory / a RAG backing store. Shared memory is a **persistent injection
vector**: text stored today is blindly re-fed to the same or other agents on
retrieval tomorrow, so a single poisoned chunk can hijack the whole memory.

This scanner (deliberately local and deterministic, no LLM) flags:

- **Persistent prompt injection**: text that instructs agents to ignore their
  instructions / overrides system prompts — the highest-risk memory payload,
  because it is replayed on every retrieval.
- **Secret / credential storage probes**: attempts to persist API keys, tokens,
  or passwords into shared memory.
- **Sensitive data leakage**: PII persisted into memory, where it violates the
  "no sensitive data in shared memory" policy (and would be replayed later).
- **Destructive / exfiltration directives** embedded in otherwise benign text.

The result classifies each chunk as ``allow``, ``redact`` (strip PII and store
the remainder), or ``block`` (do not store at all), and records a provenance
report for the audit trail.

It is intentionally pure (no DB, no I/O) so the rules are unit-testable in
isolation; the persistence/API layer wraps it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from a2a_firewall.detection.layer3_rules import INJECTION_PATTERNS
from a2a_firewall.detection.pii_patterns import PII_PLACEHOLDERS, PIIMatch, scan_all_pii

# Directives that try to make the *next* reader of a memory chunk deviate from
# its own instructions. These are the classic "persistent memory poisoning"
# templates observed in RAG attacks.
_MEMORY_INJECTION_PATTERNS: list[tuple[str, str]] = [
    (
        r"(?i)\bignore\s+(?:(?:previous|prior|all|the|your)\s+)*(?:instructions|prompts|system\s+prompt)\b",
        "memory_instruction_override",
    ),
    (r"(?i)\bwhen\s+retrieved\s+as\s+context\b", "memory_future_override"),
    (
        r"(?i)\b(?:always|remember\s+to)\s+(?:elevate|grant|escalate|bypass)\b",
        "memory_privilege_probe",
    ),
    (
        r"(?i)\b(?:do not|don't)\s+(?:tell|mention|reveal)\s+(?:the|this)\s+(?:user|human)\b",
        "memory_hide_from_user",
    ),
    (r"(?i)\b(?:pretend|act|imagine)\s+(?:as|you are|to be)\b", "memory_persona_override"),
    (
        r"(?i)\b(?:disable|turn off|deactivate)\s+(?:the\s+)?(?:firewall|guardrail|safety|filter)\b",
        "memory_guardrail_bypass",
    ),
]

# Directives trying to persist secrets or attack machinery into memory.
_SECRET_STORAGE_PATTERNS: list[tuple[str, str]] = [
    (
        r"(?i)\b(?:api[_ -]?key|secret[_ -]?key|access[_ -]?key|password|passwd)\s*[:=]\s*['\"][A-Za-z0-9_\-]{12,}['\"]",
        "secret_persisted",
    ),
    (
        r"(?i)\b(save|store|remember|record)\s+(this\s+)?(api key|password|token|secret)\b",
        "secret_probe",
    ),
    (r"(?i)\bexport\s+(AWS_SECRET_ACCESS_KEY|OPENAI_API_KEY)\s*=", "secret_exfiltration"),
]

# Sensitive PII classes we refuse to persist into shared memory regardless of
# action; any other PII causes redaction.
_SENSITIVE_PII = {"credit_card", "aadhaar", "ssn", "passport", "iban"}


@dataclass
class MemoryFinding:
    """A single threat finding on a memory chunk."""

    finding_type: str  # injection | secret | pii | destructive
    severity: str  # critical | high | medium
    description: str
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class MemoryInspection:
    """Outcome of inspecting a memory chunk before it is stored."""

    chunk: str
    findings: list[MemoryFinding] = field(default_factory=list)
    redacted_chunk: str | None = None
    content_hash: str = ""

    @property
    def sensitive_pii(self) -> bool:
        return any(f.finding_type == "pii" and f.severity == "critical" for f in self.findings)

    @property
    def blocked(self) -> bool:
        return any(f.severity in ("critical", "high") for f in self.findings)

    @property
    def action(self) -> str:
        """One of ``allow``, ``redact``, or ``block``."""
        if self.blocked:
            return "block"
        if self.findings:  # medium-severity PII → redact
            return "redact"
        return "allow"

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action,
            "blocked": self.blocked,
            "sensitive_pii": self.sensitive_pii,
            "content_hash": self.content_hash,
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


class MemoryScanner:
    """Stateless scanner for content destined for shared memory / RAG stores."""

    def __init__(self) -> None:
        pass

    def inspect(self, chunk: str, *, redact_pii: bool = True) -> MemoryInspection:
        """Scan a chunk; returns a classification with findings and redacted text."""
        findings: list[MemoryFinding] = []

        for pattern, subtype in _MEMORY_INJECTION_PATTERNS:
            if re.search(pattern, chunk, re.IGNORECASE):
                findings.append(
                    MemoryFinding(
                        finding_type="injection",
                        severity="critical",
                        description=f"Persistent memory injection directive: {subtype}",
                        details={"subtype": subtype, "pattern": pattern},
                    )
                )

        for pattern, subtype in _SECRET_STORAGE_PATTERNS:
            if re.search(pattern, chunk, re.IGNORECASE):
                findings.append(
                    MemoryFinding(
                        finding_type="secret",
                        severity="critical",
                        description=f"Secret storing probe detected: {subtype}",
                        details={"subtype": subtype, "pattern": pattern},
                    )
                )

        for pattern in INJECTION_PATTERNS:
            if re.search(pattern, chunk, re.IGNORECASE):
                findings.append(
                    MemoryFinding(
                        finding_type="injection",
                        severity="high",
                        description="Chunk contains a prompt-injection directive.",
                        details={"pattern": pattern},
                    )
                )

        pii_matches = scan_all_pii(chunk)
        for match in pii_matches:
            severity = "critical" if match.pattern_type in _SENSITIVE_PII else "medium"
            findings.append(
                MemoryFinding(
                    finding_type="pii",
                    severity=severity,
                    description=f"Sensitive data in memory: {match.pattern_type}",
                    details={"pattern_type": match.pattern_type},
                )
            )

        redacted: str | None = None
        if redact_pii and pii_matches:
            redacted = self._redact_pii(chunk, pii_matches)

        content_hash = hash_memory(redacted if redacted is not None else chunk)
        return MemoryInspection(
            chunk=chunk,
            findings=findings,
            redacted_chunk=redacted,
            content_hash=content_hash,
        )

    def _redact_pii(self, text: str, matches: list[PIIMatch]) -> str:
        """Replace sensitive PII spans with a per-type placeholder.

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


def hash_memory(content: str) -> str:
    """Deterministic SHA-256 content hash for dedup / tamper evidence."""
    import hashlib

    return hashlib.sha256(content.encode("utf-8")).hexdigest()
