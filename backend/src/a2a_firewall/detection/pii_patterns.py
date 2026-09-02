"""PII / PAN / PHI pattern detection helpers.

Reusable regex + validation utilities for detecting sensitive data in task
payloads. Used by compliance rule packs and available as standalone checks
for Layer 3 pattern matching.

Patterns covered:
  - Credit card / PAN numbers (Luhn-validated)
  - Aadhaar numbers (India)
  - SSN (US)
  - Email addresses
  - Phone numbers (international)
  - Medical record numbers / diagnosis codes (ICD-10)
  - Passport numbers
  - IBAN numbers
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass
class PIIMatch:
    """A single PII detection result.

    ``start``/``end`` are the character offsets of the match in the *source*
    text that was scanned, enabling span-accurate redaction/tokenization by
    downstream consumers. ``data_class`` is a coarse classification label used
    by the DLP engine (e.g. ``financial``, ``identity``, ``contact``).
    """

    pattern_type: str  # e.g. "credit_card", "aadhaar", "ssn"
    matched_text: str  # redacted form for logging
    confidence: float  # 0.0-1.0
    framework_tags: list[str]  # which compliance frameworks care about this
    start: int = -1  # char offset of the match in the scanned source
    end: int = -1  # char offset just past the match in the scanned source
    data_class: str = "sensitive"  # coarse DLP classification label


# Placeholder used when a given PII type is redacted inline.
PII_PLACEHOLDERS: dict[str, str] = {
    "credit_card": "[REDACTED:credit_card]",
    "ssn": "[REDACTED:ssn]",
    "passport": "[REDACTED:passport]",
    "aadhaar": "[REDACTED:aadhaar]",
    "iban": "[REDACTED:iban]",
    "email": "[REDACTED:email]",
    "phone": "[REDACTED:phone]",
    "indian_pan": "[REDACTED:indian_pan]",
    "medical_record_number": "[REDACTED:medical_record_number]",
    "icd10_code": "[REDACTED:icd10_code]",
}


# ---------------------------------------------------------------------------
# Luhn check for card number validation
# ---------------------------------------------------------------------------


def _luhn_check(number: str) -> bool:
    """Validate a numeric string using the Luhn algorithm."""
    digits = [int(d) for d in number if d.isdigit()]
    if len(digits) < 13:
        return False
    total = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


# ---------------------------------------------------------------------------
# Pattern definitions
# ---------------------------------------------------------------------------

# Credit card / PAN (13-19 digit numbers that pass Luhn)
_CARD_PATTERN = re.compile(
    r"\b(?:"
    r"4[0-9]{12}(?:[0-9]{3})?"  # Visa
    r"|5[1-5][0-9]{14}"  # Mastercard
    r"|3[47][0-9]{13}"  # Amex
    r"|6(?:011|5[0-9]{2})[0-9]{12}"  # Discover
    r"|3(?:0[0-5]|[68][0-9])[0-9]{11}"  # Diners Club
    r"|(?:2131|1800|35\d{3})\d{11}"  # JCB
    r")\b"
)

# Card number with separators (spaces or dashes)
_CARD_SEPARATED_PATTERN = re.compile(r"\b(\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4})\b")

# Aadhaar (India) — 12 digits, starting with 2-9
_AADHAAR_PATTERN = re.compile(r"\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b")

# US SSN
_SSN_PATTERN = re.compile(r"\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b")

# Email
_EMAIL_PATTERN = re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b")

# Phone (international, with optional +country code)
_PHONE_PATTERN = re.compile(r"(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}\b")

# Medical record number (generic pattern)
_MRN_PATTERN = re.compile(r"\bMRN[\s:#-]*\d{6,12}\b", re.IGNORECASE)

# ICD-10 diagnosis code
_ICD10_PATTERN = re.compile(r"\b[A-TV-Z]\d{2}(?:\.\d{1,4})?\b")

# US Passport
_PASSPORT_US_PATTERN = re.compile(r"\b[A-Z]\d{8}\b")

# IBAN (simplified)
_IBAN_PATTERN = re.compile(r"\b[A-Z]{2}\d{2}\s?[\dA-Z]{4}\s?(?:[\dA-Z]{4}\s?){2,7}[\dA-Z]{1,4}\b")

# Indian PAN (Permanent Account Number)
_INDIAN_PAN_PATTERN = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")


# ---------------------------------------------------------------------------
# Detection functions
# ---------------------------------------------------------------------------


def _redact(text: str, keep_chars: int = 4) -> str:
    """Redact a matched string, keeping only the last N characters."""
    if len(text) <= keep_chars:
        return "***"
    return "*" * (len(text) - keep_chars) + text[-keep_chars:]


def detect_credit_cards(text: str) -> list[PIIMatch]:
    """Detect credit card / PAN numbers with Luhn validation."""
    matches: list[PIIMatch] = []

    # Check unseparated card numbers
    for m in _CARD_PATTERN.finditer(text):
        card = m.group()
        if _luhn_check(card):
            matches.append(
                PIIMatch(
                    pattern_type="credit_card",
                    matched_text=_redact(card),
                    confidence=0.95,
                    framework_tags=["PCI-DSS", "RBI"],
                    start=m.start(),
                    end=m.end(),
                    data_class="financial",
                )
            )

    # Check separated card numbers
    for m in _CARD_SEPARATED_PATTERN.finditer(text):
        card = m.group().replace(" ", "").replace("-", "")
        if _luhn_check(card):
            matches.append(
                PIIMatch(
                    pattern_type="credit_card",
                    matched_text=_redact(card),
                    confidence=0.95,
                    framework_tags=["PCI-DSS", "RBI"],
                    start=m.start(),
                    end=m.end(),
                    data_class="financial",
                )
            )

    return matches


def detect_aadhaar(text: str) -> list[PIIMatch]:
    """Detect Indian Aadhaar numbers."""
    matches: list[PIIMatch] = []
    for m in _AADHAAR_PATTERN.finditer(text):
        num = m.group().replace(" ", "")
        # Basic validation: 12 digits, first digit 2-9
        if len(num) == 12:
            matches.append(
                PIIMatch(
                    pattern_type="aadhaar",
                    matched_text=_redact(num),
                    confidence=0.85,
                    framework_tags=["DPDP"],
                    start=m.start(),
                    end=m.end(),
                    data_class="identity",
                )
            )
    return matches


def detect_ssn(text: str) -> list[PIIMatch]:
    """Detect US Social Security Numbers."""
    return [
        PIIMatch(
            pattern_type="ssn",
            matched_text=_redact(m.group()),
            confidence=0.90,
            framework_tags=["HIPAA", "CCPA"],
            start=m.start(),
            end=m.end(),
            data_class="identity",
        )
        for m in _SSN_PATTERN.finditer(text)
    ]


def detect_email(text: str) -> list[PIIMatch]:
    """Detect email addresses."""
    return [
        PIIMatch(
            pattern_type="email",
            matched_text=_redact(m.group()),
            confidence=0.80,
            framework_tags=["DPDP", "GDPR", "CCPA"],
            start=m.start(),
            end=m.end(),
            data_class="contact",
        )
        for m in _EMAIL_PATTERN.finditer(text)
    ]


def detect_phone(text: str) -> list[PIIMatch]:
    """Detect phone numbers.

    Digit sequences that are Luhn-valid card/PAN numbers are excluded so a
    credit card is never double-reported as a phone (the card detector owns
    those spans).
    """
    matches: list[PIIMatch] = []
    for m in _PHONE_PATTERN.finditer(text):
        digits = re.sub(r"[^0-9]", "", m.group())
        if _looks_like_card(digits):
            continue
        matches.append(
            PIIMatch(
                pattern_type="phone",
                matched_text=_redact(m.group()),
                confidence=0.70,
                framework_tags=["DPDP", "GDPR", "CCPA"],
                start=m.start(),
                end=m.end(),
                data_class="contact",
            )
        )
    return matches


def _looks_like_card(digits: str) -> bool:
    """Whether a digit run appears to be a credit/PAN card (Luhn-valid, 13-19)."""
    if not (13 <= len(digits) <= 19):
        return False
    return _luhn_check(digits)


def detect_medical_records(text: str) -> list[PIIMatch]:
    """Detect medical record numbers and ICD-10 codes."""
    matches: list[PIIMatch] = []
    for m in _MRN_PATTERN.finditer(text):
        matches.append(
            PIIMatch(
                pattern_type="medical_record_number",
                matched_text=_redact(m.group()),
                confidence=0.85,
                framework_tags=["HIPAA"],
                start=m.start(),
                end=m.end(),
                data_class="health",
            )
        )
    for m in _ICD10_PATTERN.finditer(text):
        matches.append(
            PIIMatch(
                pattern_type="icd10_code",
                matched_text=m.group(),
                confidence=0.75,
                framework_tags=["HIPAA"],
                start=m.start(),
                end=m.end(),
                data_class="health",
            )
        )
    return matches


def detect_indian_pan(text: str) -> list[PIIMatch]:
    """Detect Indian PAN (Permanent Account Number)."""
    return [
        PIIMatch(
            pattern_type="indian_pan",
            matched_text=_redact(m.group()),
            confidence=0.85,
            framework_tags=["RBI", "DPDP"],
            start=m.start(),
            end=m.end(),
            data_class="identity",
        )
        for m in _INDIAN_PAN_PATTERN.finditer(text)
    ]


def detect_iban(text: str) -> list[PIIMatch]:
    """Detect IBAN numbers."""
    return [
        PIIMatch(
            pattern_type="iban",
            matched_text=_redact(m.group()),
            confidence=0.80,
            framework_tags=["PCI-DSS", "GDPR"],
            start=m.start(),
            end=m.end(),
            data_class="financial",
        )
        for m in _IBAN_PATTERN.finditer(text)
    ]


# ---------------------------------------------------------------------------
# Aggregate scanner
# ---------------------------------------------------------------------------


def scan_all_pii(text: str) -> list[PIIMatch]:
    """Run all PII detectors and return combined results."""
    results: list[PIIMatch] = []
    results.extend(detect_credit_cards(text))
    results.extend(detect_aadhaar(text))
    results.extend(detect_ssn(text))
    results.extend(detect_email(text))
    results.extend(detect_phone(text))
    results.extend(detect_medical_records(text))
    results.extend(detect_indian_pan(text))
    results.extend(detect_iban(text))
    return results


def scan_for_framework(text: str, framework: str) -> list[PIIMatch]:
    """Scan for PII patterns relevant to a specific compliance framework."""
    all_matches = scan_all_pii(text)
    return [m for m in all_matches if framework in m.framework_tags]


def pii_matches_to_violations(
    matches: list[PIIMatch],
    framework_tag: str | None = None,
) -> list[dict[str, Any]]:
    """Convert PII matches into violation dicts for the detection pipeline."""
    violations: list[dict[str, Any]] = []
    for m in matches:
        violations.append(
            {
                "layer": "rule",
                "violation_type": f"pii_exposure_{m.pattern_type}",
                "severity": "high" if m.confidence >= 0.85 else "medium",
                "details": {
                    "pattern_type": m.pattern_type,
                    "matched_text_redacted": m.matched_text,
                    "confidence": m.confidence,
                    "framework_tags": m.framework_tags,
                    "framework_tag": framework_tag,
                    "data_class": m.data_class,
                    "span": [m.start, m.end],
                },
            }
        )
    return violations
