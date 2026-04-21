#!/usr/bin/env bash
set -euo pipefail

DOMAIN=""
PANEL_UPSTREAM="http://127.0.0.1:8000"
WEBROOT="/var/www/letsencrypt"
EMAIL=""
USE_UNSAFE_NO_EMAIL=1
NGINX_SITE_PATH="/etc/nginx/sites-available/flew"
CERTBOT_PYTHONPATH="/usr/lib/python3/dist-packages"
NGINX_WAS_ACTIVE=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DASHBOARD_BUILD_DIR="${PROJECT_ROOT}/app/dashboard/build"
DASHBOARD_STATICS_DIR="${DASHBOARD_BUILD_DIR}/statics"
DASHBOARD_ASSETS_DIR="${DASHBOARD_BUILD_DIR}/assets"
DASHBOARD_GENERATOR_DIR="${DASHBOARD_BUILD_DIR}/inbound-generator"
PUBLIC_DASHBOARD_DIR="/var/www/flew-dashboard"
PUBLIC_DASHBOARD_STATICS_DIR="${PUBLIC_DASHBOARD_DIR}/statics"
PUBLIC_DASHBOARD_ASSETS_DIR="${PUBLIC_DASHBOARD_DIR}/assets"
PUBLIC_DASHBOARD_GENERATOR_DIR="${PUBLIC_DASHBOARD_DIR}/inbound-generator"

usage() {
  cat <<'USAGE'
Configure HTTPS for a Flew panel domain and redirect / to /dashboard/.

Usage:
  setup_https_dashboard_domain.sh --domain panel.example.com
  setup_https_dashboard_domain.sh --domain panel.example.com --email admin@example.com

Options:
  --domain         Domain to configure
  --email          Email for Let's Encrypt registration (optional)
  --upstream       Backend upstream (default: http://127.0.0.1:8000)
  --webroot        ACME webroot directory (default: /var/www/letsencrypt)
  --nginx-site     Nginx site path (default: /etc/nginx/sites-available/flew)
USAGE
}

restore_nginx_if_needed() {
  if [ "$NGINX_WAS_ACTIVE" -eq 1 ] && command -v systemctl >/dev/null 2>&1; then
    if ! systemctl is-active --quiet nginx; then
      systemctl start nginx || true
    fi
  fi
}

trap restore_nginx_if_needed EXIT

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; USE_UNSAFE_NO_EMAIL=0; shift 2 ;;
    --upstream) PANEL_UPSTREAM="${2:-}"; shift 2 ;;
    --webroot) WEBROOT="${2:-}"; shift 2 ;;
    --nginx-site) NGINX_SITE_PATH="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root."
  exit 1
fi

if [ -z "$DOMAIN" ]; then
  echo "Domain is required."
  usage
  exit 1
fi

DOMAIN="$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]')"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
FULLCHAIN="${CERT_DIR}/fullchain.pem"
PRIVKEY="${CERT_DIR}/privkey.pem"
SITE_LINK="/etc/nginx/sites-enabled/$(basename "$NGINX_SITE_PATH")"

mkdir -p "$(dirname "$NGINX_SITE_PATH")" /etc/nginx/sites-enabled
mkdir -p "$PUBLIC_DASHBOARD_DIR"
cp -a "${DASHBOARD_BUILD_DIR}/." "${PUBLIC_DASHBOARD_DIR}/"
chmod -R a+rX "$PUBLIC_DASHBOARD_DIR"

if [ ! -f "$FULLCHAIN" ] || [ ! -f "$PRIVKEY" ]; then
  if ! command -v certbot >/dev/null 2>&1; then
    echo "certbot is not installed."
    exit 1
  fi

  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
    NGINX_WAS_ACTIVE=1
    systemctl stop nginx
  fi

  if [ "$USE_UNSAFE_NO_EMAIL" -eq 1 ]; then
    PYTHONPATH="$CERTBOT_PYTHONPATH" certbot certonly \
      --standalone \
      -d "$DOMAIN" \
      --agree-tos \
      --register-unsafely-without-email \
      --non-interactive
  else
    PYTHONPATH="$CERTBOT_PYTHONPATH" certbot certonly \
      --standalone \
      -d "$DOMAIN" \
      --agree-tos \
      --email "$EMAIL" \
      --non-interactive
  fi
fi

cat >"$NGINX_SITE_PATH" <<EOF
server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate ${FULLCHAIN};
    ssl_certificate_key ${PRIVKEY};

    location = / {
        return 301 /dashboard/;
    }

    location = /dashboard {
        return 301 /dashboard/;
    }

    location = /dashboard/ {
        root ${PUBLIC_DASHBOARD_DIR};
        try_files /index.html =404;
        add_header Cache-Control "no-cache";
    }

    location ^~ /statics/ {
        alias ${PUBLIC_DASHBOARD_STATICS_DIR}/;
        try_files \$uri =404;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    location ^~ /assets/ {
        alias ${PUBLIC_DASHBOARD_ASSETS_DIR}/;
        try_files \$uri =404;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    location = /logo.svg {
        alias ${PUBLIC_DASHBOARD_DIR}/logo.svg;
        access_log off;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }

    location = /inbound-generator/ {
        root ${PUBLIC_DASHBOARD_DIR};
        try_files /inbound-generator/index.html =404;
        add_header Cache-Control "no-cache";
    }

    location ^~ /inbound-generator/ {
        alias ${PUBLIC_DASHBOARD_GENERATOR_DIR}/;
        try_files \$uri \$uri/ =404;
        access_log off;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }

    location / {
        proxy_pass ${PANEL_UPSTREAM};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF

ln -sfn "$NGINX_SITE_PATH" "$SITE_LINK"

nginx -t
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet nginx; then
    systemctl reload nginx
  else
    systemctl restart nginx
  fi
else
  nginx
fi

echo "Nginx now serves only HTTPS on 443; port 80 stays free for HTTP and nginx."
trap - EXIT

echo "HTTPS panel configured for ${DOMAIN}"
