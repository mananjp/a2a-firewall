"""IDS/IPS signature-based detection engine.

A versioned, categorized signature database similar to Snort/Suricata rule
structure. Sits alongside (not replacing) layer3_rules.py, giving the project
a clear "signature-based IPS layer" vs "heuristic rule layer" distinction.

Signatures define a pattern, severity, and an action:
  - block:             block the task (current default IDS behaviour)
  - block_and_suspend: block AND auto-suspend the sending agent (IPS mode)
  - alert:             log but don't block (monitor mode)
"""

from __future__ import annotations

import logging
import re
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from a2a_firewall.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Signature data model
# ---------------------------------------------------------------------------


@dataclass
class IPSSignature:
    """A single IPS detection signature."""

    id: str  # e.g. "SIG-1001"
    category: str  # prompt_injection | sql_injection | data_exfil | ...
    pattern: str  # regex pattern
    severity: str  # critical | high | medium | low
    action: str = "block"  # block | block_and_suspend | alert
    description: str = ""
    enabled: bool = True
    mitre_technique: str = ""  # e.g. "T1059.001"

    # Runtime stats
    hit_count: int = field(default=0, repr=False)

    def matches(self, text: str) -> bool:
        """Test whether the signature pattern matches the given text."""
        try:
            return bool(re.search(self.pattern, text, re.IGNORECASE))
        except re.error:
            logger.warning("Invalid regex in signature %s: %s", self.id, self.pattern)
            return False


# ---------------------------------------------------------------------------
# Built-in signature database
# ---------------------------------------------------------------------------

BUILTIN_SIGNATURES: list[IPSSignature] = [
    # ── Prompt Injection signatures ──
    IPSSignature(
        id="SIG-1001",
        category="prompt_injection",
        pattern=r"ignore (all )?(previous|prior) instructions",
        severity="critical",
        action="block_and_suspend",
        description="Classic prompt injection: ignore previous instructions",
        mitre_technique="T1059",
    ),
    IPSSignature(
        id="SIG-1002",
        category="prompt_injection",
        pattern=r"you are now (a |an )?(?!going|ready|connected)",
        severity="high",
        action="block",
        description="Identity hijack: role reassignment attempt",
        mitre_technique="T1059",
    ),
    IPSSignature(
        id="SIG-1003",
        category="prompt_injection",
        pattern=r"(?:system|admin|root)\s*(?:prompt|override|access|mode)\s*:",
        severity="critical",
        action="block_and_suspend",
        description="System prompt override attempt",
        mitre_technique="T1059",
    ),
    IPSSignature(
        id="SIG-1004",
        category="prompt_injection",
        pattern=r"(?:forget|erase|clear|wipe)\s+(?:your|all|every)\s+(?:memory|context|instructions|training)",
        severity="critical",
        action="block_and_suspend",
        description="Memory wipe / context erasure attempt",
        mitre_technique="T1059",
    ),
    IPSSignature(
        id="SIG-1005",
        category="prompt_injection",
        pattern=r"(?:pretend|imagine|roleplay|act)\s+(?:you(?:'re| are)\s+)?(?:an? )?(?:unrestricted|jailbroken|uncensored|unfiltered)",
        severity="critical",
        action="block_and_suspend",
        description="Jailbreak roleplay attempt",
        mitre_technique="T1059",
    ),

    # ── Data Exfiltration signatures ──
    IPSSignature(
        id="SIG-2001",
        category="data_exfiltration",
        pattern=r"(?:send|transmit|forward|exfil|upload|post)\s+(?:all|the|this)?\s*(?:data|information|records|credentials|keys|tokens|secrets)\s+(?:to|via|through|using)",
        severity="critical",
        action="block_and_suspend",
        description="Data exfiltration instruction detected",
        mitre_technique="T1041",
    ),
    IPSSignature(
        id="SIG-2002",
        category="data_exfiltration",
        pattern=r"(?:base64|hex|encode|encrypt)\s+(?:and\s+)?(?:send|transmit|embed)",
        severity="high",
        action="block",
        description="Encoded data exfiltration attempt",
        mitre_technique="T1132",
    ),

    # ── Privilege Escalation signatures ──
    IPSSignature(
        id="SIG-3001",
        category="privilege_escalation",
        pattern=r"(?:grant|give|assign|escalate)\s+(?:me|yourself|this agent)\s+(?:admin|root|superuser|elevated|all)\s+(?:access|privileges|permissions|rights)",
        severity="critical",
        action="block_and_suspend",
        description="Privilege escalation attempt",
        mitre_technique="T1078",
    ),
    IPSSignature(
        id="SIG-3002",
        category="privilege_escalation",
        pattern=r"(?:bypass|skip|ignore|disable)\s+(?:all\s+)?(?:security|auth|authentication|authorization|verification|validation|checks|controls|firewall)",
        severity="critical",
        action="block_and_suspend",
        description="Security bypass instruction",
        mitre_technique="T1562",
    ),

    # ── Confused Deputy signatures ──
    IPSSignature(
        id="SIG-4001",
        category="confused_deputy",
        pattern=r"(?:on behalf of|acting as|impersonating|representing|posing as)\s+(?:the\s+)?(?:admin|administrator|system|root|owner)",
        severity="high",
        action="block",
        description="Confused deputy / impersonation attempt",
        mitre_technique="T1134",
    ),

    # ── Command Injection signatures ──
    IPSSignature(
        id="SIG-5001",
        category="command_injection",
        pattern=r"(?:execute|run|eval|exec)\s*\(\s*['\"].*(?:;|&&|\|\||\|)\s*(?:rm|del|drop|shutdown|kill|wget|curl|nc\b)",
        severity="critical",
        action="block_and_suspend",
        description="Command injection with dangerous operations",
        mitre_technique="T1059",
    ),
    IPSSignature(
        id="SIG-5002",
        category="command_injection",
        pattern=r"(?:subprocess|os\.system|os\.popen|eval|exec)\s*\(",
        severity="high",
        action="block",
        description="Direct code execution function invocation",
        mitre_technique="T1059",
    ),

    # ── Social Engineering signatures ──
    IPSSignature(
        id="SIG-6001",
        category="social_engineering",
        pattern=r"(?:don'?t|do not)\s+(?:tell|inform|alert|notify|log|report)\s+(?:anyone|the user|the admin|security|the owner)",
        severity="critical",
        action="block_and_suspend",
        description="Stealth instruction — hide activity from human oversight",
        mitre_technique="T1564",
    ),
]


# ---------------------------------------------------------------------------
# Signature engine
# ---------------------------------------------------------------------------


class SignatureEngine:
    """IPS signature matching engine with hit-count tracking."""

    def __init__(self) -> None:
        self._signatures: list[IPSSignature] = list(BUILTIN_SIGNATURES)
        self._lock = threading.Lock()

    @property
    def signatures(self) -> list[IPSSignature]:
        with self._lock:
            return list(self._signatures)

    def add_signature(self, sig: IPSSignature) -> None:
        with self._lock:
            self._signatures.append(sig)

    def load_signatures(self, sigs: list[IPSSignature]) -> None:
        """Replace all signatures with a new set."""
        with self._lock:
            self._signatures = list(sigs)

    def scan(self, text: str, ips_mode: str = "block") -> list[dict[str, Any]]:
        """Scan text against all enabled signatures.

        Args:
            text: The payload text to scan.
            ips_mode: The workspace IPS action mode:
                      "monitor" — log only, override all actions to "alert"
                      "block" — standard blocking (default)
                      "block_and_suspend" — full IPS with auto-suspend

        Returns:
            List of match dicts with signature info and effective action.
        """
        matches: list[dict[str, Any]] = []

        with self._lock:
            for sig in self._signatures:
                if not sig.enabled:
                    continue
                if sig.matches(text):
                    sig.hit_count += 1

                    # Determine effective action based on IPS mode
                    if ips_mode == "monitor":
                        effective_action = "alert"
                    elif ips_mode == "block":
                        effective_action = "block" if sig.action != "alert" else "alert"
                    else:  # block_and_suspend
                        effective_action = sig.action

                    matches.append(
                        {
                            "signature_id": sig.id,
                            "category": sig.category,
                            "pattern": sig.pattern,
                            "severity": sig.severity,
                            "action": effective_action,
                            "description": sig.description,
                            "mitre_technique": sig.mitre_technique,
                            "hit_count": sig.hit_count,
                        }
                    )

        return matches

    def get_stats(self) -> list[dict[str, Any]]:
        """Return hit count statistics for all signatures."""
        with self._lock:
            return [
                {
                    "id": sig.id,
                    "category": sig.category,
                    "description": sig.description,
                    "severity": sig.severity,
                    "action": sig.action,
                    "enabled": sig.enabled,
                    "hit_count": sig.hit_count,
                    "pattern": sig.pattern,
                    "mitre_technique": sig.mitre_technique,
                }
                for sig in self._signatures
            ]


# Module-level singleton
_engine = SignatureEngine()


def get_engine() -> SignatureEngine:
    return _engine


# ---------------------------------------------------------------------------
# Violation counter / auto-containment
# ---------------------------------------------------------------------------


class ViolationCounter:
    """Sliding-window violation counter per agent for auto-containment.

    Tracks violation counts and critical-violation counts over a rolling
    window, reusing the same sliding-window pattern as core/rate_limit.py.
    """

    def __init__(
        self,
        window_seconds: float = 600.0,
        critical_threshold: int = 3,
    ) -> None:
        self.window_seconds = window_seconds
        self.critical_threshold = critical_threshold
        self._violations: dict[str, list[float]] = defaultdict(list)
        self._criticals: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def record_violation(
        self, agent_id: str, severity: str = "medium"
    ) -> dict[str, Any]:
        """Record a violation and return whether auto-suspend should trigger.

        Returns:
            {
                "should_suspend": bool,
                "violation_count": int,
                "critical_count": int,
                "window_seconds": float,
            }
        """
        now = time.monotonic()
        cutoff = now - self.window_seconds

        with self._lock:
            # Clean expired entries
            self._violations[agent_id] = [
                t for t in self._violations[agent_id] if t > cutoff
            ]
            self._criticals[agent_id] = [
                t for t in self._criticals[agent_id] if t > cutoff
            ]

            # Record
            self._violations[agent_id].append(now)
            if severity == "critical":
                self._criticals[agent_id].append(now)

            v_count = len(self._violations[agent_id])
            c_count = len(self._criticals[agent_id])

        return {
            "should_suspend": c_count >= self.critical_threshold,
            "violation_count": v_count,
            "critical_count": c_count,
            "window_seconds": self.window_seconds,
        }

    def get_counts(self, agent_id: str) -> dict[str, int]:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            self._violations[agent_id] = [
                t for t in self._violations[agent_id] if t > cutoff
            ]
            self._criticals[agent_id] = [
                t for t in self._criticals[agent_id] if t > cutoff
            ]
            return {
                "violation_count": len(self._violations[agent_id]),
                "critical_count": len(self._criticals[agent_id]),
            }

    def reset(self, agent_id: str | None = None) -> None:
        with self._lock:
            if agent_id is None:
                self._violations.clear()
                self._criticals.clear()
            else:
                self._violations.pop(agent_id, None)
                self._criticals.pop(agent_id, None)


# Module-level singleton
_violation_counter: ViolationCounter | None = None


def get_violation_counter() -> ViolationCounter:
    global _violation_counter
    if _violation_counter is None:
        _violation_counter = ViolationCounter(
            window_seconds=settings.IPS_AUTO_SUSPEND_WINDOW_MINUTES * 60,
            critical_threshold=settings.IPS_AUTO_SUSPEND_THRESHOLD,
        )
    return _violation_counter
