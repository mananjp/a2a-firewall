"""Lineage-aware DLP engine.

Moves the product beyond "does this text contain PII?" to
**what should happen to classified data given where it is going and for what
purpose**, with lineage tracking so transformed data stays classified.

Policy model: for a given ``destination`` (what the data is being sent to /
used for) and a given ``data_class``, the engine decides an action:

- ``allow``      — data may flow in its original form.
- ``redact``     — strip PII spans, keep the rest.
- ``tokenize``   — replace PII spans with reversible tokens.
- ``hash``       — replace PII spans with an unreversible digest.
- ``block``      — refuse the data entirely.

A ``DlpPolicy`` rule binds a ``(data_class, destination)`` pair to an action and
an optional ``allowed_purpose``. Purpose limitation is enforced separately: a
flow is only permitted if its declared purpose is in the rule's whitelist.

The engine is deliberately **pure** (no DB, no I/O); the persistence/routing
layer wraps it with the ``DlpPolicy`` table and REST endpoints.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from a2a_firewall.core.dlp_lineage import DerivedDataTracker, stable_digest
from a2a_firewall.core.dlp_tokenizer import (
    PIIOccurrence,
    TokenVault,
    redact_spans,
    tokenize_spans,
)
from a2a_firewall.detection.pii_patterns import PIIMatch, scan_all_pii

# Default actions per data class when no explicit policy rule exists.
_DEFAULT_ACTIONS: dict[str, str] = {
    "financial": "redact",
    "identity": "redact",
    "health": "block",
    "contact": "allow",
    "sensitive": "redact",
}

# A destination allowed by default for a given purpose, used as a base rule
# that explicit tenant rules override.
_DEFAULT_ALLOWED_DESTINATIONS = {"internal", "log", "debug"}


@dataclass
class DlpRule:
    """A tenant DLP policy rule binding class + destination to an action."""

    data_class: str
    destination: str
    action: str  # allow | redact | tokenize | hash | block
    allowed_purposes: list[str] | None = None  # None = any purpose
    enabled: bool = True


@dataclass
class DlpDecision:
    """Outcome of an interference on a text payload."""

    action: str
    blocked: bool
    transformed_text: str | None = None
    findings: list[dict[str, Any]] = field(default_factory=list)
    derived: bool = False
    source_digest: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action,
            "blocked": self.blocked,
            "transformed_text": self.transformed_text,
            "derived": self.derived,
            "source_digest": self.source_digest,
            "findings": self.findings,
        }


class DLPEngine:
    """Evaluate a payload against DLP rules and produce a transformed output."""

    def __init__(
        self,
        rules: list[DlpRule] | None = None,
        token_vault: TokenVault | None = None,
        tracker: DerivedDataTracker | None = None,
    ) -> None:
        self.rules = rules or []
        self.vault = token_vault or TokenVault()
        self.tracker = tracker or DerivedDataTracker()

    # -- policy helpers -----------------------------------------------------
    def _action_for(self, data_class: str, destination: str) -> str | None:
        for rule in self.rules:
            if rule.enabled and rule.data_class == data_class and rule.destination == destination:
                return rule.action
        return _DEFAULT_ACTIONS.get(data_class)

    def _purpose_allowed(self, destination: str, purpose: str | None) -> bool:
        """Enforce purpose limitation for a destination."""
        if destination in _DEFAULT_ALLOWED_DESTINATIONS:
            return True
        matching = [
            r for r in self.rules if r.enabled and r.destination == destination and r.data_class
        ]
        if not matching:
            return True
        return any(
            (r.allowed_purposes is None) or (purpose in r.allowed_purposes) for r in matching
        )

    # -- main entrypoint ----------------------------------------------------
    def inspect(
        self,
        text: str,
        *,
        destination: str = "internal",
        purpose: str | None = None,
        know_pii: bool = True,
    ) -> DlpDecision:
        """Classify and transform ``text`` destined for ``destination``."""
        if not self._purpose_allowed(destination, purpose):
            return DlpDecision(
                action="block",
                blocked=True,
                findings=[
                    {
                        "violation_type": "purpose_limitation",
                        "severity": "high",
                        "description": f"Purpose '{purpose}' not allowed for destination '{destination}'.",
                    }
                ],
            )

        matches = scan_all_pii(text) if know_pii else []
        # Derived-data check first: if this content derives from known-sensitive
        # data, treat it as sensitive even if its raw token no longer matches.
        source_digest = self.tracker.classify(text) if self.tracker else None
        derived = source_digest is not None

        # Collapse overlapping matcher hits to the widest span; only the
        # representative (widest) match's data class drives the action so a
        # card that a phone/aadhaar detector also overlaps never inherits their
        # (weaker) default action.
        representatives = self._representative_matches(text, matches)
        occurrences = [
            PIIOccurrence(value=text[m.start : m.end], start=m.start, end=m.end)
            for m in representatives
        ]

        # Decide the most restrictive action across all representative classes.
        actions_seen = self._evaluate_actions(representatives, destination)
        final_action = _resolve_action(actions_seen)

        if final_action == "block" or (derived and _is_block_when_derived(actions_seen)):
            return DlpDecision(
                action="block",
                blocked=True,
                derived=derived,
                source_digest=source_digest,
                findings=self._findings_for(matches, destination, derived),
            )

        transformed = text
        if final_action in ("redact", "hash", "tokenize") and occurrences:
            if final_action == "redact":
                transformed = redact_spans(text, occurrences)
            elif final_action == "hash":
                transformed = "".join(_replace_with_hashes(text, occurrences))
            else:
                transformed = tokenize_spans(text, occurrences, self.vault)

        # Register the matched raw values as known-sensitive sources so that
        # reformatted derivatives are still classified later.
        derived_from: list[str] = []
        if self.tracker:
            if source_digest:
                derived_from = [source_digest]
            else:
                derived_from = [stable_digest(text[m.start : m.end]) for m in representatives]
            for value in (text[m.start : m.end] for m in representatives):
                self.tracker.observe(value, derived_from)

        return DlpDecision(
            action=final_action,
            blocked=False,
            transformed_text=transformed,
            derived=derived,
            source_digest=source_digest,
            findings=self._findings_for(matches, destination, derived),
        )

    def _representative_matches(self, text: str, matches: list[PIIMatch]) -> list[PIIMatch]:
        """Return the widest non-overlapping matches (one per region).

        Sorting by start then widest-first and greedily skipping overlaps yields
        exactly one representative per contiguous signal region.
        """
        valid = [m for m in matches if m.start >= 0 and m.end > m.start]
        valid.sort(key=lambda m: (m.start, -(m.end - m.start)))
        kept: list[PIIMatch] = []
        for m in valid:
            if any(k.start < m.end and m.start < k.end for k in kept):
                continue
            kept.append(m)
        return kept

    def _evaluate_actions(self, matches: list[PIIMatch], destination: str) -> list[str]:
        data_classes: set[str] = {m.data_class for m in matches}
        return [a for a in (self._action_for(c, destination) for c in data_classes) if a]

    def _findings_for(
        self, matches: list[PIIMatch], destination: str, derived: bool
    ) -> list[dict[str, Any]]:
        findings: list[dict[str, Any]] = []
        if derived:
            findings.append(
                {
                    "violation_type": "sensitive_derived_data",
                    "severity": "medium",
                    "description": "Content derives from previously-classified sensitive data.",
                }
            )
        for m in matches:
            findings.append(
                {
                    "violation_type": f"dlp_{m.data_class}_{m.pattern_type}",
                    "severity": "high" if m.confidence >= 0.85 else "medium",
                    "description": f"{m.pattern_type} ({m.data_class}) destined for '{destination}'.",
                    "details": {
                        "pattern_type": m.pattern_type,
                        "data_class": m.data_class,
                        "span": [m.start, m.end],
                    },
                }
            )
        return findings


def _resolve_action(actions: list[str]) -> str:
    """Merge several per-class actions into one, most restrictive first."""
    if "block" in actions:
        return "block"
    if "redact" in actions:
        return "redact"
    if "tokenize" in actions:
        return "tokenize"
    if "hash" in actions:
        return "hash"
    return "allow"


def _is_block_when_derived(actions: list[str]) -> bool:
    """Whether a derived (freshly-unmatched) payload should still block."""
    # Derived data that resolves to a block destination must never flow.
    return "block" in actions


def _replace_with_hashes(text: str, occurrences: list[PIIOccurrence]) -> list[str]:
    """Render ``text`` with PII spans replaced by hashes (ordered)."""
    ordered = sorted(occurrences, key=lambda o: o.start)
    out: list[str] = []
    cursor = 0
    for occ in ordered:
        if occ.start < cursor:
            if occ.end > cursor:
                # overlap — extend the already-masked region is fine to skip
                continue
            continue
        out.append(text[cursor : occ.start])
        out.append(stable_digest(text[occ.start : occ.end]))
        cursor = occ.end
    out.append(text[cursor:])
    return out
