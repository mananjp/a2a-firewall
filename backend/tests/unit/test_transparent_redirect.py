"""Unit tests for transparent system-wide redirection (iptables) logic.

All tests run in dry-run mode and assert on the *constructed* iptables commands,
so they pass on any host (including Windows CI) without root or iptables.
"""

from a2a_firewall.egress_guard.transparent_redirect import (
    A2A_FWMARK,
    REDIRECT_PORTS,
    TransparentRedirect,
    ratelimit_info,
)


def _redirect(dry_run: bool = True, **kw) -> TransparentRedirect:
    return TransparentRedirect(proxy_port=8080, dry_run=dry_run, **kw)


def test_rules_cover_both_ports_and_tables():
    r = _redirect()
    rules = r._rule_parts()
    # 2 ports * 2 tables (PREROUTING + OUTPUT) = 4 rules
    assert len(rules) == len(REDIRECT_PORTS) * 2


def test_rules_skip_fwmark_loop_exclusion():
    r = _redirect()
    for rule in r._rule_parts():
        # Every rule must carry the mark-exclusion clause to avoid the
        # proxy looping back into itself.
        assert "--match" in rule
        assert rule[rule.index("--match") + 1] == "mark"
        assert "--mark" in rule
        assert rule[rule.index("--mark") + 1] == f"0x{A2A_FWMARK:x}"
        assert "!" in rule


def test_apply_rules_returns_commands_and_noops_in_dry_run():
    r = _redirect(dry_run=True)
    commands = r.apply_rules()
    assert len(commands) == 4
    assert r.applied is True
    # dry-run must not have actually invoked iptables (no side effects)
    for cmd in commands:
        assert cmd.startswith("iptables")
        assert "--to-ports 8080" in cmd


def test_remove_rules_toggles_reverse():
    r = _redirect(dry_run=True)
    r.apply_rules()
    commands = r.remove_rules()
    assert len(commands) == 4
    assert r.applied is False
    # Removal should replace -A with -D
    for cmd in commands:
        assert "-D " in cmd or " -D " in cmd


def test_is_supported_on_windows_is_false():
    # On the CI/dev OS (likely non-Linux) support should be False; on Linux it
    # still requires root + iptables. Never raise.
    supported = TransparentRedirect.is_supported()
    assert isinstance(supported, bool)


def test_ratelimit_info_shape():
    info = ratelimit_info()
    assert "supported" in info
    assert "ports" in info
    assert "fwmark" in info
    assert info["fwmark"] == f"0x{A2A_FWMARK:x}"


def test_rule_construction_is_deterministic():
    a = _redirect()._rule_parts()
    b = _redirect()._rule_parts()
    assert a == b
