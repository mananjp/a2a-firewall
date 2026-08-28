"""Cross-Platform Process Egress Watcher & Anti-Bypass Monitor.

Monitors active TCP/UDP sockets for agent processes and flags any unproxied outbound
connections that attempt to evade the A2A governance proxy.
"""

from __future__ import annotations

import asyncio
import contextlib
import ipaddress
import logging
import time
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field

import psutil  # type: ignore[import-untyped]

logger = logging.getLogger("a2a_firewall.egress_guard")


@dataclass
class BypassViolation:
    """Record of an unproxied egress attempt bypassing A2A Firewall."""

    pid: int
    process_name: str
    remote_ip: str
    remote_port: int
    status: str
    timestamp: float = field(default_factory=time.time)
    action_taken: str = "alert"


class ProcessEgressWatcher:
    """Monitors process network sockets to verify proxy compliance."""

    def __init__(
        self,
        proxy_port: int = 8080,
        allowed_ips: list[str] | None = None,
        allowed_cidrs: list[str] | None = None,
        allowed_internal_ports: list[int] | None = None,
        on_bypass: Callable[[BypassViolation], None] | None = None,
        kill_on_bypass: bool = False,
        consecutive_violations_threshold: int = 1,
    ):
        self.proxy_port = proxy_port
        self.allowed_ips = set(allowed_ips or ["127.0.0.1", "::1", "localhost"])
        self.allowed_internal_ports = set(allowed_internal_ports or [53, 5353, 5432, 6379, 8000])

        # Build allowed CIDR networks (e.g. loopback 127.0.0.0/8)
        self.allowed_networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
        raw_cidrs = allowed_cidrs or ["127.0.0.0/8", "::1/128"]
        for cidr in raw_cidrs:
            with contextlib.suppress(ValueError):
                self.allowed_networks.append(ipaddress.ip_network(cidr, strict=False))

        self.on_bypass = on_bypass
        self.kill_on_bypass = kill_on_bypass
        self.consecutive_violations_threshold = max(1, consecutive_violations_threshold)

        self.monitored_pids: set[int] = set()
        self._violation_counts: dict[int, int] = defaultdict(int)
        self.violations: list[BypassViolation] = []
        self._running = False

    def add_monitored_pid(self, pid: int) -> None:
        """Register a PID to be monitored for network egress compliance."""
        self.monitored_pids.add(pid)

    def remove_monitored_pid(self, pid: int) -> None:
        """Unregister a PID from monitoring."""
        self.monitored_pids.discard(pid)
        self._violation_counts.pop(pid, None)

    def is_destination_allowed(self, remote_ip: str, remote_port: int) -> bool:
        """Check if an outbound connection is permitted."""
        # 1. Exact match on local proxy port
        if (
            remote_ip in self.allowed_ips or self._is_in_allowed_cidr(remote_ip)
        ) and remote_port == self.proxy_port:
            return True

        # 2. Whitelisted internal infrastructure ports on loopback/VPC (e.g. Postgres, Redis, DNS)
        if self._is_in_allowed_cidr(remote_ip) and remote_port in self.allowed_internal_ports:
            return True

        # 3. Explicit IP string matches
        return remote_ip in self.allowed_ips and remote_port in self.allowed_internal_ports

    def _is_in_allowed_cidr(self, ip_str: str) -> bool:
        """Check if an IP address belongs to allowed loopback/internal CIDR blocks."""
        try:
            ip_obj = ipaddress.ip_address(ip_str)
            return any(ip_obj in net for net in self.allowed_networks)
        except ValueError:
            return False

    def scan_connections(self) -> list[BypassViolation]:
        """Perform a single scan of active sockets for all monitored PIDs."""
        new_violations: list[BypassViolation] = []

        if not self.monitored_pids:
            return new_violations

        try:
            active_pids_in_scan: set[int] = set()
            for conn in psutil.net_connections(kind="inet"):
                if conn.pid not in self.monitored_pids:
                    continue

                raddr = conn.raddr
                if not raddr:
                    continue

                remote_ip = raddr.ip
                remote_port = raddr.port

                # Check if connection is legitimately allowed
                if self.is_destination_allowed(remote_ip, remote_port):
                    continue

                # Rogue direct connection bypassing proxy!
                active_pids_in_scan.add(conn.pid)
                self._violation_counts[conn.pid] += 1
                current_count = self._violation_counts[conn.pid]

                proc_name = "unknown"
                try:
                    proc = psutil.Process(conn.pid)
                    proc_name = proc.name()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass

                action = "alert"
                if self.kill_on_bypass and current_count >= self.consecutive_violations_threshold:
                    try:
                        proc = psutil.Process(conn.pid)
                        proc.terminate()
                        action = "process_terminated"
                    except Exception:
                        action = "termination_failed"

                v = BypassViolation(
                    pid=conn.pid,
                    process_name=proc_name,
                    remote_ip=remote_ip,
                    remote_port=remote_port,
                    status=conn.status,
                    action_taken=action,
                )
                new_violations.append(v)
                self.violations.append(v)

                logger.warning(
                    f"[EGRESS GUARD] Proxy bypass detected! PID {conn.pid} ({proc_name}) -> {remote_ip}:{remote_port} (Action: {action}, Hits: {current_count})"
                )

                if self.on_bypass:
                    self.on_bypass(v)

            # Reset counts for PIDs that had no violations in this scan
            for pid in list(self._violation_counts.keys()):
                if pid not in active_pids_in_scan:
                    self._violation_counts[pid] = 0

        except Exception as e:
            logger.debug(f"Socket scan error: {e}")

        return new_violations

    async def run_loop(self, interval_seconds: float = 1.0) -> None:
        """Run continuous background monitoring loop."""
        self._running = True
        while self._running:
            self.scan_connections()
            await asyncio.sleep(interval_seconds)

    def stop(self) -> None:
        """Stop monitoring loop."""
        self._running = False
