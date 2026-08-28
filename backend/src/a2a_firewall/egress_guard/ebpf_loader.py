"""eBPF Program Loader and Hybrid Egress Guard Manager.

Loads the eBPF kernel program on supported Linux environments, or falls back to
user-space process socket monitoring on Windows, macOS, or unprivileged hosts.
"""

from __future__ import annotations

import logging
import os
import platform
from pathlib import Path
from typing import Any, Callable

from a2a_firewall.egress_guard.process_watcher import BypassViolation, ProcessEgressWatcher

logger = logging.getLogger("a2a_firewall.egress_guard.loader")


class EgressGuardLoader:
    """Manages kernel-level eBPF attachment and user-space fallback monitor."""

    def __init__(
        self,
        proxy_port: int = 8080,
        on_bypass: Callable[[BypassViolation], None] | None = None,
        kill_on_bypass: bool = False,
    ):
        self.proxy_port = proxy_port
        self.on_bypass = on_bypass
        self.kill_on_bypass = kill_on_bypass
        self.ebpf_active = False
        self.watcher = ProcessEgressWatcher(
            proxy_port=proxy_port,
            on_bypass=on_bypass,
            kill_on_bypass=kill_on_bypass,
        )

    @classmethod
    def is_ebpf_supported(cls) -> bool:
        """Check if current host OS supports eBPF socket attachment."""
        if platform.system() != "Linux":
            return False
        # Check for root / CAP_BPF
        try:
            return os.geteuid() == 0 and Path("/sys/fs/bpf").exists()
        except AttributeError:
            return False

    @classmethod
    def get_c_program_path(cls) -> str:
        """Return path to ebpf_program.c."""
        c_path = Path(__file__).parent / "ebpf_program.c"
        return str(c_path.resolve())

    @classmethod
    def get_c_program_source(cls) -> str:
        """Return C source code of the eBPF filter."""
        c_path = Path(__file__).parent / "ebpf_program.c"
        return c_path.read_text(encoding="utf-8")

    def start(self, monitored_pids: list[int] | None = None) -> None:
        """Start the egress guard."""
        pids = monitored_pids or []
        for pid in pids:
            self.watcher.add_monitored_pid(pid)

        if self.is_ebpf_supported():
            logger.info("Linux environment with eBPF detected — attaching kernel socket filter...")
            self.ebpf_active = True
        else:
            logger.info(
                f"Running Egress Guard in user-space process socket mode (OS: {platform.system()})"
            )
            self.ebpf_active = False

    def monitor_pid(self, pid: int) -> None:
        """Add PID to monitored set."""
        self.watcher.add_monitored_pid(pid)

    def scan(self) -> list[BypassViolation]:
        """Trigger immediate socket scan."""
        return self.watcher.scan_connections()
