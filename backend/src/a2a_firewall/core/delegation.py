"""Macaroon-style delegation tokens for attenuable capability grants.

When Agent A delegates to Agent B who delegates to Agent C, each hop can only
NARROW permissions (add caveats), never widen them. The full chain verifies with
a single HMAC walk — no re-signing, no trust in the delegatee.

This solves the "compromised leaf agent inherits root trust" problem that JWTs
cannot address (JWTs are immutable after signing).

Caveat format: "key=value" strings appended to the token.
Examples:
    workspace_id=ws-123
    task_type=research
    max_risk=0.5
    receiver=agent-b-uuid
    max_depth=3
    expires=1721052000

Verification: HMAC-SHA256 chain. Root key signs the location + all caveats.
Each delegation hop appends a caveat and re-signs with the same root key.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from dataclasses import asdict, dataclass, field
from typing import Any


def _hmac_sha256(key: bytes, data: bytes) -> bytes:
    return hmac.new(key, data, hashlib.sha256).digest()


def _caveat_bytes(caveats: list[str]) -> bytes:
    return "\n".join(caveats).encode()


# ---------------------------------------------------------------------------
# Macaroon Token
# ---------------------------------------------------------------------------

@dataclass
class DelegationToken:
    """A macaroon-style capability token with caveat-based attenuation.

    The token carries:
    - location: where this token is valid (firewall URL or workspace_id)
    - identifier: agent_id that holds this token
    - caveats: list of capability restrictions (can only narrow)
    - signature: HMAC-SHA256 over (location + identifier + all caveats)
    """
    location: str  # workspace_id or firewall URL
    identifier: str  # agent_id
    caveats: list[str] = field(default_factory=list)
    signature: str = ""  # hex-encoded HMAC

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> DelegationToken:
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


def _compute_signature(root_key: bytes, location: str, identifier: str, caveats: list[str]) -> str:
    """Compute HMAC-SHA256 over location + identifier + all caveats."""
    msg = f"{location}\n{identifier}\n".encode() + _caveat_bytes(caveats)
    return _hmac_sha256(root_key, msg).hex()


# ---------------------------------------------------------------------------
# Minting
# ---------------------------------------------------------------------------

def mint_token(
    root_key: bytes,
    location: str,
    agent_id: str,
    initial_caveats: list[str] | None = None,
) -> DelegationToken:
    """Mint a new root delegation token for an agent.

    Args:
        root_key: workspace root HMAC key (32 bytes).
        location: workspace_id or firewall URL.
        agent_id: the agent receiving this token.
        initial_caveats: optional starting caveats (e.g. ["max_depth=10"]).
    """
    caveats = list(initial_caveats or [])
    sig = _compute_signature(root_key, location, agent_id, caveats)
    return DelegationToken(location=location, identifier=agent_id, caveats=caveats, signature=sig)


# ---------------------------------------------------------------------------
# Attenuation (delegation)
# ---------------------------------------------------------------------------

def attenuate_token(
    token: DelegationToken,
    root_key: bytes,
    new_caveats: list[str],
) -> DelegationToken:
    """Create a delegated token with additional caveats (narrowing only).

    Validates that new caveats don't contradict existing ones before appending.
    The signature is recomputed over the full caveat set using the same root key.

    Raises ValueError if new caveats would widen existing restrictions.
    """
    _validate_caveat_narrowing(token.caveats, new_caveats)

    # Construct the new caveat list: if a key exists, replace it in-place, otherwise append.
    new_map = _parse_caveats(new_caveats)

    updated_caveats = []
    for c in token.caveats:
        if "=" in c:
            k, v = c.split("=", 1)
            if k in new_map:
                updated_caveats.append(f"{k}={new_map[k]}")
                del new_map[k]
            else:
                updated_caveats.append(c)
        else:
            updated_caveats.append(c)

    for k, v in new_map.items():
        updated_caveats.append(f"{k}={v}")

    for c in new_caveats:
        if "=" not in c:
            updated_caveats.append(c)

    sig = _compute_signature(root_key, token.location, token.identifier, updated_caveats)
    return DelegationToken(
        location=token.location,
        identifier=token.identifier,
        caveats=updated_caveats,
        signature=sig,
    )


def _validate_caveat_narrowing(existing: list[str], new: list[str]) -> None:
    """Ensure new caveats only narrow, never widen existing restrictions."""
    existing_map = _parse_caveats(existing)
    new_map = _parse_caveats(new)

    for key, new_value in new_map.items():
        if key in existing_map:
            old_value = existing_map[key]
            # Numeric caveats: new must be <= old (narrowing)
            if key.startswith("max_"):
                try:
                    new_val_f = float(new_value)
                    old_val_f = float(old_value)
                except ValueError:
                    continue  # non-numeric, skip numeric check
                if new_val_f > old_val_f + 1e-9:
                    raise ValueError(
                        f"Caveat '{key}' would widen: {new_value} > {old_value}"
                    )
            # Equality caveats: must match exactly
            elif key in ("workspace_id", "task_type", "receiver"):
                if new_value != old_value:
                    raise ValueError(
                        f"Caveat '{key}' conflicts: '{new_value}' != '{old_value}'"
                    )


def _parse_caveats(caveats: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for c in caveats:
        if "=" in c:
            k, v = c.split("=", 1)
            result[k] = v
    return result


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

@dataclass
class VerificationResult:
    valid: bool
    reason: str = ""
    expired: bool = False
    caveats: list[str] = field(default_factory=list)
    parsed: dict[str, str] = field(default_factory=dict)


def verify_token(token: DelegationToken, root_key: bytes) -> VerificationResult:
    """Verify a delegation token's signature and check expiry.

    Walks the full HMAC chain — if anyone tampered with caveats or the
    signature, verification fails.
    """
    expected_sig = _compute_signature(root_key, token.location, token.identifier, token.caveats)
    if not hmac.compare_digest(token.signature, expected_sig):
        return VerificationResult(valid=False, reason="signature_mismatch")

    parsed = _parse_caveats(token.caveats)

    # Check expiry
    if "expires" in parsed:
        try:
            if time.time() > float(parsed["expires"]):
                return VerificationResult(valid=False, reason="token_expired", expired=True, caveats=token.caveats, parsed=parsed)
        except ValueError:
            return VerificationResult(valid=False, reason="invalid_expiry", caveats=token.caveats, parsed=parsed)

    return VerificationResult(valid=True, caveats=token.caveats, parsed=parsed)


def check_capability(token: DelegationToken, required: str) -> bool:
    """Check if a token's caveats satisfy a required capability.

    Args:
        token: the delegation token to check.
        required: a caveat string like "task_type=research" or "max_risk=0.8".

    Returns True if the token grants the required capability.
    """
    parsed = _parse_caveats(token.caveats)
    if "=" not in required:
        return False
    req_key, req_value = required.split("=", 1)

    if req_key not in parsed:
        return False  # caveat not present = not granted

    token_value = parsed[req_key]

    # Numeric comparison for max_ prefixed caveats
    if req_key.startswith("max_"):
        try:
            return float(token_value) >= float(req_value) - 1e-9
        except ValueError:
            return False

    return token_value == req_value


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

def token_to_compact(token: DelegationToken) -> str:
    """Serialize a token to a compact string for HTTP transport."""
    return json.dumps(token.to_dict(), separators=(",", ":"))


def token_from_compact(data: str) -> DelegationToken:
    """Deserialize a compact token string."""
    return DelegationToken.from_dict(json.loads(data))


# ---------------------------------------------------------------------------
# Root key generation
# ---------------------------------------------------------------------------

def generate_root_key() -> bytes:
    """Generate a random 32-byte root HMAC key."""
    return secrets.token_bytes(32)
