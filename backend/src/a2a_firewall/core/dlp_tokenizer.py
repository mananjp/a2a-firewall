"""DLP tokenization and redaction primitives.

Provides span-accurate redaction and reversible pseudonymization of sensitive
data.

- ``redact_spans`` replaces matched spans in a source string with a
  placeholder, using the character offsets carried by ``PIIMatch`` (no regex
  re-derivation needed — the offsets come straight from the detector).
- ``Tokenizer`` persists an in-memory (per-process) reversible mapping between
  a sensitive value and a format-preserving ``tok_<n>`` token. The mapping can
  be exported/reloaded so a token can be resolved back to the value by an
  authorized party, while the persisted text itself carries no PII.

Design notes:
- Redaction is lossy and irreversible; tokenization is reversible but the
  token NEVER contains the value (no FPE — the vault mapping is external).
- The vault is intentionally an in-memory registry in this module; a
  production deployment would back it with an encrypted column store.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field


@dataclass
class PIIOccurrence:
    """A sensitive value located in a source string at a known span."""

    value: str
    start: int
    end: int
    placeholder: str | None = None


@dataclass
class TokenVault:
    """Reversible mapping between sensitive values and opaque tokens."""

    _value_to_token: dict[str, str] = field(default_factory=dict)
    _token_to_value: dict[str, str] = field(default_factory=dict)
    _counter: int = 0

    def tokenize(self, value: str) -> str:
        """Return a stable token for ``value``, minting one if unseen."""
        if value in self._value_to_token:
            return self._value_to_token[value]
        self._counter += 1
        token = f"tok_{self._counter}"
        self._value_to_token[value] = token
        self._token_to_value[token] = value
        return token

    def detokenize(self, token: str) -> str | None:
        """Resolve a token back to its original value (or ``None``)."""
        return self._token_to_value.get(token)

    def export(self) -> dict[str, str]:
        """Export the token → value mapping for persistence/restore."""
        return dict(self._token_to_value)

    @classmethod
    def from_export(cls, mapping: dict[str, str]) -> TokenVault:
        """Rehydrate a vault from an exported mapping."""
        vault = cls()
        vault._token_to_value = dict(mapping)
        vault._value_to_token = {v: k for k, v in mapping.items()}
        vault._counter = len(mapping)
        return vault


def collapse_spans(occurrences: Iterable[PIIOccurrence]) -> list[PIIOccurrence]:
    """Resolve overlapping spans by keeping the widest one per region.

    A narrower detector match that overlaps a wider one (e.g. a partial phone
    match inside a full card number) is dropped so the wider, more-specific
    match is redacted/tokenized cleanly.
    """
    ordered = sorted(occurrences, key=lambda o: (o.start, -(o.end - o.start)))
    kept: list[PIIOccurrence] = []
    for occ in ordered:
        if any(k.start < occ.end and occ.start < k.end for k in kept):
            continue
        kept.append(occ)
    return kept


def redact_spans(
    text: str,
    spans: Iterable[PIIOccurrence],
    placeholder: str = "[REDACTED]",
) -> str:
    """Replace every given span with ``placeholder`` (or per-occurrence one).

    Overlapping spans are deduplicated by masking the union of covered
    character indexes, so a badly-overlapping detector never double-masks.
    """
    occs = list(spans)
    if not occs:
        return text
    masked: dict[int, str] = {}
    for occ in occs:
        label = occ.placeholder or placeholder
        for i in range(max(0, occ.start), max(0, min(occ.end, len(text)))):
            masked[i] = label
    if not masked:
        return text
    out: list[str] = []
    i = 0
    while i < len(text):
        if i in masked:
            label = masked[i]
            out.append(label)
            while i in masked and masked[i] == label:
                i += 1
        else:
            out.append(text[i])
            i += 1
    return "".join(out)


def tokenize_spans(text: str, occurrences: Iterable[PIIOccurrence], vault: TokenVault) -> str:
    """Replace spans with reversible tokens from ``vault`` (source-order aware).

    Spans are applied from left to right; overlapping spans are resolved by
    keeping the widest covering token (rare in practice).
    """
    ordered = sorted(occurrences, key=lambda o: o.start)
    if not ordered:
        return text
    out: list[str] = []
    cursor = 0
    for occ in ordered:
        if occ.end <= cursor or occ.start < cursor:
            if occ.end > cursor:
                # Partial overlap — keep the longer one already emitted; skip.
                continue
            continue
        out.append(text[cursor : occ.start])
        out.append(vault.tokenize(occ.value))
        cursor = occ.end
    out.append(text[cursor:])
    return "".join(out)
