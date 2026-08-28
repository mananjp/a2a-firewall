"""Unit tests for the systemd service unit renderer."""

from a2a_firewall.service.unit import SystemdUnit


def test_unit_render_contains_basic_sections():
    unit = SystemdUnit().render()
    assert "[Unit]" in unit
    assert "[Service]" in unit
    assert "[Install]" in unit


def test_unit_has_daemon_exec_start():
    unit = SystemdUnit().render()
    assert "ExecStart=a2a-proxy daemon" in unit


def test_unit_exports_ca_trust_env_vars():
    unit = SystemdUnit().render()
    assert "SSL_CERT_FILE=" in unit
    assert "REQUESTS_CA_BUNDLE=" in unit
    assert "CURL_CA_BUNDLE=" in unit
    assert "NODE_EXTRA_CA_CERTS=" in unit


def test_unit_exports_fwmark_and_flags():
    unit = SystemdUnit(redirect_enabled=True, inspect_enabled=False).render()
    assert "A2A_FW_MARK=0xa2a1" in unit
    assert "A2A_REDIRECT_ENABLED=1" in unit
    assert "A2A_INSPECT_ENABLED=0" in unit


def test_unit_filename_is_stable():
    assert SystemdUnit().unit_filename == "a2a-proxy.service"


def test_unit_render_is_deterministic():
    a = SystemdUnit().render()
    b = SystemdUnit().render()
    assert a == b


def test_unit_custom_exec_and_restarts():
    unit = SystemdUnit(exec_path="/opt/a2a/bin/a2a-proxy", restarts="always").render()
    assert "ExecStart=/opt/a2a/bin/a2a-proxy daemon" in unit
    assert "Restart=always" in unit
