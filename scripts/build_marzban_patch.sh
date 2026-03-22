#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/releases}"
EXPECTED_COMMIT="7f396db3e703d71a28060bc9ce4a532ec64cb1f4"

EDITION_LIST=("standard" "full" "custom")
TMP_DIRS=()

cleanup() {
  for dir in "${TMP_DIRS[@]:-}"; do
    rm -rf "$dir"
  done
}
trap cleanup EXIT

mkdir -p "$OUT_DIR"

edition_features() {
  case "$1" in
    standard)
      echo "admin_limits,happ_crypto,ip_limits,traffic_stats,online_stats,cpu_stats,admin_filter"
      ;;
    full)
      echo "admin_limits,happ_crypto,ip_limits,traffic_stats,online_stats,cpu_stats,admin_filter,admin_manager,v2box_id"
      ;;
    custom)
      echo "admin_limits,happ_crypto,ip_limits,traffic_stats,online_stats,cpu_stats,admin_filter,admin_manager,v2box_id,device_limit,captcha"
      ;;
    *)
      echo ""
      ;;
  esac
}

copy_file() {
  local rel="$1"
  install -D -m 0644 "$ROOT_DIR/$rel" "$OVERLAY/$rel"
}

copy_exec() {
  local rel="$1"
  install -D -m 0755 "$ROOT_DIR/$rel" "$OVERLAY/$rel"
}

copy_dir() {
  local rel="$1"
  mkdir -p "$OVERLAY/$rel"
  tar -C "$ROOT_DIR" -cf - "$rel" | tar -C "$OVERLAY" -xf -
}

build_patch() {
  local edition="$1"
  local patch_name="marzban-patch-${edition}"
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  TMP_DIRS+=("$tmp_dir")

  OVERLAY="$tmp_dir/overlay"
  mkdir -p "$OVERLAY"

  # Root files
  copy_file "config.py"
  copy_file "main.py"
  copy_file "requirements.txt"
  copy_exec "build_dashboard.sh"
  copy_exec "scripts/install_latest_xray.sh"

  # Backend (diffed files + new modules)
  copy_file "app/__init__.py"
  copy_file "app/utils/system.py"
  copy_file "app/utils/features.py"
  copy_file "app/utils/install_tokens.py"
  copy_file "app/utils/login_security.py"
  copy_file "app/models/admin.py"
  copy_file "app/models/install_otp.py"
  copy_file "app/models/system.py"
  copy_file "app/models/user.py"
  copy_file "app/db/models.py"
  copy_file "app/db/crud.py"
  copy_dir "app/db/migrations"
  copy_file "app/routers/__init__.py"
  copy_file "app/routers/admin.py"
  copy_file "app/routers/core.py"
  copy_file "app/routers/home.py"
  copy_file "app/routers/install.py"
  copy_file "app/routers/subscription.py"
  copy_file "app/routers/system.py"
  copy_file "app/routers/user.py"
  copy_file "app/routers/xpert.py"
  copy_file "app/subscription/share.py"
  copy_file "app/subscription/v2ray.py"
  copy_file "app/telegram/handlers/admin.py"
  copy_file "app/telegram/utils/shared.py"
  copy_file "app/xray/__init__.py"
  copy_file "app/xray/config.py"
  copy_file "app/xray/operations.py"
  copy_dir "app/xpert"

  # CLI additions
  copy_dir "cli"

  # Dashboard patches
  copy_file "app/dashboard/__init__.py"
  copy_dir "app/dashboard/src"
  copy_dir "app/dashboard/public"
  copy_file "app/dashboard/package.json"
  copy_file "app/dashboard/package-lock.json"
  copy_file "app/dashboard/vite.config.ts"
  copy_file "app/dashboard/tsconfig.json"
  copy_file "app/dashboard/tsconfig.node.json"
  copy_file "app/dashboard/index.html"

  # Patch metadata for edition/features
  local features
  features="$(edition_features "$edition")"
  cat > "$OVERLAY/patch.meta" <<META
edition=${edition}
features=${features}
build_commit=${EXPECTED_COMMIT}
build_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)
META

  # Marzban-specific service file (venv-aware)
  cat > "$OVERLAY/install_service.sh" <<'SERVICE'
#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="marzban"
SERVICE_DESCRIPTION="Marzban Service"
SERVICE_DOCUMENTATION="https://github.com/gozargah/marzban"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_PY_PATH="$SCRIPT_DIR/main.py"
VENV_PY="$SCRIPT_DIR/venv/bin/python"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [ ! -f "$MAIN_PY_PATH" ]; then
  echo "main.py not found at $MAIN_PY_PATH"
  exit 1
fi

if [ -x "$VENV_PY" ]; then
  EXEC_START="$VENV_PY $MAIN_PY_PATH"
else
  EXEC_START="/usr/bin/env python3 $MAIN_PY_PATH"
fi

cat > "$SERVICE_FILE" <<EOT
[Unit]
Description=$SERVICE_DESCRIPTION
Documentation=$SERVICE_DOCUMENTATION
After=network.target nss-lookup.target

[Service]
WorkingDirectory=$SCRIPT_DIR
ExecStart=$EXEC_START
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOT

systemctl daemon-reload
echo "Service file created at: $SERVICE_FILE"
SERVICE
  chmod +x "$OVERLAY/install_service.sh"

  # Marzban CLI entrypoint with extra commands
  cat > "$OVERLAY/marzban-cli.py" <<'CLI'
#!/usr/bin/env python3
import os  # noqa
import readline  # noqa
import sys  # noqa

sys.path.insert(0, os.getcwd())  # noqa

import typer
from typer._completion_shared import Shells

import cli.admin
import cli.backup
import cli.captcha
import cli.subscription
import cli.user

app = typer.Typer(no_args_is_help=True, add_completion=False)
app.add_typer(cli.admin.app, name="admin")
app.add_typer(cli.backup.app, name="backup")
app.add_typer(cli.captcha.app, name="captcha")
app.add_typer(cli.subscription.app, name="subscription")
app.add_typer(cli.user.app, name="user")

# Hidden completion app
app_completion = typer.Typer(no_args_is_help=True, help="Generate and install completion scripts.", hidden=True)
app.add_typer(app_completion, name="completion")


def get_default_shell() -> Shells:
    shell = os.environ.get('SHELL')
    if shell:
        shell = shell.split('/')[-1]
        if shell in Shells.__members__:
            return getattr(Shells, shell)
    return Shells.bash


@app_completion.command(help="Show completion for the specified shell, to copy or customize it.")
def show(ctx: typer.Context, shell: Shells = typer.Option(None,
                                                          help="The shell to install completion for.",
                                                          case_sensitive=False)) -> None:
    if shell is None:
        shell = get_default_shell()
    typer.completion.show_callback(ctx, None, shell)


@app_completion.command(help="Install completion for the specified shell.")
def install(ctx: typer.Context, shell: Shells = typer.Option(None,
                                                             help="The shell to install completion for.",
                                                             case_sensitive=False)) -> None:
    if shell is None:
        shell = get_default_shell()
    typer.completion.install_callback(ctx, None, shell)


if __name__ == "__main__":
    typer.completion.completion_init()
    app(prog_name=os.environ.get('CLI_PROG_NAME'))
CLI
  chmod +x "$OVERLAY/marzban-cli.py"

  # Captcha CLI default env path -> /opt/marzban/.env
  if [ -f "$OVERLAY/cli/captcha.py" ]; then
    sed -i 's#/opt/xpert/.env#/opt/marzban/.env#g' "$OVERLAY/cli/captcha.py"
  fi

  # Captcha setup script adjusted for marzban
  cat > "$OVERLAY/scripts/captcha_setup.sh" <<'CAPTCHA'
#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-/opt/marzban/.env}"
DEFAULT_DOMAIN="panel.example.com"
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

read -r -p "Restart marzban now? [y/N]: " RESTART
if [[ "${RESTART}" =~ ^[Yy]$ ]]; then
  systemctl restart marzban
  echo "marzban restarted."
else
  echo "Skipped restart."
fi
CAPTCHA
  chmod +x "$OVERLAY/scripts/captcha_setup.sh"

  # Patch apply script
  cat > "$tmp_dir/apply_patch.sh" <<'PATCH'
#!/usr/bin/env bash
set -euo pipefail

EXPECTED_COMMIT="__EXPECTED_COMMIT__"
TARGET="${1:-/opt/marzban}"
FORCE=0

if [ "${2:-}" = "--force" ]; then
  FORCE=1
fi

if [ ! -d "$TARGET" ]; then
  echo "Target directory not found: $TARGET" >&2
  exit 1
fi

if [ -d "$TARGET/.git" ]; then
  CURRENT="$(git -C "$TARGET" rev-parse HEAD || true)"
  if [ -n "$CURRENT" ] && [ "$CURRENT" != "$EXPECTED_COMMIT" ]; then
    echo "Warning: target commit is $CURRENT, expected $EXPECTED_COMMIT"
    if [ "$FORCE" -ne 1 ]; then
      echo "Re-run with --force to continue anyway."
      exit 1
    fi
  fi
fi

OVERLAY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/overlay" && pwd)"
tar -C "$OVERLAY_DIR" -cf - . | tar -C "$TARGET" -xf -

# Apply edition/features from patch meta
PATCH_META="$OVERLAY_DIR/patch.meta"
if [ -f "$PATCH_META" ]; then
  edition=""
  features=""
  while IFS='=' read -r key value; do
    key="$(echo "$key" | tr -d ' ')"
    value="$(echo "$value" | sed -e 's/^ *//' -e 's/ *$//')"
    case "$key" in
      edition) edition="$value" ;;
      features) features="$value" ;;
    esac
  done < "$PATCH_META"

if [ -n "$edition" ] || [ -n "$features" ]; then
    ENV_FILE="$TARGET/.env"
    touch "$ENV_FILE"
    upsert_env() {
      local env_key="$1"
      local env_value="$2"
      if grep -q "^${env_key}=" "$ENV_FILE"; then
        sed -i "s#^${env_key}=.*#${env_key}=\"${env_value}\"#" "$ENV_FILE"
      else
        echo "${env_key}=\"${env_value}\"" >> "$ENV_FILE"
      fi
    }
    if [ -n "$edition" ]; then
      upsert_env "XPERT_EDITION" "$edition"
    fi
    if [ -n "$features" ]; then
      upsert_env "XPERT_FEATURES" "$features"
    fi
    # Marzban patch should not expose Xpanel
    upsert_env "XPANEL_ENABLED" "0"
  fi
fi

chmod +x "$TARGET/install_service.sh" || true
chmod +x "$TARGET/marzban-cli.py" || true
chmod +x "$TARGET/scripts/"*.sh || true

PATCHED_COMPOSE=""
patch_compose_file() {
  local compose_file="$1"
  if [ ! -f "$compose_file" ]; then
    return 0
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 not found, skipping docker-compose patch."
    return 0
  fi
  python3 - "$compose_file" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8", errors="ignore")
lines = text.splitlines()

def indent_of(line: str) -> int:
    return len(line) - len(line.lstrip(" "))

def is_comment_or_empty(line: str) -> bool:
    s = line.strip()
    return not s or s.startswith("#")

services_idx = None
services_indent = None
for i, line in enumerate(lines):
    if is_comment_or_empty(line):
        continue
    if line.strip() == "services:":
        services_idx = i
        services_indent = indent_of(line)
        break

if services_idx is None:
    sys.exit(0)

svc_idx = None
svc_indent = None
for i in range(services_idx + 1, len(lines)):
    line = lines[i]
    if is_comment_or_empty(line):
        continue
    ind = indent_of(line)
    if ind <= services_indent:
        break
    if line.strip().startswith("marzban:"):
        svc_idx = i
        svc_indent = ind
        break

if svc_idx is None:
    sys.exit(0)

def block_end(start_idx: int, base_indent: int) -> int:
    for j in range(start_idx + 1, len(lines)):
        line = lines[j]
        if is_comment_or_empty(line):
            continue
        if indent_of(line) <= base_indent:
            return j
    return len(lines)

svc_end = block_end(svc_idx, svc_indent)
svc_block = lines[svc_idx + 1:svc_end]

def has_key(block, key):
    prefix = f"{key}:"
    return any(l.strip().startswith(prefix) for l in block)

svc_child_indent = svc_indent + 2
entry_indent = " " * svc_child_indent
list_indent = " " * (svc_child_indent + 2)

to_insert = []
if not has_key(svc_block, "working_dir"):
    to_insert.append(f"{entry_indent}working_dir: /opt/marzban")
if not has_key(svc_block, "command"):
    to_insert.append(f"{entry_indent}command: bash -lc \"alembic upgrade head && python main.py\"")
if not has_key(svc_block, "env_file"):
    to_insert.append(f"{entry_indent}env_file:")
    to_insert.append(f"{list_indent}- /opt/marzban/.env")

if to_insert:
    lines[svc_idx + 1:svc_idx + 1] = to_insert

# Refresh indices after insertion
svc_end = block_end(svc_idx, svc_indent)

# Ensure PYTHONPATH in environment
env_idx = None
env_indent = None
for i in range(svc_idx + 1, svc_end):
    line = lines[i]
    if is_comment_or_empty(line):
        continue
    if line.strip().startswith("environment:"):
        env_idx = i
        env_indent = indent_of(line)
        break

def env_block_end(start_idx: int, base_indent: int) -> int:
    for j in range(start_idx + 1, svc_end):
        line = lines[j]
        if is_comment_or_empty(line):
            continue
        if indent_of(line) <= base_indent:
            return j
    return svc_end

if env_idx is not None:
    env_end = env_block_end(env_idx, env_indent)
    env_block = lines[env_idx + 1:env_end]
    if not any(l.strip().startswith("PYTHONPATH:") for l in env_block):
        py_indent = " " * (env_indent + 2)
        lines[env_idx + 1:env_idx + 1] = [f"{py_indent}PYTHONPATH: /opt/marzban"]
else:
    # If environment block is missing, add minimal one with PYTHONPATH
    insert_at = svc_idx + 1
    lines[insert_at:insert_at] = [
        f"{entry_indent}environment:",
        f"{list_indent}PYTHONPATH: /opt/marzban",
    ]

new_text = "\n".join(lines) + ("\n" if text.endswith("\n") else "")
path.write_text(new_text, encoding="utf-8")
print(f"Patched compose: {path}")
PY
  PATCHED_COMPOSE="$compose_file"
}

patch_compose() {
  local candidates=()
  if [ -f "$TARGET/docker-compose.yml" ]; then
    candidates+=("$TARGET/docker-compose.yml")
  elif [ -f "$TARGET/docker-compose.yaml" ]; then
    candidates+=("$TARGET/docker-compose.yaml")
  fi
  if [ -f "/opt/marzban/docker-compose.yml" ]; then
    candidates+=("/opt/marzban/docker-compose.yml")
  elif [ -f "/opt/marzban/docker-compose.yaml" ]; then
    candidates+=("/opt/marzban/docker-compose.yaml")
  fi
  if [ "${#candidates[@]}" -eq 0 ]; then
    return 0
  fi
  for c in "${candidates[@]}"; do
    patch_compose_file "$c"
  done
  # Prefer /opt/marzban compose if present
  if [ -f "/opt/marzban/docker-compose.yml" ]; then
    PATCHED_COMPOSE="/opt/marzban/docker-compose.yml"
  elif [ -f "/opt/marzban/docker-compose.yaml" ]; then
    PATCHED_COMPOSE="/opt/marzban/docker-compose.yaml"
  fi
}

patch_compose

find_container() {
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi
  local cid mounts
  cid="$(docker ps --filter "label=com.docker.compose.service=marzban" -q | head -n1)"
  if [ -z "$cid" ]; then
    cid="$(docker ps --filter "name=marzban" -q | head -n1)"
  fi
  if [ -z "$cid" ]; then
    return 1
  fi
  mounts="$(docker inspect "$cid" --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}' 2>/dev/null || true)"
  if printf '%s\n' "$mounts" | grep -Fq "$TARGET -> /opt/marzban"; then
    echo "$cid"
    return 0
  fi
  return 1
}

CONTAINER_ID="$(find_container || true)"
if [ -n "$CONTAINER_ID" ]; then
  echo "Detected marzban container: $CONTAINER_ID"
  docker exec "$CONTAINER_ID" bash -lc "python3 -m pip install -r /opt/marzban/requirements.txt || python -m pip install -r /opt/marzban/requirements.txt" || true
  docker exec "$CONTAINER_ID" bash -lc "cd /opt/marzban && alembic upgrade head" || true
  if docker exec "$CONTAINER_ID" bash -lc "test -f /opt/marzban/app/dashboard/package.json"; then
    if docker exec "$CONTAINER_ID" bash -lc "command -v npm >/dev/null 2>&1"; then
      docker exec "$CONTAINER_ID" bash -lc "cd /opt/marzban/app/dashboard && npm install"
      docker exec "$CONTAINER_ID" bash -lc "cd /opt/marzban && /bin/bash build_dashboard.sh"
    else
      echo "npm not found in container. Using node:18 to build dashboard..."
      docker run --rm -v "$TARGET":/work -w /work node:18-bullseye \
        bash -lc "cd /work/app/dashboard && npm install && /bin/bash /work/build_dashboard.sh"
    fi
  fi
  if [ -n "$PATCHED_COMPOSE" ]; then
    compose_dir="$(dirname "$PATCHED_COMPOSE")"
    if docker compose -f "$PATCHED_COMPOSE" --project-directory "$compose_dir" up -d --force-recreate; then
      :
    elif command -v docker-compose >/dev/null 2>&1; then
      docker-compose -f "$PATCHED_COMPOSE" --project-directory "$compose_dir" up -d --force-recreate || true
    else
      docker restart "$CONTAINER_ID" || true
    fi
  else
    docker restart "$CONTAINER_ID" || true
  fi
  if command -v sha256sum >/dev/null 2>&1 && [ -f "$TARGET/patch.manifest" ]; then
    (cd "$TARGET" && sha256sum -c patch.manifest) || echo "Patch verification failed."
  fi
  echo "Patch applied."
  exit 0
fi

if command -v python3 >/dev/null 2>&1; then
  if [ ! -d "$TARGET/venv" ]; then
    if python3 -m venv "$TARGET/venv" >/dev/null 2>&1; then
      echo "Created venv."
    fi
  fi
  if [ -x "$TARGET/venv/bin/pip" ]; then
    "$TARGET/venv/bin/pip" install -r "$TARGET/requirements.txt"
  fi
fi

if [ -f "$TARGET/alembic.ini" ] && [ -x "$TARGET/venv/bin/python" ]; then
  (cd "$TARGET" && "$TARGET/venv/bin/python" -m alembic upgrade head)
fi

if [ -f "$TARGET/app/dashboard/package.json" ]; then
  if command -v npm >/dev/null 2>&1; then
    (cd "$TARGET/app/dashboard" && npm install)
    (cd "$TARGET" && /bin/bash build_dashboard.sh)
  else
    echo "npm not found, skipping dashboard build."
  fi
fi

systemctl restart marzban || true
if command -v sha256sum >/dev/null 2>&1 && [ -f "$TARGET/patch.manifest" ]; then
  (cd "$TARGET" && sha256sum -c patch.manifest) || echo "Patch verification failed."
fi
echo "Patch applied."
PATCH
  sed -i "s#__EXPECTED_COMMIT__#${EXPECTED_COMMIT}#g" "$tmp_dir/apply_patch.sh"
  chmod +x "$tmp_dir/apply_patch.sh"

  # Manifest for verification (sha256 of overlay files) - after all mutations
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$OVERLAY" && find . -type f ! -name "patch.manifest" -print0 | sort -z | xargs -0 sha256sum) > "$OVERLAY/patch.manifest"
  fi

  tar -C "$tmp_dir" -czf "$OUT_DIR/${patch_name}.tar.gz" overlay apply_patch.sh
  echo "Built $OUT_DIR/${patch_name}.tar.gz"
}

for edition in "${EDITION_LIST[@]}"; do
  build_patch "$edition"
done

if [ -f "$OUT_DIR/marzban-patch-custom.tar.gz" ]; then
  cp -f "$OUT_DIR/marzban-patch-custom.tar.gz" "$OUT_DIR/marzban-patch-latest.tar.gz"
  echo "Updated $OUT_DIR/marzban-patch-latest.tar.gz"
fi
