#!/usr/bin/env bash
set -euo pipefail

VERSION="1.0.0"
INSTALL_DIR="/opt/flew"
PANEL_DOMAIN=""
PUBLIC_IP=""
ADMIN_USER="admin"
ADMIN_PASSWORD=""
ADMIN_EMAIL=""
SKIP_EMAIL=false
SKIP_NGINX=false

usage() {
    cat << EOF
Flew Free Installer v$VERSION

Usage: $0 [OPTIONS]

OPTIONS:
  --domain DOMAIN          Panel domain (e.g., panel.example.com)
  --public-ip IP          Public server IP (for --skip-nginx mode)
  --admin ADMIN           Admin username (default: admin)
  --password PASSWORD     Admin password
  --email EMAIL           Admin email (for Let's Encrypt)
  --install-dir PATH      Install directory (default: /opt/flew)
  --skip-email            Skip email for Let's Encrypt
  --skip-nginx            Install without nginx (HTTP only, no HTTPS)
  -h, --help              Show this help

EXAMPLES:
  # With domain and email
  $0 --domain panel.example.com --admin admin --password 'mysecurepass' --email admin@example.com

  # Without domain (HTTP only, no nginx) - specify public IP
  $0 --admin admin --password 'mysecurepass' --public-ip 92.242.63.93 --skip-nginx
EOF
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --domain) PANEL_DOMAIN="$2"; shift 2 ;;
        --public-ip) PUBLIC_IP="$2"; shift 2 ;;
        --admin) ADMIN_USER="$2"; shift 2 ;;
        --password) ADMIN_PASSWORD="$2"; shift 2 ;;
        --email) ADMIN_EMAIL="$2"; shift 2 ;;
        --install-dir) INSTALL_DIR="$2"; shift 2 ;;
        --skip-email) SKIP_EMAIL=true; shift ;;
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
    if command -v apt-get &> /dev/null; then
        DEBIAN_FRONTEND=noninteractive apt-get update
        DEBIAN_FRONTEND=noninteractive apt-get install -y curl wget git python3-venv python3-pip certbot nginx
    elif command -v dnf &> /dev/null; then
        dnf install -y curl wget git python3-venv python3-pip certbot nginx
    elif command -v yum &> /dev/null; then
        yum install -y curl wget git python3-venv python3-pip certbot nginx
    fi
}

install_xray() {
    bash <(curl -Ls https://raw.githubusercontent.com/XTLS/Xray-install/main/install-release.sh) install
}

clone_repo() {
    rm -rf "$INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    git clone --depth 1 https://github.com/Flew-Empire/Flew.git "$INSTALL_DIR"
}

setup_venv() {
    cd "$INSTALL_DIR"
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
}

create_env() {
    cd "$INSTALL_DIR"
    if [ -f .env.example ]; then
        cp .env.example .env
    fi
    
    if [ -n "$PANEL_DOMAIN" ]; then
        sed -i "s|UVICORN_HOST=.*|UVICORN_HOST=0.0.0.0|" .env
        sed -i "s|UVICORN_PORT=.*|UVICORN_PORT=443|" .env
        sed -i "s|UVICORN_SSL_CERTFILE=.*|UVICORN_SSL_CERTFILE=/etc/letsencrypt/live/$PANEL_DOMAIN/fullchain.pem|" .env
        sed -i "s|UVICORN_SSL_KEYFILE=.*|UVICORN_SSL_KEYFILE=/etc/letsencrypt/live/$PANEL_DOMAIN/privkey.pem|" .env
        sed -i "s|FLEW_DOMAIN=.*|FLEW_DOMAIN=$PANEL_DOMAIN|" .env
        sed -i "s|XRAY_SUBSCRIPTION_URL_PREFIX=.*|XRAY_SUBSCRIPTION_URL_PREFIX=https://$PANEL_DOMAIN|" .env
    else
        sed -i "s|UVICORN_HOST=.*|UVICORN_HOST=0.0.0.0|" .env
        sed -i "s|UVICORN_PORT=.*|UVICORN_PORT=8000|" .env
        sed -i "s|UVICORN_SSL_CERTFILE=.*|UVICORN_SSL_CERTFILE=|" .env
        sed -i "s|UVICORN_SSL_KEYFILE=.*|UVICORN_SSL_KEYFILE=|" .env
        sed -i "s|FLEW_TARGET_CHECK_IPS=.*|FLEW_TARGET_CHECK_IPS=|" .env
        
        if [ -n "$PUBLIC_IP" ]; then
            sed -i "s|FLEW_DOMAIN=.*|FLEW_DOMAIN=http://$PUBLIC_IP:8000|" .env
            sed -i "s|XRAY_SUBSCRIPTION_URL_PREFIX=.*|XRAY_SUBSCRIPTION_URL_PREFIX=http://$PUBLIC_IP:8000|" .env
        fi
    fi
    
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    sed -i "s|SECRET_KEY=.*|SECRET_KEY=$SECRET_KEY|" .env
    
    sed -i "s|FIRST_ADMIN_USERNAME=.*|FIRST_ADMIN_USERNAME=$ADMIN_USER|" .env
    sed -i "s|FIRST_ADMIN_PASSWORD=.*|FIRST_ADMIN_PASSWORD=$ADMIN_PASSWORD|" .env
    
    if [ -n "$ADMIN_EMAIL" ]; then
        sed -i "s|FIRST_ADMIN_EMAIL=.*|FIRST_ADMIN_EMAIL=$ADMIN_EMAIL|" .env
    fi
}

setup_service() {
    cat > /etc/systemd/system/flew.service << EOF
[Unit]
Description=Flew Panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/venv/bin/python $INSTALL_DIR/main.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable flew
    systemctl start flew
}

setup_nginx() {
    if [ "$SKIP_NGINX" = true ]; then
        return
    fi

    if [ -n "$PANEL_DOMAIN" ]; then
        certbot certonly --nginx -d "$PANEL_DOMAIN" --non-interactive --agree-tos --email "${ADMIN_EMAIL:-admin@example.com}" || true
    fi

    cat > /etc/nginx/sites-available/flew << EOF
server {
    listen 80;
    server_name $PANEL_DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name $PANEL_DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$PANEL_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$PANEL_DOMAIN/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

    ln -sf /etc/nginx/sites-available/flew /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
}

echo "Installing Flew Free..."
install_packages
install_xray
clone_repo
setup_venv
create_env
setup_service

if [ "$SKIP_NGINX" = false ]; then
    setup_nginx
fi

echo ""
echo "Installation complete!"
if [ -n "$PANEL_DOMAIN" ]; then
    echo "Open: https://$PANEL_DOMAIN/dashboard/"
elif [ -n "$PUBLIC_IP" ]; then
    echo "Open: http://$PUBLIC_IP:8000/dashboard/"
else
    DETECTED_IP=$(hostname -I | awk '{print $1}')
    echo "Open: http://${DETECTED_IP}:8000/dashboard/"
    echo "Note: If $DETECTED_IP is not your public IP, use --public-ip YOUR_PUBLIC_IP"
fi
echo "Admin user: $ADMIN_USER"
echo "Password: $ADMIN_PASSWORD"