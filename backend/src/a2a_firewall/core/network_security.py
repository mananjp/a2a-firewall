"""Network-Level Access Control and IP Allowlisting Engine.

Evaluates client IPs against configured CIDR allowlists, inspects network boundaries,
and extracts authentic client IPs across reverse proxies and cloud gateways.
"""

from __future__ import annotations

import ipaddress
import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.db.models import IpAllowlistEntry, NetworkAccessRule

logger = logging.getLogger(__name__)


def extract_client_ip(request: Request) -> str:
    """Safely extract the real client IP address from proxy headers."""
    # 1. Cloudflare header
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()

    # 2. Standard X-Forwarded-For (leftmost is original client)
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()

    # 3. Nginx / reverse proxy X-Real-IP
    x_real_ip = request.headers.get("x-real-ip")
    if x_real_ip:
        return x_real_ip.strip()

    # 4. Direct socket address
    if request.client and request.client.host:
        return request.client.host.strip()

    return "127.0.0.1"


def ip_in_network(ip_str: str, cidr_or_ip: str) -> bool:
    """Check if an IP string falls inside an IP or CIDR network range."""
    try:
        ip = ipaddress.ip_address(ip_str)
        # Check if single IP matches
        if "/" not in cidr_or_ip:
            target_ip = ipaddress.ip_address(cidr_or_ip)
            return ip == target_ip
        network = ipaddress.ip_network(cidr_or_ip, strict=False)
        return ip in network
    except ValueError:
        return False


async def check_ip_allowlist(
    client_ip: str,
    workspace_id: uuid.UUID,
    scope: str,  # "api" | "dashboard" | "all"
    db: AsyncSession,
) -> dict[str, Any]:
    """Verify if client IP is permitted under the workspace IP allowlist policy."""
    now = datetime.utcnow()
    stmt = (
        select(IpAllowlistEntry)
        .where(
            IpAllowlistEntry.workspace_id == workspace_id,
            IpAllowlistEntry.is_enabled == True,
        )
    )
    res = await db.execute(stmt)
    entries = res.scalars().all()

    # If no entries are configured for this workspace, allowlist is not enforced (open)
    if not entries:
        return {"allowed": True, "enforced": False, "client_ip": client_ip}

    # Filter applicable entries for the requested scope and non-expired
    valid_entries = [
        e for e in entries
        if (e.scope in ("all", scope)) and (e.expires_at is None or e.expires_at > now)
    ]

    if not valid_entries:
        return {"allowed": True, "enforced": False, "client_ip": client_ip}

    for entry in valid_entries:
        if ip_in_network(client_ip, entry.cidr_or_ip):
            return {
                "allowed": True,
                "enforced": True,
                "client_ip": client_ip,
                "matched_entry_id": str(entry.id),
                "matched_label": entry.label,
            }

    return {
        "allowed": False,
        "enforced": True,
        "client_ip": client_ip,
        "reason": f"Client IP {client_ip} is not in the authorized allowlist for this workspace",
    }


async def check_network_access_rules(
    client_ip: str,
    destination_agent_id: uuid.UUID | None,
    protocol: str,
    workspace_id: uuid.UUID,
    db: AsyncSession,
) -> dict[str, Any]:
    """Evaluate network-level CIDR and protocol access rules in priority order."""
    stmt = (
        select(NetworkAccessRule)
        .where(
            NetworkAccessRule.workspace_id == workspace_id,
            NetworkAccessRule.is_active == True,
        )
        .order_by(NetworkAccessRule.priority.asc())
    )
    res = await db.execute(stmt)
    rules = res.scalars().all()

    if not rules:
        return {"allowed": True, "reason": "no_network_rules_configured"}

    for rule in rules:
        # Check destination agent match (if rule specifies destination)
        if rule.destination_agent_id and destination_agent_id:
            if rule.destination_agent_id != destination_agent_id:
                continue

        # Check protocol match
        if rule.protocol != "all" and rule.protocol.lower() != protocol.lower():
            continue

        # Check source CIDR
        if ip_in_network(client_ip, rule.source_cidr):
            if rule.action == "deny":
                return {
                    "allowed": False,
                    "matched_rule_id": str(rule.id),
                    "rule_name": rule.name,
                    "reason": f"Network access denied by rule '{rule.name}' for IP {client_ip}",
                }
            return {
                "allowed": True,
                "matched_rule_id": str(rule.id),
                "rule_name": rule.name,
            }

    return {"allowed": True, "reason": "default_allow"}
