#!/usr/bin/env bash
set -euo pipefail

DEFAULT_DOMAIN="xpert.mediatmshow.online"
TARGET_DIR="${MARZBAN_TARGET_DIR:-/opt/marzban}"
FORCE_INSTALL="${XPERT_INSTALL_FORCE:-0}"
DOMAIN="${XPERT_INSTALL_DOMAIN:-}"
OTP_CODE="${XPERT_INSTALL_OTP:-}"
REQUESTED_EDITION="${XPERT_INSTALL_EDITION:-}"

usage() {
  cat <<'USAGE'
Marzban patch installer (OTP)

Usage:
  install_marzban_patch.sh [--domain DOMAIN] [--otp CODE]
                           [--edition standard|full|custom]
                           [--target PATH] [--force]

Examples:
  install_marzban_patch.sh --domain xpert.mediatmshow.online --otp 123456
  install_marzban_patch.sh --otp 123456 --target /opt/marzban
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
    --target)
      TARGET_DIR="${2:-}"
      shift 2
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

RESPONSE="$(curl -sS -X POST "$API_BASE/api/install/marzban/otp/exchange" \
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

PATCH_DIR="$TMP_DIR/patch"
mkdir -p "$PATCH_DIR"
tar -xzf "$TMP_DIR/$FILENAME" -C "$PATCH_DIR"

if [ ! -x "$PATCH_DIR/apply_patch.sh" ]; then
  echo "apply_patch.sh not found in patch archive."
  exit 1
fi

if [ "$FORCE_INSTALL" -eq 1 ]; then
  "$PATCH_DIR/apply_patch.sh" "$TARGET_DIR" --force
else
  "$PATCH_DIR/apply_patch.sh" "$TARGET_DIR"
fi
