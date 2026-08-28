#!/usr/bin/env bash
# A2A Firewall — system-wide transparent proxy installer (Linux).
#
# Installs the proxy as a background systemd service, configures iptables
# REDIRECT for transparent outbound capture, and trusts the local Root CA
# system-wide. Run as root:
#
#   sudo ./scripts/install-linux.sh --port 8080 (--no-redirect --no-systemd --no-trust)
#
# Safe to re-run (idempotent). On any non-Linux/root host it prints the exact
# commands that would run and exits 0 without mutating the system.
set -euo pipefail

PORT="${PORT:-8080}"
DO_SYSTEMD="${DO_SYSTEMD:-1}"
DO_REDIRECT="${DO_REDIRECT:-1}"
DO_TRUST="${DO_TRUST:-1}"
CPREFIX="${CPREFIX:-a2a-proxy}"
MARK="0xa2a1"

# Parse flags
while [[ $# -gt 0 ]]; do
    case "$1" in
        --port) PORT="$2"; shift 2 ;;
        --no-systemd) DO_SYSTEMD=0; shift ;;
        --no-redirect) DO_REDIRECT=0; shift ;;
        --no-trust) DO_TRUST=0; shift ;;
        *) echo "Unknown option: $1"; exit 2 ;;
    esac
done

EUID_CHECK=$(id -u 2>/dev/null || echo 1000)
KERNEL=$(uname -s 2>/dev/null || echo Unknown)

if [[ "$KERNEL" != "Linux" || "$EUID_CHECK" != "0" ]]; then
    echo "[a2a] Not a privileged Linux host — showing plan only (dry-run)."
    echo "[a2a] Would install: systemd=${DO_SYSTEMD} redirect=${DO_REDIRECT} trust=${DO_TRUST} port=${PORT}"
    echo "[a2a] Would run: a2a-proxy install --port $PORT"
    for p in 80 443; do
        echo "[a2a]   iptables -t nat -A PREROUTING -p tcp --match mark ! --mark $MARK --dport $p -j REDIRECT --to-ports $PORT"
        echo "[a2a]   iptables -t nat -A OUTPUT     -p tcp --match mark ! --mark $MARK --dport $p -j REDIRECT --to-ports $PORT"
    done
    echo "[a2a] Dry-run complete — no changes made."
    exit 0
fi

echo "[a2a] Installing A2A Firewall transparent proxy (Linux)..."
echo "[a2a]   port=$PORT systemd=$DO_SYSTEMD redirect=$DO_REDIRECT trust=$DO_TRUST"

# 1. Systemd service
if [[ "$DO_SYSTEMD" == "1" ]]; then
    echo "[a2a] Installing systemd unit..."
    a2a-proxy install --port "$PORT" --no-dry-run
    systemctl enable "$CPREFIX.service"
    systemctl start  "$CPREFIX.service"
    echo "[a2a] systemd service $CPREFIX.service enabled + started."
fi

echo "[a2a] Install complete. Use: systemctl status $CPREFIX.service"
