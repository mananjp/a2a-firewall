"""Network-Level Access Control and IP Allowlisting Engine.

Evaluates client IPs against configured CIDR allowlists, inspects network boundaries,
and extracts authentic client IPs across reverse proxies and cloud gateways.
"""

from __future__ import annotations

import ipaddress
import logging
import socket
import urllib.parse
import uuid
from datetime import datetime
from typing import Any

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.core.config import settings
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


def validate_callback_url(url: str | None) -> tuple[bool, str | None]:
    """Validate webhook / review callback URLs to prevent Server-Side Request Forgery (SSRF).

    Enforces:
    - HTTPS scheme required (HTTP permitted only when settings.DEBUG is True).
    - Rejects credentials in URL (userinfo / @).
    - Rejects localhost, loopback, private RFC-1918, link-local RFC-3927, and cloud metadata endpoints.
    - Resolves hostnames to verify target IP is not private/loopback/link-local.
    - Matches optional REVIEW_CALLBACK_ALLOWLIST if configured.

    Returns (is_valid, rejection_reason).
    """
    if not url or not isinstance(url, str):
        return False, "Callback URL is empty or invalid"

    clean_url = url.strip()
    if len(clean_url) > 2048:
        return False, "Callback URL exceeds maximum length of 2048 characters"

    try:
        parsed = urllib.parse.urlsplit(clean_url)
    except Exception as exc:
        return False, f"Callback URL parsing failed: {exc}"

    # 1. Scheme check (must be https, unless in debug mode)
    allowed_schemes = ("https", "http") if settings.DEBUG else ("https",)
    if not parsed.scheme or parsed.scheme.lower() not in allowed_schemes:
        return False, f"Scheme '{parsed.scheme}' not allowed (must be https)"

    # 2. Rejects userinfo / credentials
    if parsed.username or parsed.password or "@" in (parsed.netloc or ""):
        return False, "Callback URL must not contain user credentials"

    # 3. Hostname presence
    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        return False, "Callback URL missing host"

    # 4. Port check (must be standard HTTP/HTTPS or valid port)
    if parsed.port is not None and (parsed.port < 1 or parsed.port > 65535):
        return False, "Callback URL port is out of range"

    # 5. Denied internal hostnames and suffixes
    denied_hosts = {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "metadata.google.internal",
        "metadata",
        "instance-data",
    }
    if hostname in denied_hosts:
        return False, f"Callback host '{hostname}' is not permitted"

    denied_suffixes = (
        ".localhost",
        ".local",
        ".internal",
        ".lan",
        ".home.arpa",
        ".localdomain",
    )
    if any(hostname.endswith(sfx) for sfx in denied_suffixes):
        return False, f"Callback host domain '{hostname}' is not permitted"

    # 6. Raw IP literal check
    try:
        ip = ipaddress.ip_address(hostname)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            return False, f"Private or local IP address '{hostname}' is not permitted"
    except ValueError:
        # Hostname is a domain name, not an IP literal
        pass

    # 7. DNS resolution check (prevent DNS rebinding & internal domains)
    try:
        addr_info = socket.getaddrinfo(hostname, None)
        for item in addr_info:
            sockaddr = item[4]
            resolved_ip_str = sockaddr[0]
            try:
                resolved_ip = ipaddress.ip_address(resolved_ip_str)
                if (
                    resolved_ip.is_private
                    or resolved_ip.is_loopback
                    or resolved_ip.is_link_local
                    or resolved_ip.is_reserved
                    or resolved_ip.is_multicast
                    or resolved_ip.is_unspecified
                ):
                    return False, f"Callback host resolves to private/internal IP {resolved_ip_str}"
            except ValueError:
                continue
    except socket.gaierror:
        # Unresolvable in offline test environment or nonexistent domain
        pass

    # 8. Domain allowlist check (if configured in settings)
    allowlist_str = getattr(settings, "REVIEW_CALLBACK_ALLOWLIST", "").strip()
    if allowlist_str:
        allowed_entries = [e.strip().lower() for e in allowlist_str.split(",") if e.strip()]
        matched = any(
            hostname == entry or hostname.endswith(f".{entry}") for entry in allowed_entries
        )
        if not matched:
            return False, f"Callback host '{hostname}' is not in the allowed domains list"

    return True, None


async def check_ip_allowlist(
    client_ip: str,
    workspace_id: uuid.UUID,
    scope: str,  # "api" | "dashboard" | "all"
    db: AsyncSession,
) -> dict[str, Any]:
    """Verify if client IP is permitted under the workspace IP allowlist policy."""
    now = datetime.utcnow()
    stmt = select(IpAllowlistEntry).where(
        IpAllowlistEntry.workspace_id == workspace_id,
        IpAllowlistEntry.is_enabled,
    )
    res = await db.execute(stmt)
    entries = res.scalars().all()

    # If no entries are configured for this workspace, allowlist is not enforced (open)
    if not entries:
        return {"allowed": True, "enforced": False, "client_ip": client_ip}

    # Filter applicable entries for the requested scope and non-expired
    valid_entries = [
        e
        for e in entries
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
            NetworkAccessRule.is_active,
        )
        .order_by(NetworkAccessRule.priority.asc())
    )
    res = await db.execute(stmt)
    rules = res.scalars().all()

    if not rules:
        return {"allowed": True, "reason": "no_network_rules_configured"}

    for rule in rules:
        # Check destination agent match (if rule specifies destination)
        if (
            rule.destination_agent_id
            and destination_agent_id
            and rule.destination_agent_id != destination_agent_id
        ):
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
