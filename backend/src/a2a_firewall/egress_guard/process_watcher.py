"""Cross-Platform Process Egress Watcher & Anti-Bypass Monitor.

Monitors active TCP/UDP sockets for agent processes and flags any unproxied outbound
connections that attempt to evade the A2A governance proxy.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable

import psutil

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
        on_bypass: Callable[[BypassViolation], None] | None = None,
        kill_on_bypass: bool = False,
    ):
        self.proxy_port = proxy_port
        self.allowed_ips = set(allowed_ips or ["127.0.0.1", "::1", "localhost"])
        self.on_bypass = on_bypass
        self.kill_on_bypass = kill_on_bypass
        self.monitored_pids: set[int] = set()
        self.violations: list[BypassViolation] = []
        self._running = False

    def add_monitored_pid(self, pid: int) -> None:
        """Register a PID to be monitored for network egress compliance."""
        self.monitored_pids.add(pid)

    def remove_monitored_pid(self, pid: int) -> None:
        """Unregister a PID from monitoring."""
        self.monitored_pids.discard(pid)

    def scan_connections(self) -> list[BypassViolation]:
        """Perform a single scan of active sockets for all monitored PIDs."""
        new_violations: list[BypassViolation] = []

        if not self.monitored_pids:
            return new_violations

        try:
            for conn in psutil.net_connections(kind="inet"):
                if conn.pid not in self.monitored_pids:
                    continue

                raddr = conn.raddr
                if not raddr:
                    continue

                remote_ip = raddr.ip
                remote_port = raddr.port

                # Check if connection routes through local proxy
                is_proxy = remote_ip in self.allowed_ips and remote_port == self.proxy_port
                is_loopback_dns = remote_ip in self.allowed_ips and remote_port in (53, 5353)

                if not is_proxy and not is_loopback_dns:
                    # Rogue direct connection bypassing proxy!
                    proc_name = "unknown"
                    try:
                        proc = psutil.Process(conn.pid)
                        proc_name = proc.name()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass

                    action = "alert"
                    if self.kill_on_bypass:
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
                        f"[EGRESS GUARD] Proxy bypass detected! PID {conn.pid} ({proc_name}) -> {remote_ip}:{remote_port} (Action: {action})"
                    )

                    if self.on_bypass:
                        self.on_bypass(v)

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
