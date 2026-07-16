"""A2A Firewall Python SDK — full identity, delegation, and signing integration.

Usage:
    from a2a_firewall import A2AFirewall, FirewallConfig

    config = FirewallConfig(
        firewall_url="http://localhost:8000",
        workspace_id="ws-uuid",
        agent_id="agent-uuid",
        agent_api_key="agt_xxx",
        agent_private_key="ed25519-hex",        # for signing messages
        workspace_root_pubkey="ed25519-hex",     # for verifying cards
        fail_mode="closed",
    )
    firewall = A2AFirewall(config)

    response = firewall.send(
        receiver_agent_id="target-uuid",
        task_type="research",
        payload={"query": "What is fraud?"},
    )
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

@dataclass
class FirewallConfig:
    firewall_url: str
    workspace_id: str
    agent_id: str
    agent_api_key: str
    agent_private_key: str = ""  # hex-encoded Ed25519 private key (for signing)
    workspace_root_pubkey: str = ""  # hex-encoded Ed25519 public key (for verification)
    timeout_seconds: float = 5.0
    fail_mode: str = "closed"  # "open" | "closed"
    review_poll_interval: float = 2.0
    review_max_wait: float = 60.0


# ---------------------------------------------------------------------------
# Response & Error types
# ---------------------------------------------------------------------------

@dataclass
class FirewallResponse:
    task_id: str
    decision: str  # "allow" | "block" | "review"
    allowed: bool
    risk_score: float
    violations: list[dict[str, Any]]
    review_token: Optional[str] = None
    block_reason: Optional[str] = None
    latency_ms: int = 0
    trace_id: Optional[str] = None


class FirewallBlockedError(Exception):
    def __init__(self, task_id: str, reason: str, risk_score: float, violations: list[dict[str, Any]]):
        self.task_id = task_id
        self.reason = reason
        self.risk_score = risk_score
        self.violations = violations
        super().__init__(f"Task {task_id} blocked: {reason}")


# ---------------------------------------------------------------------------
# Crypto helpers (self-contained, no backend dependency)
# ---------------------------------------------------------------------------

def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _compute_message_hash(payload: dict[str, Any], sender_id: str, receiver_id: str, timestamp: float) -> str:
    canonical = json.dumps(
        {"payload": payload, "sender": sender_id, "receiver": receiver_id, "ts": timestamp},
        sort_keys=True, separators=(",", ":"),
    ).encode()
    return _sha256_hex(canonical)


def _compute_chain_hash(parent_chain_hash: str | None, message_hash: str) -> str:
    parent = parent_chain_hash or _sha256_hex(b"\x00" * 32)
    return _sha256_hex(bytes.fromhex(parent) + bytes.fromhex(message_hash))


def _ed25519_sign(private_key_hex: str, message: bytes) -> str:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    raw = bytes.fromhex(private_key_hex)
    key = Ed25519PrivateKey.from_private_bytes(raw)
    return key.sign(message).hex()


def _ed25519_verify(public_key_hex: str, signature_hex: str, message: bytes) -> bool:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    try:
        key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key_hex))
        key.verify(bytes.fromhex(signature_hex), message)
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Delegation token (compact serialization)
# ---------------------------------------------------------------------------

def _hmac_sha256(key: bytes, data: bytes) -> bytes:
    return hmac.new(key, data, hashlib.sha256).digest()


def _mint_delegation_token(root_key_hex: str, location: str, agent_id: str, caveats: list[str]) -> dict[str, Any]:
    root_key = bytes.fromhex(root_key_hex) if len(root_key_hex) == 64 else root_key_hex.encode()[:32]
    msg = f"{location}\n{agent_id}\n".encode() + "\n".join(caveats).encode()
    sig = _hmac_sha256(root_key, msg).hex()
    return {"location": location, "identifier": agent_id, "caveats": caveats, "signature": sig}


def _attenuate_token(token: dict[str, Any], root_key_hex: str, new_caveats: list[str]) -> dict[str, Any]:
    root_key = bytes.fromhex(root_key_hex) if len(root_key_hex) == 64 else root_key_hex.encode()[:32]
    all_caveats = token["caveats"] + new_caveats
    msg = f"{token['location']}\n{token['identifier']}\n".encode() + "\n".join(all_caveats).encode()
    sig = _hmac_sha256(root_key, msg).hex()
    return {"location": token["location"], "identifier": token["identifier"], "caveats": all_caveats, "signature": sig}


def _token_to_compact(token: dict[str, Any]) -> str:
    return json.dumps(token, separators=(",", ":"))


# ---------------------------------------------------------------------------
# Main SDK class
# ---------------------------------------------------------------------------

class A2AFirewall:
    def __init__(self, config: FirewallConfig):
        self.config = config
        self._ctx: dict[str, Any] = {}
        self._http = httpx.Client(
            base_url=config.firewall_url,
            headers={"Authorization": f"Bearer {config.agent_api_key}"},
            timeout=config.timeout_seconds,
        )
        self._chain_hash: str | None = None
        self._delegation_token: dict[str, Any] | None = None
        self._delegation_chain: list[str] = []

    # -- Context management --

    def set_context(
        self,
        task_id: str,
        root_task_id: str,
        trace_id: str | None = None,
        span_id: str | None = None,
        chain_hash: str | None = None,
        delegation_token: str | None = None,
    ) -> None:
        """Set lineage context for the next send (called when processing a received task)."""
        self._ctx = {
            "current_task_id": task_id,
            "root_task_id": root_task_id,
            "trace_id": trace_id,
            "span_id": span_id,
        }
        if chain_hash:
            self._chain_hash = chain_hash
        if delegation_token:
            self._delegation_token = json.loads(delegation_token)

    # -- Signing --

    def _sign_payload(self, payload: dict[str, Any], receiver_id: str) -> tuple[str, str, str]:
        """Sign a payload and compute chain hash. Returns (message_hash, chain_hash, signature)."""
        now = time.time()
        msg_hash = _compute_message_hash(payload, self.config.agent_id, receiver_id, now)
        chain_hash = _compute_chain_hash(self._chain_hash, msg_hash)

        signature = ""
        if self.config.agent_private_key:
            signature = _ed25519_sign(self.config.agent_private_key, bytes.fromhex(msg_hash))

        self._chain_hash = chain_hash
        return msg_hash, chain_hash, signature

    # -- Delegation --

    def create_delegation_token(
        self,
        root_key_hex: str,
        receiver_agent_id: str,
        task_type: str | None = None,
        max_risk: float | None = None,
    ) -> str:
        """Create a delegation token for forwarding to another agent."""
        caveats = [f"receiver={receiver_agent_id}"]
        if task_type:
            caveats.append(f"task_type={task_type}")
        if max_risk is not None:
            caveats.append(f"max_risk={max_risk}")

        if self._delegation_token:
            token = _attenuate_token(self._delegation_token, root_key_hex, caveats)
        else:
            token = _mint_delegation_token(root_key_hex, self.config.workspace_id, self.config.agent_id, caveats)

        self._delegation_token = token
        self._delegation_chain.append(receiver_agent_id)
        return _token_to_compact(token)

    # -- Core send --

    def send(
        self,
        receiver_agent_id: str,
        task_type: str,
        payload: dict[str, Any],
        parent_task_id: str | None = None,
        root_task_id: str | None = None,
        raise_on_block: bool = True,
        schema_version: str = "v1",
        depth: int = 0,
    ) -> FirewallResponse:
        """Send a message through the firewall with automatic signing and delegation."""
        task_id = str(uuid.uuid4())
        msg_hash, chain_hash, signature = self._sign_payload(payload, receiver_agent_id)

        body: dict[str, Any] = {
            "task_id": task_id,
            "parent_task_id": parent_task_id or self._ctx.get("current_task_id"),
            "root_task_id": root_task_id or self._ctx.get("root_task_id") or task_id,
            "receiver_agent_id": receiver_agent_id,
            "task_type": task_type,
            "schema_version": schema_version,
            "payload": payload,
            "trace_id": self._ctx.get("trace_id"),
            "parent_span_id": self._ctx.get("span_id"),
            "sdk_version": "0.2.0",
            "depth": depth,
            "sender_signature": signature,
            "sender_public_key": "",  # populated if key is available
        }

        # Include public key if we have a private key
        if self.config.agent_private_key:
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
            raw = bytes.fromhex(self.config.agent_private_key)
            priv = Ed25519PrivateKey.from_private_bytes(raw)
            from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
            body["sender_public_key"] = priv.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex()

        # Include delegation token if active
        if self._delegation_token:
            body["delegation_token"] = _token_to_compact(self._delegation_token)

        try:
            resp = self._http.post("/v1/firewall/inspect", json=body)
            resp.raise_for_status()
            data = resp.json()
            fw = FirewallResponse(
                task_id=data["task_id"],
                decision=data["decision"],
                allowed=data["allowed_to_proceed"],
                risk_score=data["risk_score"],
                violations=data.get("violations", []),
                review_token=data.get("review_token"),
                block_reason=data.get("block_reason"),
                latency_ms=data.get("latency_ms", 0),
                trace_id=data.get("trace_id"),
            )
        except httpx.TimeoutException:
            if self.config.fail_mode == "closed":
                raise FirewallBlockedError(task_id, "firewall_unreachable", 1.0, [])
            return FirewallResponse(
                task_id=task_id, decision="allow", allowed=True,
                risk_score=0.0, violations=[], latency_ms=-1,
            )
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"Firewall HTTP error: {e.response.status_code}") from e

        if fw.decision == "review":
            fw = self._wait_for_review(fw)

        if not fw.allowed and raise_on_block:
            raise FirewallBlockedError(fw.task_id, fw.block_reason or "unknown", fw.risk_score, fw.violations)

        return fw

    # -- Review polling --

    def _wait_for_review(self, fw: FirewallResponse) -> FirewallResponse:
        deadline = time.monotonic() + self.config.review_max_wait
        while time.monotonic() < deadline:
            time.sleep(self.config.review_poll_interval)
            try:
                r = self._http.get(f"/v1/review/{fw.review_token}/status")
                s = r.json()
                if s["status"] == "approved":
                    fw.decision = "allow"
                    fw.allowed = True
                    return fw
                if s["status"] == "rejected":
                    fw.decision = "block"
                    fw.allowed = False
                    fw.block_reason = f"Rejected: {s.get('reviewer_notes', '')}"
                    return fw
            except Exception:
                pass
        fw.decision = "block"
        fw.allowed = False
        fw.block_reason = "review_timeout"
        return fw

    # -- Verify incoming --

    def verify_message(
        self,
        sender_public_key: str,
        message_hash: str,
        signature: str,
        expected_parent_chain_hash: str | None = None,
    ) -> dict[str, Any]:
        """Verify an incoming message's Ed25519 signature and chain hash."""
        sig_valid = _ed25519_verify(sender_public_key, signature, bytes.fromhex(message_hash))

        chain_valid = True
        if expected_parent_chain_hash:
            expected_chain = _compute_chain_hash(expected_parent_chain_hash, message_hash)
            chain_valid = expected_chain == self._chain_hash

        return {"signature_valid": sig_valid, "chain_valid": chain_valid}

    # -- Utility --

    def get_delegation_chain(self) -> list[str]:
        return list(self._delegation_chain)

    def get_chain_hash(self) -> str | None:
        return self._chain_hash

    def close(self) -> None:
        self._http.close()
