"""System-wide transparent egress redirection via iptables/nftables.

Installs a PREROUTING REDIRECT rule in the ``nat`` table so that **all**
outbound TCP on ports 80/443 is transparently sent to the local A2A proxy —
the standard mitmproxy transparent-mode pattern. No per-app env vars
(``HTTPS_PROXY``) are required because the redirect happens at the kernel
network layer before the application resolves where it is going.

Loop-avoidance: the proxy's own outbound sockets are marked with ``A2A_FWMARK``
(``SO_MARK``) in user-space, and the rule explicitly skips marked packets via
``--match mark ! --mark <A2A_FWMARK>``. Without this the proxy's upstream
connections would be redirected back into itself, creating an infinite loop.
"""

from __future__ import annotations

import logging
import platform
import shutil
import subprocess
from dataclasses import dataclass

logger = logging.getLogger("a2a_firewall.egress_guard.redirect")

A2A_FWMARK = 0xA2A1
REDIRECT_PORTS = (80, 443)


def is_linux() -> bool:
    return platform.system() == "Linux"


def _as_mark(mark: int) -> str:
    return f"0x{mark:x}"


@dataclass
class TransparentRedirect:
    """Installs/removes system-wide transparent redirection to the proxy.

    The :attr:`dry_run` flag makes every operation a no-op that only logs the
    exact commands that *would* be executed. This keeps the module safe and
    testable on non-Linux hosts and in unprivileged CI containers.
    """

    proxy_port: int = 8080
    ports: tuple[int, ...] = REDIRECT_PORTS
    fwmark: int = A2A_FWMARK
    chain: str = "A2A_FIREWALL_REDIRECT"
    dry_run: bool = True
    _applied: bool = False

    # ------------------------------------------------------------------ #
    # Capability checks
    # ------------------------------------------------------------------ #
    @classmethod
    def is_supported(cls) -> bool:
        """True only on Linux with root privileges and an iptables binary."""
        if not is_linux():
            return False
        geteuid = getattr(__import__("os"), "geteuid", None)
        if geteuid is None or geteuid() != 0:
            return False
        return shutil.which("iptables") is not None

    # ------------------------------------------------------------------ #
    # Rule construction (pure — unit-testable on any host)
    # ------------------------------------------------------------------ #
    def _rule_parts(self) -> list[list[str]]:
        """Return the ordered side-effect-free rule argv lists."""
        rules: list[list[str]] = []
        for port in self.ports:
            rules.append(
                [
                    "-t",
                    "nat",
                    "-A",
                    "PREROUTING",
                    "-p",
                    "tcp",
                    "--match",
                    "mark",
                    "!",
                    "--mark",
                    _as_mark(self.fwmark),
                    "--dport",
                    str(port),
                    "-j",
                    "REDIRECT",
                    "--to-ports",
                    str(self.proxy_port),
                ]
            )
            rules.append(
                [
                    "-t",
                    "nat",
                    "-A",
                    "OUTPUT",
                    "-p",
                    "tcp",
                    "--match",
                    "mark",
                    "!",
                    "--mark",
                    _as_mark(self.fwmark),
                    "--dport",
                    str(port),
                    "-j",
                    "REDIRECT",
                    "--to-ports",
                    str(self.proxy_port),
                ]
            )
        return rules

    def apply_rules(self) -> list[str]:
        """Install the PREROUTING/OUTPUT REDIRECT rules.

        Returns the list of commands executed (or that would be executed in
        dry-run mode).
        """
        commands = []
        for rule in self._rule_parts():
            cmd = ["iptables", *rule]
            commands.append(" ".join(cmd))
            if not self.dry_run and self.is_supported():
                subprocess.run(cmd, check=True, capture_output=True, text=True)
        self._applied = True
        logger.info(
            "Installed %d transparent REDIRECT rules to proxy :%d (dry_run=%s)",
            len(commands),
            self.proxy_port,
            self.dry_run,
        )
        return commands

    def remove_rules(self) -> list[str]:
        """Remove the REDIRECT rules previously installed."""
        commands = []
        for rule in self._rule_parts():
            replace = list(rule)
            if "-A" in replace:
                replace[replace.index("-A")] = "-D"
            cmd = ["iptables", *replace]
            commands.append(" ".join(cmd))
            if not self.dry_run and self.is_supported():
                # Best-effort removal — a missing rule is not fatal.
                subprocess.run(cmd, capture_output=True, text=True)
        self._applied = False
        logger.info(
            "Removed %d transparent REDIRECT rules (dry_run=%s)",
            len(commands),
            self.dry_run,
        )
        return commands

    @property
    def applied(self) -> bool:
        return self._applied

    def is_active(self) -> bool:
        """List installed iptables rules matching our chain/port signature.

        Pure dry-run-safe: parses ``iptables -t nat -S`` output when available.
        """
        if self.dry_run or not self.is_supported():
            # In dry-run / unsupported mode we cannot query the live table;
            # reflect the in-memory applied state instead.
            return self._applied
        try:
            result = subprocess.run(
                ["iptables", "-t", "nat", "-S"],
                capture_output=True,
                text=True,
                check=True,
            )
        except subprocess.CalledProcessError:
            return self._applied
        text = result.stdout
        matches = 0
        for port in self.ports:
            for table_line in ("PREROUTING", "OUTPUT"):
                sig = f"--dport {port}"
                if f"-A {table_line}" in text and sig in text:
                    matches += 1
        return matches > 0

    # ------------------------------------------------------------------ #
    # Context-manager convenience
    # ------------------------------------------------------------------ #
    def __enter__(self) -> TransparentRedirect:
        self.apply_rules()
        return self

    def __exit__(self, *_exc: object) -> None:
        if self._applied:
            self.remove_rules()


def mark_own_socket(enable: bool = True, nonce: bytes | None = None) -> None:
    """Mark the calling process's outbound sockets to skip redirection.

    Uses ``SO_MARK`` on a temporary socket to set the process-wide marker on
    Linux. This is the companion to ``--match mark ! --mark`` in the iptables
    rule. On non-Linux platforms it is a documented no-op.

    :param nonce: optional 4-byte nonce to OR into the mark for uniqueness;
        defaults to the canonical :data:`A2A_FWMARK`.
    """
    if not is_linux():
        logger.debug("SO_MARK marking is Linux-only — skipping")
        return
    mark = A2A_FWMARK | (int.from_bytes((nonce or b"\x00\x00\x00\x00"), "big"))
    try:
        import socket

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.setsockopt(socket.SOL_SOCKET, getattr(socket, "SO_MARK", 36), mark)
        finally:
            sock.close()
        logger.info("Marked process outbound sockets with SO_MARK=0x%x", mark)
    except OSError as e:  # pragma: no cover - depends on kernel/caps
        logger.warning("Could not set SO_MARK: %s", e)


def ratelimit_info() -> dict[str, object]:
    """Human-readable summary of the planned redirection, for status output."""
    return {
        "supported": TransparentRedirect.is_supported(),
        "ports": list(REDIRECT_PORTS),
        "fwmark": _as_mark(A2A_FWMARK),
    }
