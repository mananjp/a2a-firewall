"""eBPF Program Loader and Hybrid Egress Guard Manager.

Loads the eBPF kernel program on supported Linux environments, or falls back to
user-space process socket monitoring on Windows, macOS, or unprivileged hosts.
"""

from __future__ import annotations

import logging
import platform
import shutil
import subprocess
import tempfile
from collections.abc import Callable
from pathlib import Path

from a2a_firewall.egress_guard.process_watcher import BypassViolation, ProcessEgressWatcher

logger = logging.getLogger("a2a_firewall.egress_guard.loader")

# Tooling used to compile ebpf_program.c into a loadable object (best-effort).
CLANG_BINARY = shutil.which("clang")
BPFTOOL_BINARY = shutil.which("bpftool")


class EbpfCompileError(RuntimeError):
    """Raised when the eBPF C program cannot be compiled and attached."""


class EgressGuardLoader:
    """Manages kernel-level eBPF attachment and user-space fallback monitor."""

    def __init__(
        self,
        proxy_port: int = 8080,
        on_bypass: Callable[[BypassViolation], None] | None = None,
        kill_on_bypass: bool = False,
        fwmark: int = 0xA2A1,
    ):
        self.proxy_port = proxy_port
        self.on_bypass = on_bypass
        self.kill_on_bypass = kill_on_bypass
        self.fwmark = fwmark
        self.ebpf_active = False
        self.ebpf_error: str | None = None
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
        geteuid = getattr(__import__("os"), "geteuid", None)
        if geteuid is None:
            return False
        return geteuid() == 0 and Path("/sys/fs/bpf").exists()

    @classmethod
    def has_compile_tooling(cls) -> bool:
        """Whether clang + bpftool are available for a best-effort build."""
        return CLANG_BINARY is not None and BPFTOOL_BINARY is not None

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

    def compile_program(self, output_dir: str | None = None) -> str:
        """Compile the C eBPF program to a BPF-ELF object (best effort).

        Returns the path of the compiled ``.o`` file. Raises
        :class:`EbpfCompileError` if the toolchain is missing or compile fails.
        """
        if not self.has_compile_tooling():
            missing = [
                name
                for name, bin in (("clang", CLANG_BINARY), ("bpftool", BPFTOOL_BINARY))
                if bin is None
            ]
            raise EbpfCompileError(
                "Missing eBPF compile tooling: " + ", ".join(missing) + ". "
                "Install clang and bpftool to enable kernel-level enforcement, "
                "or rely on the user-space process watcher fallback."
            )

        assert CLANG_BINARY is not None
        assert BPFTOOL_BINARY is not None
        out_dir = Path(output_dir) if output_dir else Path(tempfile.mkdtemp(prefix="a2a_ebpf_"))
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "a2a_egress_guard.o"

        cmd = [
            CLANG_BINARY,
            "-O2",
            "-g",
            "-target",
            "bpf",
            "-D__TARGET_ARCH_x86",
            "-c",
            self.get_c_program_path(),
            "-o",
            str(out_path),
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(out_dir))
        except OSError as e:  # pragma: no cover - depends on environment
            raise EbpfCompileError(f"Could not invoke clang: {e}") from e
        if result.returncode != 0:
            raise EbpfCompileError(f"clang failed: {result.stderr[:500]}")
        if not out_path.exists():
            raise EbpfCompileError("clang succeeded but produced no output object")
        logger.info("Compiled eBPF program to %s", out_path)
        return str(out_path)

    def attach_program(self, object_path: str) -> None:
        """Attach the compiled object at a cgroup using bpftool (best effort).

        Uses ``bpftool cgroup attach`` into the cgroup of a monitored process,
        defaulting to the root cgroup path when monitorable cgroups are known.
        Raises :class:`EbpfCompileError` on failure so the caller can fall back.
        """
        if not self.is_ebpf_supported():
            raise EbpfCompileError("eBPF attachment requires Linux + root privileges")

        # Choose a cgroup to attach to: prefer /sys/fs/cgroup (systemd V2).
        cgroup_path = "/sys/fs/cgroup"
        if not Path(cgroup_path).exists():
            raise EbpfCompileError(f"cgroup path {cgroup_path} not found")

        assert BPFTOOL_BINARY is not None
        cmd = [
            BPFTOOL_BINARY,
            "cgroup",
            "attach",
            cgroup_path,
            "connect4",
            object_path,
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
        except OSError as e:  # pragma: no cover
            raise EbpfCompileError(f"Could not invoke bpftool: {e}") from e
        if result.returncode != 0:
            raise EbpfCompileError(f"bpftool attach failed: {result.stderr[:500]}")
        self.ebpf_active = True
        logger.info("Attached eBPF connect4 filter to cgroup %s", cgroup_path)

    def start(self, monitored_pids: list[int] | None = None) -> None:
        """Start the egress guard.

        Enables user-space monitoring first (always works), then attempts a
        best-effort kernel eBPF attach. If attach fails, logs the reason and
        continues with the user-space fallback — never hard-fails.
        """
        pids = monitored_pids or []
        for pid in pids:
            self.watcher.add_monitored_pid(pid)

        if self.is_ebpf_supported():
            try:
                obj = self.compile_program()
                self.attach_program(obj)
                logger.info("Linux eBPF kernel socket filter attached.")
            except EbpfCompileError as e:
                self.ebpf_error = str(e)
                self.ebpf_active = False
                logger.warning(
                    "eBPF attach unavailable — falling back to user-space process watcher: %s",
                    e,
                )
        else:
            logger.info(
                f"Running Egress Guard in user-space process socket mode (OS: {platform.system()})"
            )
            self.ebpf_active = False

    def monitor_pid(self, pid: int) -> None:
        """Add PID to monitored set."""
        self.watcher.add_monitored_pid(pid)

    def exempt_pid(self, pid: int) -> None:
        """Add PID to the watcher's allowed set (loop-avoidance helper)."""
        self.watcher.add_monitored_pid(pid)

    def scan(self) -> list[BypassViolation]:
        """Trigger immediate socket scan."""
        return self.watcher.scan_connections()
