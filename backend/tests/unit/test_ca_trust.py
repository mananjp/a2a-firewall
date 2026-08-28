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
