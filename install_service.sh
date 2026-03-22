#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="xpert"
SERVICE_DESCRIPTION="Xpert Service"
SERVICE_DOCUMENTATION="https://github.com/mybrohigh/Xpert"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_PY_PATH="$SCRIPT_DIR/main.py"
VENV_PY="$SCRIPT_DIR/venv/bin/python"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [ ! -f "$MAIN_PY_PATH" ]; then
  echo "main.py not found at $MAIN_PY_PATH"
  exit 1
fi

if [ -x "$VENV_PY" ]; then
  EXEC_START="$VENV_PY $MAIN_PY_PATH"
else
  EXEC_START="/usr/bin/env python3 $MAIN_PY_PATH"
fi

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=$SERVICE_DESCRIPTION
Documentation=$SERVICE_DOCUMENTATION
After=network.target nss-lookup.target

[Service]
WorkingDirectory=$SCRIPT_DIR
ExecStart=$EXEC_START
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

echo "Service file created at: $SERVICE_FILE"
