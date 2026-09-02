"""Unit tests for lineage-aware DLP: tokenizer, lineage, and engine."""

from __future__ import annotations

from a2a_firewall.core.dlp_engine import DLPEngine, DlpRule
from a2a_firewall.core.dlp_lineage import (
    DerivedDataTracker,
    is_sensitive_digest_derivative,
    stable_digest,
)
from a2a_firewall.core.dlp_tokenizer import (
    PIIOccurrence,
    TokenVault,
    collapse_spans,
    redact_spans,
    tokenize_spans,
)

CARD = "4111 1111 1111 1111"
EMAIL = "user@somedomain.example"


CARD_RULE = DlpRule(data_class="financial", destination="external", action="redact")
BLOCK_HEALTH = DlpRule(data_class="health", destination="internal", action="block")
ALLOW_CONTACT = DlpRule(data_class="contact", destination="internal", action="allow")
EHR_RULE = DlpRule(
    data_class="health",
    destination="research",
    action="redact",
    allowed_purposes=["clinical"],
)


class TestDlpTokenizer:
    def test_redact_spans_replaces_hit(self):
        text = f"card {CARD}"
        occ = PIIOccurrence(value=CARD, start=5, end=len(text))
        out = redact_spans(text, [occ], placeholder="[REDACTED:cc]")
        assert "[REDACTED:cc]" in out and CARD not in out

    def test_redact_spans_handles_empty(self):
        assert redact_spans("hello", []) == "hello"

    def test_collapse_keeps_widest(self):
        occs = [
            PIIOccurrence(value="1111", start=5, end=9),
            PIIOccurrence(value=CARD, start=5, end=24),
        ]
        kept = collapse_spans(occs)
        assert len(kept) == 1
        assert kept[0].value == CARD

    def test_token_and_detoken_roundtrip(self):
        vault = TokenVault()
        tok = vault.tokenize(EMAIL)
        assert tok.startswith("tok_")
        assert EMAIL not in tok
        assert vault.detokenize(tok) == EMAIL
        assert vault.tokenize(EMAIL) == tok

    def test_tokenize_spans_replaces_and_resolves(self):
        vault = TokenVault()
        text = f"mail {EMAIL}"
        occ = PIIOccurrence(value=EMAIL, start=5, end=len(text))
        out = tokenize_spans(text, [occ], vault)
        assert EMAIL not in out
        assert vault.detokenize(out.split("mail ")[1]) == EMAIL

    def test_export_rehydrate(self):
        vault = TokenVault()
        tok = vault.tokenize(EMAIL)
        restored = TokenVault.from_export(vault.export())
        assert restored.detokenize(tok) == EMAIL


class TestDlpLineage:
    def test_stable_digest_normalizes(self):
        assert stable_digest("  ABC  123 ") == stable_digest("abc 123")

    def test_derivative_detected_after_reformat(self):
        d = stable_digest(EMAIL)
        assert is_sensitive_digest_derivative(f"token {EMAIL} here", [d]) == d

    def test_prose_not_derivative(self):
        d = stable_digest(EMAIL)
        assert is_sensitive_digest_derivative("quarterly revenue is up 12 pct", [d]) is None

    def test_tracker_classifies_transformed_value(self):
        tracker = DerivedDataTracker()
        tracker.register_sensitive(EMAIL)
        assert tracker.classify(f"raw {EMAIL}") is not None


class TestDLPEngine:
    def test_allow_for_internal_contact(self):
        engine = DLPEngine(rules=[ALLOW_CONTACT])
        d = engine.inspect("contact alice@example.test", destination="internal")
        assert not d.blocked

    def test_redact_financial_to_external(self):
        engine = DLPEngine(rules=[CARD_RULE])
        d = engine.inspect(f"pay with {CARD}", destination="external")
        assert d.action == "redact"
        assert not d.blocked
        assert CARD not in d.transformed_text

    def test_block_health_to_internal(self):
        engine = DLPEngine(rules=[BLOCK_HEALTH])
        d = engine.inspect("patient record MRN: 123456789", destination="internal")
        assert d.blocked
        assert d.action == "block"

    def test_purpose_limitation_blocks_disallowed(self):
        engine = DLPEngine(rules=[EHR_RULE])
        d = engine.inspect(
            "patient record MRN: 123456789",
            destination="research",
            purpose="marketing",
        )
        assert d.blocked
        assert any(f["violation_type"] == "purpose_limitation" for f in d.findings)

    def test_purpose_limitation_allows_allowed(self):
        engine = DLPEngine(rules=[EHR_RULE])
        d = engine.inspect(
            "patient record MRN: 123456789",
            destination="research",
            purpose="clinical",
        )
        assert d.action == "redact"

    def test_tokenize_mode_mints_reversible_tokens(self):
        engine = DLPEngine(
            rules=[DlpRule(data_class="identity", destination="log", action="tokenize")]
        )
        d = engine.inspect("ssn 123-45-6789", destination="log")
        assert d.action == "tokenize"
        assert "123-45-6789" not in (d.transformed_text or "")

    def test_hash_mode_irreversible(self):
        engine = DLPEngine(
            rules=[DlpRule(data_class="financial", destination="analytics", action="hash")]
        )
        d = engine.inspect(f"card {CARD}", destination="analytics")
        assert d.action == "hash"
        assert CARD not in (d.transformed_text or "")

    def test_persisted_lineage_tracks_derived(self):
        engine = DLPEngine(rules=[CARD_RULE])
        engine.inspect(f"mail {EMAIL}", destination="external")
        d2 = engine.inspect(
            "forwarded mail user@somedomain.example for review", destination="external"
        )
        assert d2.derived

    def test_engine_tracker_is_populated_with_sources(self):
        engine = DLPEngine(rules=[CARD_RULE])
        engine.inspect(f"mail {EMAIL}", destination="external")
        export = engine.tracker.export()
        assert len(export) > 0

    def test_no_pii_allows(self):
        engine = DLPEngine(rules=[CARD_RULE])
        d = engine.inspect("no secrets here", destination="external")
        assert d.action == "allow"
        assert not d.blocked

    def test_most_restrictive_wins_across_classes(self):
        engine = DLPEngine(rules=[BLOCK_HEALTH, CARD_RULE])
        d = engine.inspect(
            "card 4111 1111 1111 1111 and MRN 999888777",
            destination="internal",
        )
        assert d.blocked


class TestCollapseInEngine:
    def test_overlapping_phone_and_card_no_double_mask(self):
        engine = DLPEngine(
            rules=[DlpRule(data_class="financial", destination="x", action="redact")]
        )
        d = engine.inspect(f"card {CARD}", destination="x")
        assert d.action == "redact"
        assert CARD not in (d.transformed_text or "")
