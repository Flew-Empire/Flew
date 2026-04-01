#!/usr/bin/env bash
set -euo pipefail

XRAY_VERSION="${XRAY_VERSION:-latest}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

ensure_cmd() {
  command -v "$1" >/dev/null 2>&1
}

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

if ! ensure_cmd curl; then
  echo "curl not found. Installing..."
  install_packages curl || {
    echo "curl is required but could not be installed."
    exit 1
  }
fi

if ! ensure_cmd unzip; then
  echo "unzip not found. Installing..."
  install_packages unzip || {
    echo "unzip is required but could not be installed."
    exit 1
  }
fi

if [ "$XRAY_VERSION" = "latest" ]; then
  XRAY_URL="https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip"
else
  XRAY_URL="https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/Xray-linux-64.zip"
fi

echo "Downloading Xray from $XRAY_URL"
curl -fsSL "$XRAY_URL" -o "$TMP_DIR/xray.zip"
unzip -q "$TMP_DIR/xray.zip" -d "$TMP_DIR/xray"

install -d /usr/local/bin /usr/local/share/xray
install -m 0755 "$TMP_DIR/xray/xray" /usr/local/bin/xray

if [ -f "$TMP_DIR/xray/geoip.dat" ]; then
  install -m 0644 "$TMP_DIR/xray/geoip.dat" /usr/local/share/xray/geoip.dat
fi
if [ -f "$TMP_DIR/xray/geosite.dat" ]; then
  install -m 0644 "$TMP_DIR/xray/geosite.dat" /usr/local/share/xray/geosite.dat
fi

echo "Xray installed."
