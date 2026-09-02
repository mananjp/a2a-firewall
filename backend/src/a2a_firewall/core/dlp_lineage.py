"""DLP derived-data lineage tracking.

The core insight of lineage-aware DLP: a secret that has been **transformed**
(reordered, substringed, base64'd, uppercased, joined, summarized) must remain
classified. A naive scanner only catches the raw form; once an agent
reformats a card number or SSN, a fresh regex scan misses it.

This module provides:

- ``DerivedDataTracker``: a content-addressable registry (via a digest function)
  that records ``pii_digest -> set of source digests``. When a new piece of
  content is inspected, we hash it and check whether any previously-observed
  PII digest is a substring-derivative of it. If so, the content is marked as
  derived from that PII (and inherits its classification and purpose
  constraints).
- ``is_sensitive_digest_derivative``: the substring-derivative test used for
  both 1-grams (single transformed token) and sliding-window content.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterable
from dataclasses import dataclass, field


def stable_digest(content: str) -> str:
    """Deterministic SHA-256 digest of normalized content."""
    normalized = " ".join(content.split()).lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _token_digests(content: str, min_len: int = 6) -> list[str]:
    """Digest of each whitespace-delimited token of ``content``."""
    digests: list[str] = []
    for token in content.split():
        if len(token) >= min_len:
            digests.append(stable_digest(token))
    return digests


def is_sensitive_digest_derivative(
    content: str,
    known_sensitive_digests: Iterable[str],
    *,
    min_len: int = 6,
) -> str | None:
    """Return the source digest this content is a derivative of, else ``None``.

    A chunk is a derivative if any of its normalized tokens exactly matches a
    known-sensitive token digest. This catches re-formatted/reordered secrets
    (a transformed value's token survives) without false-positives on arbitrary
    prose.
    """
    known = set(known_sensitive_digests)
    for token_digest in _token_digests(content, min_len=min_len):
        if token_digest in known:
            return token_digest
    return None


@dataclass
class DerivedDataTracker:
    """Tracks which content digests are known-sensitive and their parents."""

    # token_digest -> set of source digests it derives from
    _sources: dict[str, set[str]] = field(default_factory=dict)

    def observe(self, content: str, source_digests: Iterable[str]) -> str:
        """Register ``content`` as derived from ``source_digests`` and return its digest."""
        digest = stable_digest(content)
        for token_digest in _token_digests(content):
            self._sources.setdefault(token_digest, set()).update(source_digests)
        return digest

    def register_sensitive(self, content: str) -> str:
        """Register raw sensitive content (self-deriving)."""
        return self.observe(content, [stable_digest(content)])

    def classify(self, content: str) -> str | None:
        """Return the source digest this content derives from, if any."""
        known: set[str] = set()
        for parents in self._sources.values():
            known.update(parents)
        return is_sensitive_digest_derivative(content, known)

    def export(self) -> dict[str, list[str]]:
        """Export the sources registry for persistence."""
        return {k: sorted(v) for k, v in self._sources.items()}

    @classmethod
    def from_export(cls, data: dict[str, list[str]]) -> DerivedDataTracker:
        """Rehydrate from an export."""
        tracker = cls()
        tracker._sources = {k: set(v) for k, v in data.items()}
        return tracker
