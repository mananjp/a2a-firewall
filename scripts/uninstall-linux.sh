#!/usr/bin/env bash
# A2A Firewall — system-wide transparent proxy uninstaller (Linux).
#
#   sudo ./scripts/uninstall-linux.sh
#
# Stops/disables the systemd service, removes the iptables REDIRECT rules
# (PREROUTING + OUTPUT for tcp 80/443 skipping the A2A fwmark), and removes
# the unit file. Dry-run on non-Linux/unprivileged hosts.
set -euo pipefail

CPREFIX="${CPREFIX:-a2a-proxy}"
MARK="0xa2a1"
PORT="${PORT:-8080}"

EUID_CHECK=$(id -u 2>/dev/null || echo 1000)
KERNEL=$(uname -s 2>/dev/null || echo Unknown)

if [[ "$KERNEL" != "Linux" || "$EUID_CHECK" != "0" ]]; then
    echo "[a2a] Not a privileged Linux host — showing plan only (dry-run)."
    echo "[a2a] Would run: a2a-proxy uninstall --no-dry-run"
    for p in 80 443; do
        echo "[a2a]   iptables -t nat -D PREROUTING -p tcp --match mark ! --mark $MARK --dport $p -j REDIRECT --to-ports $PORT"
        echo "[a2a]   iptables -t nat -D OUTPUT     -p tcp --match mark ! --mark $MARK --dport $p -j REDIRECT --to-ports $PORT"
    done
    echo "[a2a] Dry-run complete — no changes made."
    exit 0
fi

echo "[a2a] Uninstalling A2A Firewall transparent proxy..."
a2a-proxy uninstall --no-dry-run
systemctl disable "$CPREFIX.service" 2>/dev/null || true
systemctl stop  "$CPREFIX.service" 2>/dev/null || true
rm -f "/etc/systemd/system/$CPREFIX.service"
systemctl daemon-reload
echo "[a2a] Uninstall complete."
