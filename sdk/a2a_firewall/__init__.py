"""A2A Firewall Python SDK — full identity, delegation, and signing integration."""
from a2a_firewall.client import (
    A2AFirewall,
    FirewallBlockedError,
    FirewallConfig,
    FirewallResponse,
)

__all__ = ["A2AFirewall", "FirewallBlockedError", "FirewallConfig", "FirewallResponse"]
__version__ = "0.2.0"
