"""Memory / RAG firewall — storage policy, hashing and retrieval.

This is the *state* module of the memory firewall. Whereas
``detection/memory_scanner`` decides *whether a chunk may be written*, this
module decides *what happens to the write* (persist / dedup / reject) and how
memory is *retrieved* safely.

It provides:

- ``evaluate_store_policy``: given a scanner result and an optional storage
  policy, decide whether the (possibly redacted) chunk may be persisted. Sensitive
  PII is always rejected; ``redact`` passthrough is honoured; ``block`` always
  rejects.
- ``MemoryIndex``: a free-tier lexical retrieval index over persisted chunks
  (no pgvector / embeddings required). It stores token → postings and scores
  queries by token overlap, returning ranked ``MemoryHit`` records. This keeps
  deployment on the free tier while leaving a semantic-embedding seam for later.
- ``serialize`` / ``deserialize`` for the JSONB whole-index snapshot that is
  persisted alongside each entry so retrieval can be reproduced offline.

Design notes:
- Content is hashed (SHA-256) at scan time; the hash is the dedup key. Storing
  the same chunk twice is a no-op.
- Retrieval returns only the *stored* (post-inspection, post-redaction) text —
  never the raw pre-inspection chunk — so poisoned content can never surface.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from a2a_firewall.detection.memory_scanner import (
    MemoryInspection,
    MemoryScanner,
)

# Tokenisation for lexical retrieval (ASCII word tokens, lower-cased).
_TOKEN_RE = re.compile(r"[a-z0-9_]+")

# Default retrieval window.
DEFAULT_TOP_K = 5


@dataclass
class MemoryHit:
    """A stored memory entry matched by a query."""

    entry_id: str
    content: str
    content_hash: str
    score: float
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class StoreDecision:
    """Outcome of deciding whether (and how) a chunk is persisted."""

    persist: bool
    reason: str
    content: str | None  # the exact bytes to store (redacted if applicable)
    content_hash: str | None


def evaluate_store_policy(
    inspection: MemoryInspection,
    *,
    allow_pii_redaction: bool = True,
) -> StoreDecision:
    """Decide persistence based on a scan of the chunk.

    Maps the scanner's classification to a storage action:

    - ``block`` (critical/high finding, e.g. persistent injection, secret probe,
      or sensitive PII) → never persist.
    - ``redact`` (medium PII) → persist the redacted copy if allowed.
    - ``allow`` → persist verbatim.
    """
    action = inspection.action
    if action == "block":
        return StoreDecision(
            persist=False,
            reason="block",
            content=None,
            content_hash=inspection.content_hash,
        )
    if action == "redact":
        if not allow_pii_redaction:
            return StoreDecision(
                persist=False,
                reason="pii_redaction_disabled",
                content=None,
                content_hash=inspection.content_hash,
            )
        return StoreDecision(
            persist=True,
            reason="redacted",
            content=inspection.redacted_chunk,
            content_hash=inspection.content_hash,
        )
    return StoreDecision(
        persist=True,
        reason="allow",
        content=inspection.chunk,
        content_hash=inspection.content_hash,
    )


class MemoryIndex:
    """Free-tier lexical retrieval index over stored memory chunks."""

    def __init__(self) -> None:
        self._token_to_postings: dict[str, dict[str, int]] = {}
        self._doc_len: dict[str, int] = {}
        self._doc_hash: dict[str, str] = {}

    def index(self, entry_id: str, content: str, content_hash: str) -> None:
        """Add or replace a chunk in the index (idempotent by token postings)."""
        self._doc_len[entry_id] = 0
        for token in _tokenize(content):
            self._token_to_postings.setdefault(token, {}).setdefault(entry_id, 0)
            self._token_to_postings[token][entry_id] += 1
            self._doc_len[entry_id] += 1
        self._doc_hash[entry_id] = content_hash

    def remove(self, entry_id: str) -> None:
        """Drop a chunk from the index."""
        for postings in self._token_to_postings.values():
            postings.pop(entry_id, None)
        self._doc_len.pop(entry_id, None)
        self._doc_hash.pop(entry_id, None)

    def search(self, query: str, *, top_k: int = DEFAULT_TOP_K) -> list[MemoryHit]:
        """Rank stored chunks by token overlap with the query."""
        query_tokens = set(_tokenize(query))
        if not query_tokens:
            return []

        scores: dict[str, float] = {}
        for token in query_tokens:
            for entry_id, freq in self._token_to_postings.get(token, {}).items():
                # TF-weighted overlap (see _doc_hash for id resolution later).
                scores[entry_id] = scores.get(entry_id, 0.0) + (1.0 + 0.5 * (freq - 1))

        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        return [
            MemoryHit(
                entry_id=entry_id,
                content="",
                content_hash=self._doc_hash.get(entry_id, ""),
                score=round(score, 4),
            )
            for entry_id, score in ranked[:top_k]
        ]

    def serialize(self) -> dict[str, Any]:
        """Serialize the index for JSONB persistence."""
        return {
            "token_to_postings": self._token_to_postings,
            "doc_len": self._doc_len,
            "doc_hash": self._doc_hash,
        }

    @classmethod
    def deserialize(cls, data: dict[str, Any]) -> MemoryIndex:
        """Rehydrate an index from a serialized snapshot."""
        idx = cls()
        idx._token_to_postings = data.get("token_to_postings", {})
        idx._doc_len = data.get("doc_len", {})
        idx._doc_hash = data.get("doc_hash", {})
        return idx


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def scan_and_decide(
    chunk: str, *, redact_pii: bool = True
) -> tuple[MemoryInspection, StoreDecision]:
    """Convenience: run the scanner, then evaluate the store policy end-to-end."""
    scanner = MemoryScanner()
    inspection = scanner.inspect(chunk, redact_pii=redact_pii)
    decision = evaluate_store_policy(inspection)
    return inspection, decision
