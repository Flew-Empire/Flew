#!/usr/bin/env bash
# Flew Free installer
set -euo pipefail

VERSION="1.1.0"
INSTALL_DIR="/opt/flew"
PANEL_DOMAIN=""
PUBLIC_IP=""
ADMIN_USER="admin"
ADMIN_PASSWORD=""
ADMIN_EMAIL=""
SKIP_NGINX=false

usage() {
    cat << EOF
Flew Free Installer v$VERSION

Usage: $0 [OPTIONS]

OPTIONS:
  --domain DOMAIN          Panel domain (e.g. panel.example.com)
  --public-ip IP           Public IP for HTTP-only installs
  --admin ADMIN            First admin username (default: admin)
  --password PASSWORD      First admin password
  --email EMAIL            Email for Let's Encrypt (optional)
  --install-dir PATH       Install directory (default: /opt/flew)
  --skip-nginx             Run without nginx/HTTPS on port 8000
  -h, --help               Show this help
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) PANEL_DOMAIN="${2:-}"; shift 2 ;;
        --public-ip) PUBLIC_IP="${2:-}"; shift 2 ;;
        --admin) ADMIN_USER="${2:-}"; shift 2 ;;
        --password) ADMIN_PASSWORD="${2:-}"; shift 2 ;;
        --email) ADMIN_EMAIL="${2:-}"; shift 2 ;;
        --install-dir) INSTALL_DIR="${2:-}"; shift 2 ;;
        --skip-nginx) SKIP_NGINX=true; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1"; usage; exit 1 ;;
    esac
done

if [ -z "$ADMIN_PASSWORD" ]; then
    echo "Error: --password is required"
    exit 1
fi

if [ -z "$PANEL_DOMAIN" ]; then
    SKIP_NGINX=true
fi

install_packages() {
    if command -v apt-get >/dev/null 2>&1; then
        DEBIAN_FRONTEND=noninteractive apt-get update
        DEBIAN_FRONTEND=noninteractive apt-get install -y \
            ca-certificates curl git nginx certbot python3 python3-pip python3-venv
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y ca-certificates curl git nginx certbot python3 python3-pip
    elif command -v yum >/dev/null 2>&1; then
        yum install -y ca-certificates curl git nginx certbot python3 python3-pip
    else
        echo "Unsupported package manager."
        exit 1
    fi
}

install_xray() {
    bash <(curl -Ls https://raw.githubusercontent.com/XTLS/Xray-install/main/install-release.sh) install
}

disable_system_xray() {
    if command -v systemctl >/dev/null 2>&1; then
        systemctl stop xray >/dev/null 2>&1 || true
        systemctl disable xray >/dev/null 2>&1 || true
    fi
}

clone_repo() {
    # Avoid deleting the current working directory when the installer
    # itself is launched from inside INSTALL_DIR.
    cd /
    rm -rf "$INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    git clone --depth 1 https://github.com/Flew-Empire/Flew.git "$INSTALL_DIR"
}

setup_venv() {
    cd "$INSTALL_DIR"
    python3 -m venv venv
    "$INSTALL_DIR/venv/bin/pip" install --upgrade pip
    "$INSTALL_DIR/venv/bin/pip" install -r requirements.txt
}

write_env() {
    cd "$INSTALL_DIR"

    local base_url=""
    local uvicorn_host="0.0.0.0"
    local uvicorn_port="8000"

    if [ -n "$PANEL_DOMAIN" ] && [ "$SKIP_NGINX" = false ]; then
        base_url="https://${PANEL_DOMAIN}"
        uvicorn_host="127.0.0.1"
    else
        if [ -z "$PUBLIC_IP" ]; then
            PUBLIC_IP="$(hostname -I | awk '{print $1}')"
        fi
        base_url="http://${PUBLIC_IP}:8000"
    fi

    cat > .env <<EOF
UVICORN_HOST="${uvicorn_host}"
UVICORN_PORT=${uvicorn_port}
ALLOWED_ORIGINS="*"

SUDO_USERNAME=""
SUDO_PASSWORD=""

XRAY_JSON="xray_config.json"
XRAY_RUNTIME_JSON="/usr/local/etc/xray/config.json"
XRAY_SUBSCRIPTION_URL_PREFIX="${base_url}"
XRAY_SUBSCRIPTION_PATH="sub"

FLEW_EDITION="free"
FLEW_FEATURES=""
XPANEL_ENABLED=False

FLEW_DOMAIN="${base_url}"
FLEW_TARGET_CHECK_IPS=""

SUB_PROFILE_TITLE="Flew"
SUB_SUPPORT_URL=""
SUB_UPDATE_INTERVAL=12

LOGIN_CAPTCHA_ENABLED=False
EOF
}

run_migrations() {
    cd "$INSTALL_DIR"
    "$INSTALL_DIR/venv/bin/python" -m alembic upgrade head
}

create_first_admin() {
    cd "$INSTALL_DIR"
    FLEW_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
        "$INSTALL_DIR/venv/bin/python" "$INSTALL_DIR/flew-cli.py" admin create \
        --username "$ADMIN_USER" \
        --sudo \
        --telegram-id 0 \
        --discord-webhook 0
}

setup_service() {
    cd "$INSTALL_DIR"
    chmod +x install_service.sh build_dashboard.sh scripts/*.sh flew || true
    /bin/bash "$INSTALL_DIR/install_service.sh"
    systemctl enable --now flew
}

setup_https() {
    if [ "$SKIP_NGINX" = true ] || [ -z "$PANEL_DOMAIN" ]; then
        return
    fi

    if [ -n "$ADMIN_EMAIL" ]; then
        /bin/bash "$INSTALL_DIR/scripts/setup_https_dashboard_domain.sh" \
            --domain "$PANEL_DOMAIN" \
            --email "$ADMIN_EMAIL"
    else
        /bin/bash "$INSTALL_DIR/scripts/setup_https_dashboard_domain.sh" \
            --domain "$PANEL_DOMAIN"
    fi
}

echo "Installing Flew Free..."
install_packages
install_xray
disable_system_xray
clone_repo
setup_venv
write_env
run_migrations
create_first_admin
setup_service
setup_https

echo ""
echo "Installation complete!"
if [ -n "$PANEL_DOMAIN" ] && [ "$SKIP_NGINX" = false ]; then
    echo "Open: https://$PANEL_DOMAIN/dashboard/"
else
    echo "Open: http://${PUBLIC_IP}:8000/dashboard/"
fi
echo "Admin user: $ADMIN_USER"
