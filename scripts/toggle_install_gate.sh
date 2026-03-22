#!/usr/bin/env bash
set -euo pipefail

GATE_FILE="/etc/nginx/xpert_install_gate.conf"
MODE="${1:-}"

case "$MODE" in
  open)
    echo "# install access open" > "$GATE_FILE"
    ;;
  close)
    echo "return 403;" > "$GATE_FILE"
    ;;
  status)
    if [ ! -f "$GATE_FILE" ]; then
      echo "missing"
      exit 0
    fi
    if grep -q "return 403" "$GATE_FILE"; then
      echo "closed"
    else
      echo "open"
    fi
    exit 0
    ;;
  *)
    echo "Usage: $0 {open|close|status}" >&2
    exit 1
    ;;
esac

nginx -t
systemctl reload nginx

echo "OK: $MODE"
