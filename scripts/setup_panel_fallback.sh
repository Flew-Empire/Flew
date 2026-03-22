#!/usr/bin/env bash
set -euo pipefail

DOMAIN=""
INSTALL_DIR="/opt/xpert"
NGINX_PORT=8443
XRAY_PORT=443

usage() {
  cat <<'USAGE'
Configure Xray TLS fallback on 443 and local-only nginx for the panel.

Usage:
  setup_panel_fallback.sh --domain panel.example.com [--install-dir /opt/xpert]

Options:
  --domain       Panel domain (required)
  --install-dir  Xpert install directory (default: /opt/xpert)
  --nginx-port   Local nginx port (default: 8443)
  --xray-port    Public xray port (default: 443)
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --install-dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --nginx-port) NGINX_PORT="${2:-}"; shift 2 ;;
    --xray-port) XRAY_PORT="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root (sudo)."
  exit 1
fi

if [ -z "$DOMAIN" ]; then
  echo "Panel domain is required."
  usage
  exit 1
fi

DOMAIN="$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]')"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
CERT_PATH="$CERT_DIR/fullchain.pem"
KEY_PATH="$CERT_DIR/privkey.pem"

if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
  echo "TLS certificate not found for $DOMAIN."
  echo "Expected: $CERT_PATH and $KEY_PATH"
  exit 1
fi

install_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get update -y
    DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
    return 0
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y "$@"
    return 0
  elif command -v yum >/dev/null 2>&1; then
    yum install -y "$@"
    return 0
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache "$@"
    return 0
  fi
  return 1
}

if ! command -v nginx >/dev/null 2>&1; then
  echo "nginx not found. Installing..."
  if ! install_packages nginx; then
    echo "Failed to install nginx."
    exit 1
  fi
fi

mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

cat > /etc/nginx/sites-available/xpert_panel <<EOF
server {
    listen 127.0.0.1:${NGINX_PORT} proxy_protocol;
    listen [::1]:${NGINX_PORT} proxy_protocol;
    server_name ${DOMAIN};

    # Accept real client IP from Xray fallback (PROXY protocol)
    set_real_ip_from 127.0.0.1;
    real_ip_header proxy_protocol;
    real_ip_recursive on;

    root ${INSTALL_DIR}/app/dashboard/build;
    index index.html;

    # Block install API on main panel domain
    location ^~ /api/install/ {
        return 404;
    }

    location /statics/ {
        try_files \$uri =404;
        expires 7d;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /sub/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /exec/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
    }

    # VLESS WS behind fallback
    location /ws/ {
        proxy_pass http://127.0.0.1:2080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
}
EOF

ln -sfn /etc/nginx/sites-available/xpert_panel /etc/nginx/sites-enabled/xpert_panel

if [ -f /etc/nginx/sites-enabled/default ]; then
  mv /etc/nginx/sites-enabled/default /etc/nginx/sites-available/default.disabled
fi

nginx -t
systemctl reload nginx

XRAY_CONFIG="${INSTALL_DIR}/xray_config.json"
if [ ! -f "$XRAY_CONFIG" ]; then
  echo "xray_config.json not found at $XRAY_CONFIG"
  exit 1
fi

python3 - "$XRAY_CONFIG" "$DOMAIN" "$CERT_PATH" "$KEY_PATH" "$XRAY_PORT" "$NGINX_PORT" <<'PY'
import json
import sys

path, domain, cert_path, key_path, xray_port, nginx_port = sys.argv[1:7]
xray_port = int(xray_port)
nginx_port = int(nginx_port)

with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

inbounds = data.get("inbounds", [])
tag = "XPERT_TLS_FALLBACK"
inbound = next((item for item in inbounds if item.get("tag") == tag), None)

if inbound is None:
    inbound = {
        "tag": tag,
        "listen": "0.0.0.0",
        "port": xray_port,
        "protocol": "vless",
        "settings": {
            "clients": [],
            "decryption": "none",
            "fallbacks": []
        },
        "streamSettings": {
            "network": "tcp",
            "security": "tls",
            "tlsSettings": {}
        }
    }
    inbounds.append(inbound)

inbound["listen"] = "0.0.0.0"
inbound["port"] = xray_port
inbound["protocol"] = "vless"

settings = inbound.setdefault("settings", {})
settings.setdefault("clients", [])
settings["decryption"] = "none"
settings["fallbacks"] = [
    {
        "name": domain,
        "dest": nginx_port,
        "xver": 1
    }
]

stream = inbound.setdefault("streamSettings", {})
stream["network"] = "tcp"
stream["security"] = "tls"
tls = stream.setdefault("tlsSettings", {})
tls["alpn"] = ["http/1.1"]
tls["certificates"] = [
    {
        "certificateFile": cert_path,
        "keyFile": key_path
    }
]

data["inbounds"] = inbounds

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY

echo "Fallback configured: Xray ${XRAY_PORT} -> nginx 127.0.0.1:${NGINX_PORT}"
