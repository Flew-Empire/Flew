#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-/opt/xpert/.env}"
DEFAULT_DOMAIN="xpert.mediatmshow.online"
VENDOR="turnstile"

if [ ! -f "$ENV_FILE" ]; then
  touch "$ENV_FILE"
fi

cat <<INFO
Cloudflare Turnstile setup
---------------------------
1) Open Cloudflare Dashboard -> Turnstile -> Add site
2) Domain: choose the domain used for the panel (example: $DEFAULT_DOMAIN)
3) Widget type: Managed
4) Copy Site Key and Secret Key

This will enable login captcha (Turnstile).
INFO

read -r -p "Domain for Turnstile [$DEFAULT_DOMAIN]: " DOMAIN
DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"

read -r -p "Site Key: " SITE_KEY
read -r -p "Secret Key: " SECRET_KEY

if [ -z "$SITE_KEY" ] && [ -z "$SECRET_KEY" ]; then
  echo "No keys provided. Skipping captcha setup."
  exit 0
fi

if [ -z "$SITE_KEY" ] || [ -z "$SECRET_KEY" ]; then
  echo "Both Site Key and Secret Key are required. Nothing changed."
  exit 1
fi

upsert_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s#^${key}=.*#${key}=\"${value}\"#" "$ENV_FILE"
  else
    echo "${key}=\"${value}\"" >> "$ENV_FILE"
  fi
}

upsert_env "LOGIN_CAPTCHA_ENABLED" "True"
upsert_env "LOGIN_CAPTCHA_VENDOR" "$VENDOR"
upsert_env "LOGIN_CAPTCHA_SITE_KEY" "$SITE_KEY"
upsert_env "LOGIN_CAPTCHA_SECRET" "$SECRET_KEY"

cat <<DONE

Captcha settings saved to $ENV_FILE
Remember: the edition must include the "captcha" feature (custom edition or XPERT_FEATURES).
DONE

read -r -p "Restart xpert now? [y/N]: " RESTART
if [[ "${RESTART}" =~ ^[Yy]$ ]]; then
  systemctl restart xpert
  echo "xpert restarted."
else
  echo "Skipped restart."
fi
