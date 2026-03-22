#!/usr/bin/env bash
set -euo pipefail

SRC="/root/Xpert-Panel-VPS"
DST="/opt/xpert"

if [ ! -d "$DST" ]; then
  echo "Destination not found: $DST" >&2
  exit 1
fi

copy_file() {
  local rel="$1"
  install -D -m 0644 "$SRC/$rel" "$DST/$rel"
}

BACKEND_FILES=(
  "main.py"
  "config.py"
  "xpert"
  "xpert-cli.py"
  "install_service.sh"
  "build_dashboard.sh"
  "app/__init__.py"
  "app/dependencies.py"
  "app/db/base.py"
  "cli/captcha.py"
  "cli/backup.py"
  "app/utils/features.py"
  "app/utils/jwt.py"
  "app/utils/responses.py"
  "app/utils/helpers.py"
  "app/utils/store.py"
  "app/utils/install_tokens.py"
  "app/utils/login_security.py"
  "app/models/admin.py"
  "app/models/install_otp.py"
  "app/models/system.py"
  "app/models/user.py"
  "app/db/models.py"
  "app/db/crud.py"
  "app/routers/install.py"
  "app/routers/__init__.py"
  "app/routers/admin.py"
  "app/routers/subscription.py"
  "app/routers/system.py"
  "app/routers/xpert.py"
  "app/subscription/share.py"
  "app/xpert/models.py"
  "app/xpert/direct_config_service.py"
  "app/xpert/device_limit_service.py"
  "app/xpert/happ_crypto_auto_service.py"
  "app/xpert/hwid_lock_service.py"
  "app/xpert/traffic_service.py"
  "app/xpert/panel_sync_service.py"
  "nginx_xpert.conf"
  ".env.example"
  "scripts/toggle_install_gate.sh"
  "scripts/install_client.sh"
  "scripts/setup_panel_fallback.sh"
  "scripts/install_marzban_patch.sh"
  "scripts/captcha_setup.sh"
)

FRONTEND_FILES=(
  "app/dashboard/__init__.py"
  "app/dashboard/src/components/InstallOtpManager.tsx"
  "app/dashboard/src/types/User.ts"
  "app/dashboard/src/hooks/useGetUser.tsx"
  "app/dashboard/src/hooks/useFeatures.ts"
  "app/dashboard/src/components/Header.tsx"
  "app/dashboard/src/components/Filters.tsx"
  "app/dashboard/src/components/DirectConfigManager.tsx"
  "app/dashboard/src/components/UserDialog.tsx"
  "app/dashboard/src/components/NodesModal.tsx"
  "app/dashboard/src/components/PanelSyncManager.tsx"
  "app/dashboard/src/pages/Dashboard.tsx"
  "app/dashboard/src/pages/Router.tsx"
  "app/dashboard/src/pages/AdminManager.tsx"
  "app/dashboard/src/pages/XpertPanel.tsx"
  "app/dashboard/src/pages/Login.tsx"
  "app/dashboard/src/utils/userPreferenceStorage.ts"
)

LOCALE_FILES=(
  "app/dashboard/public/statics/locales/en.json"
  "app/dashboard/public/statics/locales/fa.json"
  "app/dashboard/public/statics/locales/ru.json"
  "app/dashboard/public/statics/locales/zh.json"
)

for f in "${BACKEND_FILES[@]}"; do
  copy_file "$f"
done

for f in "${FRONTEND_FILES[@]}"; do
  copy_file "$f"
done

for f in "${LOCALE_FILES[@]}"; do
  copy_file "$f"
done

mkdir -p "$DST/releases"
cp -f "$SRC"/releases/xpert-*.tar.gz "$DST/releases/"
cp -f "$SRC"/releases/marzban-patch-*.tar.gz "$DST/releases/" 2>/dev/null || true

# Normalize line endings in build script to avoid CRLF issues
sed -i 's/\r$//' "$DST/build_dashboard.sh" || true

cd "$DST"
/bin/bash build_dashboard.sh
systemctl restart xpert

echo "Deploy completed."
