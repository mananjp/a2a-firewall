"""OS trust-store automation for the A2A Local Root CA.

On Linux, installs the root cert into the system trust anchors
(``/usr/local/share/ca-certificates`` + ``update-ca-certificates``) so that
TLS MITM interception through the transparent proxy is trusted system-wide.
Helpers are kept side-effect-free and testable via a small ``Capability``
abstraction that can be mocked on non-POSIX hosts (e.g. Windows CI).
"""

from __future__ import annotations

import contextlib
import logging
import os
import platform
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from a2a_firewall.proxy.ca import CertificateAuthority

logger = logging.getLogger("a2a_firewall.proxy.trust")

CERT_INSTALL_DIR = "/usr/local/share/ca-certificates"
INSTALLED_FILENAME = "a2a-root.crt"


@dataclass(frozen=True)
class Capability:
    """Minimal platform capability description (mirrors platform module)."""

    sys_name: str
    proc_libc_ver: str
    platform_system: str | None = None

    @property
    def is_posix(self) -> bool:
        return self.sys_name.lower() in ("posix", "linux", "darwin")


class HostTrust:
    """Installs/removes the A2A Root CA in the OS trust store."""

    def __init__(
        self,
        capability: Capability | None = None,
        ca_dir: str | Path | None = None,
        cert_install_dir: str = CERT_INSTALL_DIR,
        dry_run: bool = True,
    ):
        self.capability = capability or _detect_capability()
        self.ca = CertificateAuthority(ca_dir=ca_dir or Path.home() / ".a2a" / "ca")
        self.cert_install_dir = cert_install_dir
        self.dry_run = dry_run

    @property
    def root_cert_bytes(self) -> bytes:
        return self.ca.root_cert_pem

    @property
    def source_cert_path(self) -> str:
        return self.ca.root_cert_path

    @property
    def installed_path(self) -> str:
        return os.path.join(self.cert_install_dir, INSTALLED_FILENAME)

    def _can_update_certs(self) -> bool:
        return self.capability.is_posix and shutil.which("update-ca-certificates") is not None

    def install_to_system(self) -> dict[str, object]:
        """Install the root cert into the OS trust store (POSIX/Linux).

        Returns a structured result describing what was done.
        """
        if not self.capability.is_posix:
            return {
                "installed": False,
                "reason": "Non-POSIX host — system CA trust not modified",
                "path": None,
            }

        # 1. Copy the cert into the ca-certificates bundle dir.
        try:
            os.makedirs(self.cert_install_dir, exist_ok=True)
        except OSError as e:
            return {"installed": False, "reason": f"mkdir failed: {e}", "path": None}

        if not self.dry_run:
            try:
                Path(self.installed_path).write_bytes(self.root_cert_bytes)
            except OSError as e:
                return {
                    "installed": False,
                    "reason": f"write failed: {e}",
                    "path": self.installed_path,
                }
        else:
            logger.info(
                "[dry-run] write %s (%d bytes)", self.installed_path, len(self.root_cert_bytes)
            )

        # 2. Run update-ca-certificates.
        updated = False
        if self._can_update_certs() and not self.dry_run:
            try:
                subprocess.run(
                    ["update-ca-certificates"],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                updated = True
            except subprocess.CalledProcessError as e:
                logger.warning("update-ca-certificates failed: %s", e.stderr[:300])
        elif self.dry_run:
            logger.info("[dry-run] update-ca-certificates")
            updated = True

        return {
            "installed": True,
            "updated": updated,
            "path": self.installed_path,
            "dry_run": self.dry_run,
        }

    def remove_from_system(self) -> dict[str, object]:
        """Reverse :meth:`install_to_system` when possible."""
        removed = False
        try:
            if os.path.exists(self.installed_path):
                os.remove(self.installed_path)
                removed = True
        except OSError as e:
            return {"removed": False, "reason": f"remove failed: {e}"}

        if self._can_update_certs() and not self.dry_run:
            with contextlib.suppress(subprocess.CalledProcessError):
                subprocess.run(
                    ["update-ca-certificates"], check=True, capture_output=True, text=True
                )
        return {
            "removed": removed,
            "path": self.installed_path,
            "dry_run": self.dry_run,
        }


def _detect_capability() -> Capability:
    """Build a :class:`Capability` from the real platform environment."""
    return Capability(
        sys_name=os.name,
        proc_libc_ver=platform.libc_ver()[1] if platform.libc_ver()[0] else "0",
        platform_system=platform.system(),
    )
