"""Idempotent Linux installer for the A2A Firewall transparent proxy.

Coordinates the three pieces of a system-wide install:

1. systemd unit — runs the proxy as a background daemon.
2. iptables REDIRECT — transparently captures all outbound 80/443 egress.
3. OS CA trust — system trusts the local Root CA so MITM is transparent.

Every command is gated on ``dry_run`` (default) so the installer is safe to
inspect and unit-test on any host, including non-Linux CI containers.
"""

from __future__ import annotations

import logging
import os
import subprocess
from dataclasses import dataclass, field

from a2a_firewall.core.config import settings
from a2a_firewall.egress_guard.process_registry import ProcessRegistry
from a2a_firewall.egress_guard.transparent_redirect import TransparentRedirect
from a2a_firewall.proxy.trust import Capability, HostTrust
from a2a_firewall.service.unit import SystemdUnit

logger = logging.getLogger("a2a_firewall.service.installer")


@dataclass
class LinuxInstaller:
    """Performs a transparent proxy install/uninstall on Linux hosts."""

    unit: SystemdUnit = field(default_factory=SystemdUnit)
    ca_dir: str | None = None
    dry_run: bool = True
    registry: ProcessRegistry = field(default_factory=ProcessRegistry)
    uid_owner: int | None = field(default_factory=lambda: settings.A2A_AGENT_UID)

    def _run(self, cmd: list[str]) -> bool:
        """Run a system command, or log it in dry-run mode."""
        if self.dry_run:
            logger.info("[dry-run] %s", " ".join(cmd))
            return True
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
            return True
        except subprocess.CalledProcessError as e:
            logger.error("Command failed (%s): %s", " ".join(cmd), e.stderr[:300])
            return False

    # ------------------------------------------------------------------ #
    # Install
    # ------------------------------------------------------------------ #
    def install(self) -> dict[str, object]:
        """Idempotently install unit + redirect + CA trust."""
        steps: dict[str, object] = {}

        # 1. CA trust
        cap = Capability(sys_name="POSIX", proc_libc_ver="0")
        trust = HostTrust(capability=cap, ca_dir=self.ca_dir, dry_run=self.dry_run)
        steps["ca_trust"] = trust.install_to_system()

        # 2. Write + enable systemd unit
        unit_exec = self._write_unit()
        steps["unit_written"] = unit_exec
        if unit_exec:
            steps["daemon_reload"] = self._run(["systemctl", "daemon-reload"])
        steps["service_enabled"] = self._run(["systemctl", "enable", self.unit.unit_filename])

        # 3. Transparent redirect (applies iptables rules, scoped to the agent uid)
        redirect = TransparentRedirect(
            proxy_port=8080, dry_run=self.dry_run, uid_owner=self.uid_owner
        )
        steps["redirect_rules"] = redirect.apply_rules()
        steps["redirect_uid_owner"] = self.uid_owner

        logger.info("Install complete (dry_run=%s): %s", self.dry_run, steps)
        return steps

    def _write_unit(self) -> bool:
        """Write the rendered unit file to /etc/systemd/system."""
        content = self.unit.render()
        if self.dry_run:
            logger.info("[dry-run] write %s:\n%s", self.unit_path, content)
            return True
        try:
            path = os.path.join(self.unit_path)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(content)
            return True
        except OSError as e:
            logger.error("Could not write unit file: %s", e)
            return False

    @property
    def unit_path(self) -> str:
        return f"/etc/systemd/system/{self.unit.unit_filename}"

    # ------------------------------------------------------------------ #
    # Uninstall & status
    # ------------------------------------------------------------------ #
    def uninstall(self) -> dict[str, object]:
        """Disable/stop the service, remove redirects, untrust CA, remove unit."""
        steps: dict[str, object] = {}
        steps["service_disabled"] = self._run(["systemctl", "disable", self.unit.unit_filename])
        redirect = TransparentRedirect(
            proxy_port=8080, dry_run=self.dry_run, uid_owner=self.uid_owner
        )
        steps["redirect_rules_removed"] = redirect.remove_rules()
        # Reverse the CA trust so the A2A root cert is never left behind.
        cap = Capability(sys_name="POSIX", proc_libc_ver="0")
        trust = HostTrust(capability=cap, ca_dir=self.ca_dir, dry_run=self.dry_run)
        steps["ca_trust_removed"] = trust.remove_from_system()
        steps["unit_removed"] = self._remove_unit()
        steps["daemon_reload"] = self._run(["systemctl", "daemon-reload"])
        return steps

    def _remove_unit(self) -> bool:
        if self.dry_run:
            logger.info("[dry-run] remove %s", self.unit_path)
            return True
        try:
            os.remove(self.unit_path)
            return True
        except FileNotFoundError:
            return True
        except OSError as e:
            logger.error("Could not remove unit file: %s", e)
            return False

    def status(self) -> dict[str, object]:
        """Report current install state without mutating the system."""
        redirect = TransparentRedirect(proxy_port=8080, dry_run=self.dry_run)
        return {
            "unit_file_exists": os.path.exists(self.unit_path) if not self.dry_run else None,
            "redirect_active": redirect.is_active(),
            "supported": TransparentRedirect.is_supported(),
        }
