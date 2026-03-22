#!/usr/bin/env bash
set -euo pipefail

DEFAULT_DOMAIN="xpert.mediatmshow.online"
INSTALL_DIR="${XPERT_INSTALL_DIR:-/opt/xpert}"
SKIP_CAPTCHA="${XPERT_INSTALL_SKIP_CAPTCHA:-0}"
FORCE_INSTALL="${XPERT_INSTALL_FORCE:-0}"
DOMAIN="${XPERT_INSTALL_DOMAIN:-}"
OTP_CODE="${XPERT_INSTALL_OTP:-}"
REQUESTED_EDITION="${XPERT_INSTALL_EDITION:-}"
PANEL_DOMAIN="${XPERT_PANEL_DOMAIN:-}"
CERT_EMAIL="${XPERT_CERT_EMAIL:-}"

usage() {
  cat <<'USAGE'
Xpert client installer (OTP)

Usage:
  install_client.sh [--domain DOMAIN] [--otp CODE]
                    [--edition standard|full|custom]
                    [--panel-domain DOMAIN] [--cert-email EMAIL]
                    [--install-dir PATH] [--skip-captcha] [--force]

Examples:
  install_client.sh
  install_client.sh --domain xpert.mediatmshow.online --otp 123456
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --otp)
      OTP_CODE="${2:-}"
      shift 2
      ;;
    --edition)
      REQUESTED_EDITION="${2:-}"
      shift 2
      ;;
    --panel-domain)
      PANEL_DOMAIN="${2:-}"
      shift 2
      ;;
    --cert-email)
      CERT_EMAIL="${2:-}"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    --skip-captcha)
      SKIP_CAPTCHA=1
      shift 1
      ;;
    --force)
      FORCE_INSTALL=1
      shift 1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

case "${SKIP_CAPTCHA,,}" in
  1|true|yes|y) SKIP_CAPTCHA=1 ;;
  *) SKIP_CAPTCHA=0 ;;
esac

case "${FORCE_INSTALL,,}" in
  1|true|yes|y) FORCE_INSTALL=1 ;;
  *) FORCE_INSTALL=0 ;;
esac

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root (sudo)."
  exit 1
fi

if [ -z "$DOMAIN" ]; then
  read -r -p "Install domain [$DEFAULT_DOMAIN]: " DOMAIN
  DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"
fi

if [ -z "$OTP_CODE" ]; then
  read -r -p "OTP code: " OTP_CODE
fi

if [ -z "$OTP_CODE" ]; then
  echo "OTP code is required."
  exit 1
fi

if [ -z "$PANEL_DOMAIN" ] && [ -t 0 ]; then
  read -r -p "Panel domain (leave empty to skip fallback setup): " PANEL_DOMAIN
fi

if [ -n "$REQUESTED_EDITION" ]; then
  case "${REQUESTED_EDITION,,}" in
    standard|full|custom) ;;
    *)
      echo "Invalid edition: $REQUESTED_EDITION (use standard|full|custom)"
      exit 1
      ;;
  esac
fi

API_BASE="$DOMAIN"
if [[ "$API_BASE" != http* ]]; then
  API_BASE="https://$API_BASE"
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [ -d "$INSTALL_DIR" ] && [ "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
  if [ "$FORCE_INSTALL" -eq 1 ]; then
    echo "Install dir $INSTALL_DIR is not empty. Continuing due to --force."
  elif [ -t 0 ]; then
    read -r -p "Install dir $INSTALL_DIR is not empty. Continue and overwrite? [y/N]: " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
      echo "Aborted."
      exit 1
    fi
  else
    echo "Install dir $INSTALL_DIR is not empty."
    echo "Re-run with --force or set XPERT_INSTALL_FORCE=1 to proceed."
    exit 1
  fi
fi

export OTP_CODE
export REQUESTED_EDITION
PAYLOAD="$(python3 - <<'PY'
import json
import os
payload = {"code": os.environ["OTP_CODE"]}
edition = os.environ.get("REQUESTED_EDITION", "").strip().lower()
if edition:
    payload["edition"] = edition
print(json.dumps(payload))
PY
)"

RESPONSE="$(curl -sS -X POST "$API_BASE/api/install/otp/exchange" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  -w "\n%{http_code}")"

HTTP_CODE="$(printf '%s' "$RESPONSE" | tail -n 1)"
BODY="$(printf '%s' "$RESPONSE" | sed '$d')"

if [ "$HTTP_CODE" != "200" ]; then
  echo "OTP exchange failed (HTTP $HTTP_CODE)."
  echo "$BODY"
  exit 1
fi

mapfile -t _dl_lines < <(INSTALL_BODY="$BODY" python3 - <<'PY'
import json
import os
data = json.loads(os.environ.get("INSTALL_BODY", "") or "{}")
print(data.get("download_path", ""))
print(data.get("filename", ""))
print(data.get("edition", ""))
PY
)
DOWNLOAD_PATH="${_dl_lines[0]:-}"
FILENAME="${_dl_lines[1]:-}"
EDITION="${_dl_lines[2]:-}"

if [ -z "$DOWNLOAD_PATH" ] || [ -z "$FILENAME" ]; then
  echo "Invalid response from server. Missing download path or filename."
  exit 1
fi

if [ -n "$REQUESTED_EDITION" ] && [ -n "$EDITION" ] && [ "${REQUESTED_EDITION,,}" != "${EDITION,,}" ]; then
  echo "Edition mismatch: OTP is for $EDITION, but $REQUESTED_EDITION was requested."
  exit 1
fi

if [[ "$DOWNLOAD_PATH" == http* ]]; then
  DOWNLOAD_URL="$DOWNLOAD_PATH"
else
  DOWNLOAD_URL="${API_BASE}${DOWNLOAD_PATH}"
fi

echo "Downloading $FILENAME..."
curl -fL "$DOWNLOAD_URL" -o "$TMP_DIR/$FILENAME"

mkdir -p "$INSTALL_DIR"
tar -xzf "$TMP_DIR/$FILENAME" -C "$INSTALL_DIR"

cd "$INSTALL_DIR"
if command -v sed >/dev/null 2>&1; then
  # Normalize CRLF in shipped scripts
  find "$INSTALL_DIR" -type f -name "*.sh" -print0 | xargs -0 sed -i 's/\r$//'
fi
chmod +x xpert xpert-cli.py install_service.sh scripts/*.sh || true

if [ -f requirements.txt ]; then
  install_packages() {
    if command -v apt-get >/dev/null 2>&1; then
      wait_for_apt_lock() {
        local timeout="${APT_LOCK_TIMEOUT:-300}"
        local start
        start="$(date +%s)"

        if ! command -v fuser >/dev/null 2>&1 && ! command -v lsof >/dev/null 2>&1; then
          return 0
        fi

        while true; do
          local locked=0
          if command -v fuser >/dev/null 2>&1; then
            if fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock >/dev/null 2>&1; then
              locked=1
            fi
          elif command -v lsof >/dev/null 2>&1; then
            if lsof /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock >/dev/null 2>&1; then
              locked=1
            fi
          fi

          if [ "$locked" -eq 0 ]; then
            return 0
          fi

          if [ $(( $(date +%s) - start )) -ge "$timeout" ]; then
            return 1
          fi

          sleep 5
        done
      }

      if ! wait_for_apt_lock; then
        echo "APT is locked by another process. Please wait for it to finish and re-run."
        return 1
      fi
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

  ensure_venv() {
    if [ -d "$INSTALL_DIR/venv" ]; then
      return 0
    fi

    if python3 -m venv "$INSTALL_DIR/venv" >/dev/null 2>&1; then
      return 0
    fi

    echo "python3-venv not available. Installing..."
    if ! install_packages python3-venv python3-pip; then
      echo "Failed to install python3-venv/python3-pip."
      return 1
    fi

    python3 -m venv "$INSTALL_DIR/venv"
  }

  if ensure_venv; then
    VENV_PY="$INSTALL_DIR/venv/bin/python"
    VENV_PIP="$INSTALL_DIR/venv/bin/pip"
    "$VENV_PIP" install -r requirements.txt
  else
    echo "Python venv could not be created. Install python3-venv and rerun."
    exit 1
  fi
fi

if [ -n "$EDITION" ]; then
  ENV_FILE="$INSTALL_DIR/.env"
  touch "$ENV_FILE"
  upsert_env() {
    local key="$1"
    local value="$2"
    if grep -q "^${key}=" "$ENV_FILE"; then
      sed -i "s#^${key}=.*#${key}=\"${value}\"#" "$ENV_FILE"
    else
      echo "${key}=\"${value}\"" >> "$ENV_FILE"
    fi
  }
  upsert_env "XPERT_EDITION" "$EDITION"
  if grep -q "^XPERT_FEATURES=" "$ENV_FILE"; then
    features_val="$(grep "^XPERT_FEATURES=" "$ENV_FILE" | sed 's/^XPERT_FEATURES=//')"
    if [ -n "${features_val//\"/}" ]; then
      echo "Note: XPERT_FEATURES is set in $ENV_FILE and overrides edition."
    fi
  fi
fi

if [ ! -f "app/dashboard/build/index.html" ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "Dashboard build missing. Installing npm deps and building..."
    (cd app/dashboard && npm install)
    /bin/bash build_dashboard.sh
  else
    echo "Dashboard build is missing and npm is not installed. You can build later."
  fi
fi

if [ -f "$INSTALL_DIR/scripts/install_latest_xray.sh" ]; then
  echo "Installing/updating Xray..."
  /bin/bash "$INSTALL_DIR/scripts/install_latest_xray.sh"
else
  echo "Xray installer not found. Skipping Xray install."
fi

if [ -f "$INSTALL_DIR/alembic.ini" ] && [ -x "$INSTALL_DIR/venv/bin/python" ]; then
  echo "Applying database migrations..."
  (cd "$INSTALL_DIR" && "$INSTALL_DIR/venv/bin/python" -m alembic upgrade head)
fi

if [ -n "$PANEL_DOMAIN" ]; then
  PANEL_DOMAIN_LOWER="$(printf '%s' "$PANEL_DOMAIN" | tr '[:upper:]' '[:lower:]')"
  CERT_PATH="/etc/letsencrypt/live/${PANEL_DOMAIN_LOWER}/fullchain.pem"
  if [ ! -f "$CERT_PATH" ]; then
    if [ -n "$CERT_EMAIL" ]; then
      echo "Issuing certificate for $PANEL_DOMAIN_LOWER..."
      if [ -x "$INSTALL_DIR/scripts/issue_cert.sh" ]; then
        "$INSTALL_DIR/scripts/issue_cert.sh" --domain "$PANEL_DOMAIN_LOWER" --email "$CERT_EMAIL"
      else
        echo "issue_cert.sh not found; skipping certificate issuance."
      fi
    else
      echo "Certificate not found for $PANEL_DOMAIN_LOWER. Skipping fallback setup."
    fi
  fi
  if [ -f "$CERT_PATH" ]; then
    if [ -x "$INSTALL_DIR/scripts/setup_panel_fallback.sh" ]; then
      "$INSTALL_DIR/scripts/setup_panel_fallback.sh" --domain "$PANEL_DOMAIN_LOWER" --install-dir "$INSTALL_DIR"
    else
      echo "setup_panel_fallback.sh not found; skipping fallback setup."
    fi
  fi
fi

/bin/bash install_service.sh
systemctl enable --now xpert || systemctl restart xpert

ln -sfn "$INSTALL_DIR/xpert" /usr/bin/xpert || true
ln -sfn "$INSTALL_DIR/xpert-cli.py" /usr/bin/xpert-cli || true

EFFECTIVE_EDITION="${EDITION:-$REQUESTED_EDITION}"
if [ "$SKIP_CAPTCHA" -eq 0 ] && [ "${EFFECTIVE_EDITION,,}" = "custom" ]; then
  echo "Captcha setup is optional. You can skip now and run later with: xpert captcha"
  read -r -p "Run captcha setup now? [Y/n]: " RUN_CAPTCHA
  case "${RUN_CAPTCHA,,}" in
    n|no) echo "Captcha setup skipped." ;;
    *)
      echo "Launching captcha setup..."
      /bin/bash "$INSTALL_DIR/scripts/captcha_setup.sh" "$INSTALL_DIR/.env" || true
      ;;
  esac
elif [ "$SKIP_CAPTCHA" -eq 0 ]; then
  echo "Captcha setup is available only in CUSTOM edition. Skipping."
fi

echo "Install complete."
if [ -n "$EDITION" ]; then
  echo "Edition: $EDITION"
fi
echo "CLI: xpert --help"
echo "Captcha menu: xpert captcha"
echo "SSL helper: $INSTALL_DIR/scripts/issue_cert.sh --domain your-domain.com --email you@domain"
if [ -z "$PANEL_DOMAIN" ]; then
  echo "Fallback setup skipped. To enable: $INSTALL_DIR/scripts/setup_panel_fallback.sh --domain your-domain.com --install-dir $INSTALL_DIR"
fi
