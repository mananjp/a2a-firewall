"""Unit tests for best-effort eBPF compile/attach with fallback."""

from unittest.mock import MagicMock, patch

import pytest

from a2a_firewall.egress_guard.ebpf_loader import EbpfCompileError, EgressGuardLoader


def test_c_program_source_has_fwmark_loop_exclusion():
    src = EgressGuardLoader.get_c_program_source()
    assert "A2A_FWMARK 0xA2A1" in src
    assert "exempt_pids" in src
    assert "ctx->mark" in src


def test_start_never_hard_fails_when_ebpf_unsupported():
    with patch.object(EgressGuardLoader, "is_ebpf_supported", return_value=False):
        loader = EgressGuardLoader(proxy_port=8080)
        loader.start(monitored_pids=[111, 222])
        assert loader.ebpf_active is False
        assert 111 in loader.watcher.monitored_pids


def test_compile_raises_when_tooling_missing():
    with patch.object(EgressGuardLoader, "has_compile_tooling", return_value=False):
        loader = EgressGuardLoader(proxy_port=8080)
        with pytest.raises(EbpfCompileError):
            loader.compile_program()


@patch("a2a_firewall.egress_guard.ebpf_loader.BPFTOOL_BINARY", "/usr/bin/bpftool")
@patch("a2a_firewall.egress_guard.ebpf_loader.CLANG_BINARY", "/usr/bin/clang")
def test_compile_invokes_clang_and_returns_object(tmp_path):
    loader = EgressGuardLoader(proxy_port=8080)
    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stderr = ""

    out_path = tmp_path / "a2a_egress_guard.o"
    out_path.write_bytes(b"ELF")
    # Patch the File construction by using a dir that already contains the .o
    with patch("subprocess.run", return_value=mock_result):
        # out_dir == tmp_path so we can drop the .o in place
        result = loader.compile_program(output_dir=str(tmp_path))
        assert result == str(out_path)


def test_attach_raises_when_unsupported():
    loader = EgressGuardLoader(proxy_port=8080)
    with (
        patch.object(EgressGuardLoader, "is_ebpf_supported", return_value=False),
        pytest.raises(EbpfCompileError),
    ):
        loader.attach_program("/tmp/a2a_egress_guard.o")


def test_exempt_pid_registers_with_watcher():
    loader = EgressGuardLoader(proxy_port=8080)
    loader.exempt_pid(1234)
    assert 1234 in loader.watcher.monitored_pids


def test_build_map_update_commands_populates_monitored_and_exempt():
    commands = EgressGuardLoader.build_map_update_commands(
        monitor_pids=[100, 200], proxy_pid=999, map_dir="/sys/fs/bpf"
    )
    # one entry per monitored pid + one for the proxy's own exempt pid
    assert len(commands) == 3
    for cmd in commands:
        assert cmd[0] == "bpftool"
        assert cmd[1] == "map"
        assert cmd[2] == "update"
        assert cmd[3] == "pinned"
    assert commands[0][4].endswith("a2a_egress_map_monitored_pids")
    assert commands[1][4].endswith("a2a_egress_map_monitored_pids")
    assert commands[2][4].endswith("a2a_egress_map_exempt_pids")
    # Every key must be a valid little-endian hex u32.
    for cmd in commands:
        assert cmd[cmd.index("key") + 1].startswith("0x")


def test_populate_kernel_maps_noop_when_unsupported():
    loader = EgressGuardLoader(proxy_port=8080)
    with patch.object(EgressGuardLoader, "is_ebpf_supported", return_value=False):
        executed = loader.populate_kernel_maps(monitor_pids=[100], proxy_pid=999)
    assert executed == []


@patch("subprocess.run")
def test_populate_kernel_maps_runs_commands(mock_run):
    mock_run.return_value.returncode = 0
    mock_run.return_value.stderr = ""
    loader = EgressGuardLoader(proxy_port=8080)
    with patch.object(EgressGuardLoader, "is_ebpf_supported", return_value=True):
        executed = loader.populate_kernel_maps(
            monitor_pids=[100], proxy_pid=999, map_dir="/sys/fs/bpf"
        )
    assert len(executed) == 2
    assert mock_run.call_count == 2
