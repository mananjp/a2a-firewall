"""Unit tests for Kernel & Process Egress Guard (eBPF & Process Socket Monitor)."""

from collections import namedtuple
from unittest.mock import MagicMock, patch

from a2a_firewall.egress_guard.ebpf_loader import EgressGuardLoader
from a2a_firewall.egress_guard.process_watcher import BypassViolation, ProcessEgressWatcher

MockAddr = namedtuple("MockAddr", ["ip", "port"])
MockConn = namedtuple("MockConn", ["pid", "raddr", "status"])


def test_ebpf_source_and_c_program():
    """Verify eBPF C program source exists and contains required kernel hook."""
    src = EgressGuardLoader.get_c_program_source()
    assert "a2a_sock_connect4" in src
    assert "cgroup/connect4" in src
    assert "PROXY_PORT 8080" in src
    assert "bpf_sock_addr" in src


def test_egress_guard_loader_initialization():
    """Verify loader initializes watcher and detects platform capabilities."""
    loader = EgressGuardLoader(proxy_port=8080)
    assert loader.proxy_port == 8080
    assert loader.watcher is not None
    # Verify is_ebpf_supported runs cleanly
    supported = EgressGuardLoader.is_ebpf_supported()
    assert isinstance(supported, bool)


def test_process_watcher_pid_management():
    """Verify registration and unregistration of monitored process IDs."""
    watcher = ProcessEgressWatcher(proxy_port=8080)
    watcher.add_monitored_pid(1234)
    watcher.add_monitored_pid(5678)
    assert 1234 in watcher.monitored_pids
    assert 5678 in watcher.monitored_pids

    watcher.remove_monitored_pid(1234)
    assert 1234 not in watcher.monitored_pids
    assert 5678 in watcher.monitored_pids


def test_process_watcher_detects_proxy_bypass():
    """Verify that unproxied connections to external IPs are flagged as bypass violations."""
    captured_violations = []

    def on_bypass(v: BypassViolation):
        captured_violations.append(v)

    watcher = ProcessEgressWatcher(
        proxy_port=8080,
        allowed_ips=["127.0.0.1"],
        on_bypass=on_bypass,
    )
    watcher.add_monitored_pid(9999)

    # Mock psutil net_connections with:
    # 1. Monitored PID connecting to local proxy (allowed)
    # 2. Monitored PID connecting directly to public IP 142.250.190.46:443 (bypass!)
    # 3. Unmonitored PID connecting to public IP (ignored)
    mock_connections = [
        MockConn(pid=9999, raddr=MockAddr(ip="127.0.0.1", port=8080), status="ESTABLISHED"),
        MockConn(pid=9999, raddr=MockAddr(ip="142.250.190.46", port=443), status="ESTABLISHED"),
        MockConn(pid=1111, raddr=MockAddr(ip="142.250.190.46", port=443), status="ESTABLISHED"),
    ]

    with patch("psutil.net_connections", return_value=mock_connections):
        with patch("psutil.Process") as mock_proc_cls:
            mock_proc = MagicMock()
            mock_proc.name.return_value = "python_agent"
            mock_proc_cls.return_value = mock_proc

            violations = watcher.scan_connections()

    assert len(violations) == 1
    v = violations[0]
    assert v.pid == 9999
    assert v.remote_ip == "142.250.190.46"
    assert v.remote_port == 443
    assert v.process_name == "python_agent"
    assert len(captured_violations) == 1
