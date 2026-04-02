#!/usr/bin/env bash
set -euo pipefail

DOMAIN=""
EMAIL=""
MODE="standalone"
WEBROOT="/var/www/letsencrypt"

usage() {
  cat <<'USAGE'
Issue Let's Encrypt certificate for a domain.

Usage:
  issue_cert.sh --domain example.com --email you@domain
  issue_cert.sh --domain example.com --email you@domain --webroot /var/www/letsencrypt

Options:
  --domain      Domain name to issue certificate for
  --email       Email for Let's Encrypt registration
  --webroot     Use webroot mode with the given path (nginx must serve /.well-known/)
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --webroot) MODE="webroot"; WEBROOT="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Domain and email are required."
  usage
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

if ! command -v certbot >/dev/null 2>&1; then
  echo "certbot not found. Installing..."
  if ! install_packages certbot; then
    echo "Failed to install certbot. Please install it manually."
    exit 1
  fi
fi

if [ "$MODE" = "webroot" ]; then
  mkdir -p "$WEBROOT/.well-known/acme-challenge"
  certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" --agree-tos --email "$EMAIL" --non-interactive
  exit $?
fi

NGINX_WAS_ACTIVE=0
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet nginx; then
    NGINX_WAS_ACTIVE=1
    systemctl stop nginx
  fi
fi

cleanup() {
  if [ "$NGINX_WAS_ACTIVE" -eq 1 ]; then
    systemctl start nginx || true
  fi
}
trap cleanup EXIT

certbot certonly --standalone -d "$DOMAIN" --agree-tos --email "$EMAIL" --non-interactive
