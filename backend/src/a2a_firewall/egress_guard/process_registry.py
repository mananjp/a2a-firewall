"""Process → agent identity registry for the transparent proxy.

System-wide transparent interception must never grab traffic from arbitrary
processes (a human's browser, email client, personal banking session). To keep
the surfaced risk proportional we couple two gates:

1. **Per-PID kernel gate** — only PIDs registered here are enforced by the
   kernel eBPF ``monitored_pids`` map (which the loader populates from this
   registry at attach time).
2. **Coarse network gate** — iptables REDIRECT may additionally be scoped to
   the OS uid (``A2A_AGENT_UID``) that the registered agent processes run
   under, so unrelated users are never redirected.

This registry is also the source of truth for **identity attribution**: when the
proxy accepts a connection it resolves the initiating PID via ``SO_PEERCRED``
and looks it up here, so audited transparent traffic carries a real
``agent_id`` / ``workspace_id`` instead of a meaningless random UUID.

The registry is deliberately free of platform-dependent side effects so it can
be unit-tested on any host (Windows/CI). ``resolve_peer_identity`` is the only
Linux-specific helper and is best-effort: it returns ``None`` when attribution
cannot be determined rather than fabricating an identity.
"""

from __future__ import annotations

import contextlib
import logging
import platform
import struct
import threading
from dataclasses import dataclass

logger = logging.getLogger("a2a_firewall.egress_guard.registry")


@dataclass(frozen=True)
class AgentIdentity:
    """Identity of a registered agent process.

    :param pid: OS process id of the agent process.
    :param agent_id: A2A Firewall agent identifier.
    :param workspace_id: Workspace the agent belongs to.
    :param uid: OS user id the process runs as (used for iptables scoping).
    """

    pid: int
    agent_id: str
    workspace_id: str
    uid: int


class ProcessRegistry:
    """Thread-safe mapping of process PID → :class:`AgentIdentity`.

    ``dry_run`` is accepted for API symmetry with the installer modules and
    stored for introspection; it does not change the in-memory behaviour (this
    registry never mutates the host).
    """

    def __init__(self, dry_run: bool = True) -> None:
        self.dry_run = dry_run
        self._identities: dict[int, AgentIdentity] = {}
        self._lock = threading.Lock()

    def register(self, agent_id: str, workspace_id: str, pid: int, uid: int) -> None:
        """Register (or update) the identity for a process."""
        with self._lock:
            self._identities[pid] = AgentIdentity(
                pid=pid, agent_id=agent_id, workspace_id=workspace_id, uid=uid
            )

    def unregister(self, pid: int) -> None:
        """Remove the identity for a process, if present."""
        with self._lock:
            self._identities.pop(pid, None)

    def lookup(self, pid: int) -> AgentIdentity | None:
        """Return the identity for a PID, or ``None`` if not registered."""
        with self._lock:
            return self._identities.get(pid)

    def iter_pids(self) -> list[int]:
        """Return all registered PIDs (for eBPF ``monitored_pids`` population)."""
        with self._lock:
            return sorted(self._identities)

    def iter_agent_uids(self) -> set[int]:
        """Return the set of OS uids hosting registered agents (for iptables)."""
        with self._lock:
            return {identity.uid for identity in self._identities.values()}

    def __len__(self) -> int:
        with self._lock:
            return len(self._identities)


def resolve_peer_identity(sock_fileno: int, registry: ProcessRegistry) -> AgentIdentity | None:
    """Resolve the :class:`AgentIdentity` behind an accepted socket.

    Uses ``SO_PEERCRED`` (Linux-only) to obtain the peer process PID, then looks
    it up in the registry. Returns ``None`` when the platform does not support
    ``SO_PEERCRED`` (macOS/Windows), the call fails, or the PID is not
    registered — attribution is best-effort and never fabricated.
    """
    import socket as _socket

    if platform.system() != "Linux":
        logger.debug("SO_PEERCRED attribution is Linux-only — returning None")
        return None

    so_peercred = getattr(_socket, "SO_PEERCRED", None)
    if so_peercred is None:
        return None

    try:
        sock = _socket.socket(fileno=sock_fileno)
    except (OSError, ValueError):
        return None
    try:
        # getsockopt(SOL_SOCKET, SO_PEERCRED) returns a 12-byte struct
        # (pid, uid, gid) packed as native little-endian ints on Linux.
        raw = sock.getsockopt(_socket.SOL_SOCKET, so_peercred)
    except OSError:
        return None
    finally:
        with contextlib.suppress(OSError):
            sock.close()

    if not isinstance(raw, bytes) or len(raw) < 12:
        return None
    try:
        pid = struct.unpack_from("=i", raw, 0)[0]
    except (struct.error, TypeError):  # pragma: no cover - shape is fixed on Linux
        return None
    return registry.lookup(pid)
