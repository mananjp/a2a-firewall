"""Unit tests for OS CA auto-trust (Linux + dry-run safe)."""

from a2a_firewall.proxy.trust import Capability, HostTrust, _detect_capability


def test_capability_is_posix_detection():
    assert Capability(sys_name="posix", proc_libc_ver="0").is_posix
    assert Capability(sys_name="linux", proc_libc_ver="0").is_posix
    assert not Capability(sys_name="nt", proc_libc_ver="0").is_posix


def test_host_trust_installs_cert_on_posix_dry_run():
    trust = HostTrust(capability=Capability(sys_name="posix", proc_libc_ver="0"), dry_run=True)
    result = trust.install_to_system()
    assert result["installed"] is True
    assert result["path"].endswith("a2a-root.crt")
    assert result["dry_run"] is True


def test_host_trust_will_not_touch_non_posix():
    trust = HostTrust(capability=Capability(sys_name="nt", proc_libc_ver="0"))
    result = trust.install_to_system()
    assert result["installed"] is False
    assert "Non-POSIX" in result["reason"]


def test_host_trust_remove_dry_run():
    trust = HostTrust(capability=Capability(sys_name="posix", proc_libc_ver="0"), dry_run=True)
    # With dry_run and nothing installed, removal reports cleanly.
    result = trust.remove_from_system()
    assert result["dry_run"] is True


def test_detect_capability_returns_valid_object():
    cap = _detect_capability()
    assert isinstance(cap, Capability)


def test_linux_installer_uninstall_untrusts_ca():
    """Uninstall must reverse the CA trust (never leave the root cert behind)."""
    from a2a_firewall.service.linux_installer import LinuxInstaller

    installer = LinuxInstaller(dry_run=True)
    steps = installer.uninstall()
    assert "ca_trust_removed" in steps
    assert steps["ca_trust_removed"]["dry_run"] is True
    assert "redirect_rules_removed" in steps


def test_cli_uninstall_reports_ca_removal(capsys):
    """The `uninstall` subcommand must surface CA-removal (not just iptables)."""
    from types import SimpleNamespace

    from a2a_firewall.proxy.cli import _cmd_uninstall

    args = SimpleNamespace(no_dry_run=False, port=8080, ca_dir=None)
    _cmd_uninstall(args)
    out = capsys.readouterr().out
    assert '"ca_trust_removed"' in out
    assert '"redirect_rules_removed"' in out
