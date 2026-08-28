"""A2A Firewall Egress Guard & Kernel-Level Anti-Bypass Enforcement.

Combines eBPF kernel socket filters for Linux with cross-platform live process
socket monitors to ensure AI agent traffic strictly routes through the A2A proxy.
"""

from a2a_firewall.egress_guard.ebpf_loader import EgressGuardLoader
from a2a_firewall.egress_guard.process_registry import (
    AgentIdentity,
    ProcessRegistry,
    resolve_peer_identity,
)
from a2a_firewall.egress_guard.process_watcher import BypassViolation, ProcessEgressWatcher

__all__ = [
    "EgressGuardLoader",
    "ProcessEgressWatcher",
    "BypassViolation",
    "AgentIdentity",
    "ProcessRegistry",
    "resolve_peer_identity",
]
