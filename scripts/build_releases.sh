#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/releases}"

mkdir -p "$OUT_DIR"

if [ ! -f "$ROOT_DIR/app/dashboard/build/index.html" ]; then
  echo "Dashboard build missing. Building..."
  (cd "$ROOT_DIR" && /bin/bash build_dashboard.sh)
fi

declare -A FEATURES
FEATURES[standard]="admin_limits,happ_crypto,ip_limits,traffic_stats,online_stats,cpu_stats,admin_filter"
FEATURES[full]="admin_limits,happ_crypto,ip_limits,traffic_stats,online_stats,cpu_stats,admin_filter,admin_manager,v2box_id"
FEATURES[custom]="admin_limits,happ_crypto,ip_limits,traffic_stats,online_stats,cpu_stats,admin_filter,admin_manager,v2box_id,device_limit,captcha"

copy_sources() {
  local target="$1"
  tar -C "$ROOT_DIR" \
    --exclude='.git' \
    --exclude='.env' \
    --exclude='releases' \
    --exclude='app/dashboard/node_modules' \
    --exclude='app/dashboard/.vite' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='*.sqlite3' \
    --exclude='*.db' \
    -cf - . | tar -C "$target" -xf -
}

write_env() {
  local target="$1"
  local edition="$2"
  cat > "$target/.env" <<ENVEOF
UVICORN_HOST="0.0.0.0"
UVICORN_PORT=8000

# Admin bootstrap (leave empty; create via CLI)
SUDO_USERNAME=""
SUDO_PASSWORD=""

# Domain/base URL (leave empty)
XRAY_SUBSCRIPTION_URL_PREFIX=""
VITE_BASE_API="/api/"

# Xpert edition / features
XPERT_EDITION="${edition}"
XPERT_FEATURES="${FEATURES[$edition]}"
XPANEL_ENABLED=False
ENVEOF
}

for edition in standard full custom; do
  tmp_dir="$(mktemp -d)"
  copy_sources "$tmp_dir"
  write_env "$tmp_dir" "$edition"
  tar -C "$tmp_dir" -czf "$OUT_DIR/xpert-${edition}.tar.gz" .
  rm -rf "$tmp_dir"
  echo "Built $OUT_DIR/xpert-${edition}.tar.gz"
done
