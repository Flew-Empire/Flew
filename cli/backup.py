from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import typer
from sqlalchemy.orm import selectinload

from app.db import GetDB
from app.db.models import Admin, Proxy, ProxyHost, ProxyInbound, User
from app.models.proxy import ProxyHostALPN, ProxyHostFingerprint, ProxyHostSecurity
from app.models.user import UserDataLimitResetStrategy, UserStatus
import config

from . import utils

app = typer.Typer(no_args_is_help=True)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _backup_dir() -> Path:
    path = _project_root() / "backups"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _now_stamp() -> str:
    return datetime.utcnow().strftime("%Y%m%d-%H%M%S")


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def _serialize_proxy(proxy: Proxy) -> Dict[str, Any]:
    excluded = []
    try:
        excluded = [i.tag for i in (proxy.excluded_inbounds or [])]
    except Exception:
        excluded = []
    # Sanitized: do not export secrets or full settings.
    return {
        "type": getattr(proxy.type, "value", proxy.type),
        "excluded_inbounds": excluded,
    }


def _serialize_user(user: User) -> Dict[str, Any]:
    admin_username = None
    try:
        admin_username = user.admin.username if user.admin else None
    except Exception:
        admin_username = None

    # Sanitized: omit proxy settings and tokens to prevent cloning.
    return {
        "id": user.id,
        "username": user.username,
        "status": getattr(user.status, "value", user.status),
        "used_traffic": user.used_traffic,
        "data_limit": user.data_limit,
        "data_limit_reset_strategy": getattr(user.data_limit_reset_strategy, "value", user.data_limit_reset_strategy),
        "expire": user.expire,
        "admin_id": user.admin_id,
        "admin_username": admin_username,
        "sub_revoked_at": _iso(user.sub_revoked_at),
        "sub_updated_at": _iso(user.sub_updated_at),
        "first_sub_fetch_at": _iso(user.first_sub_fetch_at),
        "sub_last_user_agent": user.sub_last_user_agent,
        "created_at": _iso(user.created_at),
        "note": user.note,
        "online_at": _iso(user.online_at),
        "on_hold_expire_duration": user.on_hold_expire_duration,
        "on_hold_timeout": _iso(user.on_hold_timeout),
        "auto_delete_in_days": user.auto_delete_in_days,
        "edit_at": _iso(user.edit_at),
        "proxies": [_serialize_proxy(p) for p in (user.proxies or [])],
    }


def _serialize_host(host: ProxyHost) -> Dict[str, Any]:
    # Sanitized: omit address/host/sni/path/port to prevent reuse.
    return {
        "id": host.id,
        "remark": host.remark,
        "security": getattr(host.security, "value", host.security),
        "alpn": getattr(host.alpn, "value", host.alpn),
        "fingerprint": getattr(host.fingerprint, "value", host.fingerprint),
        "inbound_tag": host.inbound_tag,
        "allowinsecure": host.allowinsecure,
        "is_disabled": host.is_disabled,
        "mux_enable": host.mux_enable,
        "fragment_setting": host.fragment_setting,
        "noise_setting": host.noise_setting,
        "random_user_agent": host.random_user_agent,
        "use_sni_as_host": host.use_sni_as_host,
    }


def _resolve_xray_config_path() -> Path:
    path = Path(config.XRAY_JSON)
    if path.is_absolute():
        return path
    return _project_root() / path


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except Exception:
        return None
    if getattr(dt, "tzinfo", None):
        return dt.replace(tzinfo=None)
    return dt


def _cast_status(value: Optional[str], preserve: bool) -> UserStatus:
    if not preserve:
        return UserStatus.disabled
    try:
        return UserStatus(str(value))
    except Exception:
        return UserStatus.disabled


def _cast_reset_strategy(value: Optional[str]) -> UserDataLimitResetStrategy:
    try:
        return UserDataLimitResetStrategy(str(value))
    except Exception:
        return UserDataLimitResetStrategy.no_reset


def _resolve_admin(db, preferred: Optional[str], fallback: Optional[str]) -> Optional[Admin]:
    username = (preferred or fallback or "").strip()
    if not username:
        return None
    return db.query(Admin).filter(Admin.username == username).first()


def _cast_security(value: Optional[str]) -> ProxyHostSecurity:
    try:
        return ProxyHostSecurity(str(value))
    except Exception:
        return ProxyHostSecurity.inbound_default


def _cast_alpn(value: Optional[str]) -> ProxyHostALPN:
    try:
        return ProxyHostALPN(str(value))
    except Exception:
        return ProxyHostALPN.none


def _cast_fingerprint(value: Optional[str]) -> ProxyHostFingerprint:
    try:
        return ProxyHostFingerprint(str(value))
    except Exception:
        return ProxyHostFingerprint.none


@app.command(name="users")
def backup_users(
    output: Optional[str] = typer.Option(None, "--output", "-o", help="Output JSON file."),
):
    """Backup users and their proxy settings."""
    target = Path(output) if output else _backup_dir() / f"users-backup-{_now_stamp()}.json"

    with GetDB() as db:
        users = (
            db.query(User)
            .options(selectinload(User.proxies).selectinload(Proxy.excluded_inbounds), selectinload(User.admin))
            .all()
        )

    payload = {
        "exported_at": datetime.utcnow().isoformat(),
        "sanitized": True,
        "users": [_serialize_user(u) for u in users],
    }
    _write_json(target, payload)
    utils.success(f"Users backup saved: {target}")


@app.command(name="export")
def backup_bundle(
    output: Optional[str] = typer.Option(None, "--output", "-o", help="Output JSON file."),
):
    """Export sanitized users/domains/inbounds in a single file."""
    target = Path(output) if output else _backup_dir() / f"panel-backup-{_now_stamp()}.json"

    with GetDB() as db:
        users = (
            db.query(User)
            .options(selectinload(User.proxies).selectinload(Proxy.excluded_inbounds), selectinload(User.admin))
            .all()
        )
        hosts = db.query(ProxyHost).all()
        inbounds = db.query(ProxyInbound).all()

    payload = {
        "exported_at": datetime.utcnow().isoformat(),
        "sanitized": True,
        "redacted_fields": {
            "users": ["proxies.settings", "tokens"],
            "domains": ["address", "host", "sni", "path", "port"],
            "inbounds": ["xray_config"],
        },
        "users": [_serialize_user(u) for u in users],
        "domains": [_serialize_host(h) for h in hosts],
        "inbounds": [{"tag": i.tag} for i in inbounds],
    }
    _write_json(target, payload)
    utils.success(f"Panel backup saved: {target}")


@app.command(name="users-import")
def import_users(
    input: str = typer.Option(..., "--input", "-i", help="Input JSON file."),
    admin: Optional[str] = typer.Option(None, "--admin", help="Assign all users to this admin."),
    preserve_status: bool = typer.Option(
        True,
        "--preserve-status/--reset-status",
        help="Keep status from backup (default: preserve).",
    ),
    update_existing: bool = typer.Option(False, "--update", help="Update existing users."),
):
    """Import sanitized users backup (no proxy settings)."""
    source = Path(input)
    if not source.exists():
        utils.error(f"Input file not found: {source}")

    payload = json.loads(source.read_text(encoding="utf-8"))
    if payload.get("sanitized") is not True:
        utils.error("Only sanitized backups are supported.")

    users_payload = payload.get("users") or []
    if not isinstance(users_payload, list):
        utils.error("Invalid backup format.")

    created = 0
    updated = 0
    skipped = 0

    with GetDB() as db:
        for entry in users_payload:
            if not isinstance(entry, dict):
                continue
            username = str(entry.get("username") or "").strip()
            if not username:
                continue

            dbuser = db.query(User).filter(User.username == username).first()
            admin_obj = _resolve_admin(db, admin, entry.get("admin_username"))
            status = _cast_status(entry.get("status"), preserve_status)

            if dbuser:
                if not update_existing:
                    skipped += 1
                    continue
                dbuser.status = status
                dbuser.data_limit = entry.get("data_limit")
                dbuser.data_limit_reset_strategy = _cast_reset_strategy(
                    entry.get("data_limit_reset_strategy")
                )
                dbuser.expire = entry.get("expire")
                dbuser.note = entry.get("note")
                dbuser.on_hold_expire_duration = entry.get("on_hold_expire_duration")
                dbuser.on_hold_timeout = _parse_dt(entry.get("on_hold_timeout"))
                dbuser.auto_delete_in_days = entry.get("auto_delete_in_days")
                if admin_obj:
                    dbuser.admin = admin_obj
                updated += 1
            else:
                dbuser = User(
                    username=username,
                    status=status,
                    data_limit=entry.get("data_limit"),
                    data_limit_reset_strategy=_cast_reset_strategy(
                        entry.get("data_limit_reset_strategy")
                    ),
                    expire=entry.get("expire"),
                    note=entry.get("note"),
                    on_hold_expire_duration=entry.get("on_hold_expire_duration"),
                    on_hold_timeout=_parse_dt(entry.get("on_hold_timeout")),
                    auto_delete_in_days=entry.get("auto_delete_in_days"),
                    admin=admin_obj,
                )
                db.add(dbuser)
                created += 1

        db.commit()

    utils.success(
        f"Import complete. Created: {created}, updated: {updated}, skipped: {skipped}"
    )


@app.command(name="import")
def import_bundle(
    input: str = typer.Option(..., "--input", "-i", help="Input JSON file."),
    admin: Optional[str] = typer.Option(None, "--admin", help="Assign all users to this admin."),
    preserve_status: bool = typer.Option(
        True,
        "--preserve-status/--reset-status",
        help="Keep status from backup (default: preserve).",
    ),
    update_existing: bool = typer.Option(False, "--update", help="Update existing users."),
):
    """Import sanitized users/domains/inbounds from a single file."""
    source = Path(input)
    if not source.exists():
        utils.error(f"Input file not found: {source}")

    payload = json.loads(source.read_text(encoding="utf-8"))
    if payload.get("sanitized") is not True:
        utils.error("Only sanitized backups are supported.")

    users_payload = payload.get("users") or []
    domains_payload = payload.get("domains") or []
    inbounds_payload = payload.get("inbounds") or []

    created_users = 0
    updated_users = 0
    skipped_users = 0
    created_inbounds = 0
    created_hosts = 0

    with GetDB() as db:
        # Inbounds (tags only)
        for inbound in inbounds_payload:
            if not isinstance(inbound, dict):
                continue
            tag = str(inbound.get("tag") or "").strip()
            if not tag:
                continue
            exists = db.query(ProxyInbound).filter(ProxyInbound.tag == tag).first()
            if exists:
                continue
            db.add(ProxyInbound(tag=tag))
            created_inbounds += 1

        db.flush()

        # Domains (redacted placeholders, disabled)
        for host in domains_payload:
            if not isinstance(host, dict):
                continue
            remark = str(host.get("remark") or "").strip()
            inbound_tag = str(host.get("inbound_tag") or "").strip()
            if not remark or not inbound_tag:
                continue

            inbound = db.query(ProxyInbound).filter(ProxyInbound.tag == inbound_tag).first()
            if not inbound:
                inbound = ProxyInbound(tag=inbound_tag)
                db.add(inbound)
                created_inbounds += 1
                db.flush()

            exists = (
                db.query(ProxyHost)
                .filter(ProxyHost.inbound_tag == inbound_tag, ProxyHost.remark == remark)
                .first()
            )
            if exists:
                continue

            redacted_address = "__redacted__"
            host_obj = ProxyHost(
                remark=remark,
                address=redacted_address,
                port=None,
                path=None,
                sni=None,
                host=None,
                security=_cast_security(host.get("security")),
                alpn=_cast_alpn(host.get("alpn")),
                fingerprint=_cast_fingerprint(host.get("fingerprint")),
                inbound_tag=inbound_tag,
                allowinsecure=host.get("allowinsecure"),
                is_disabled=True,
                mux_enable=bool(host.get("mux_enable") or False),
                fragment_setting=host.get("fragment_setting"),
                noise_setting=host.get("noise_setting"),
                random_user_agent=bool(host.get("random_user_agent") or False),
                use_sni_as_host=bool(host.get("use_sni_as_host") or False),
            )
            db.add(host_obj)
            created_hosts += 1

        # Users
        for entry in users_payload:
            if not isinstance(entry, dict):
                continue
            username = str(entry.get("username") or "").strip()
            if not username:
                continue

            dbuser = db.query(User).filter(User.username == username).first()
            admin_obj = _resolve_admin(db, admin, entry.get("admin_username"))
            status = _cast_status(entry.get("status"), preserve_status)

            if dbuser:
                if not update_existing:
                    skipped_users += 1
                    continue
                dbuser.status = status
                dbuser.data_limit = entry.get("data_limit")
                dbuser.data_limit_reset_strategy = _cast_reset_strategy(
                    entry.get("data_limit_reset_strategy")
                )
                dbuser.expire = entry.get("expire")
                dbuser.note = entry.get("note")
                dbuser.on_hold_expire_duration = entry.get("on_hold_expire_duration")
                dbuser.on_hold_timeout = _parse_dt(entry.get("on_hold_timeout"))
                dbuser.auto_delete_in_days = entry.get("auto_delete_in_days")
                if admin_obj:
                    dbuser.admin = admin_obj
                updated_users += 1
            else:
                dbuser = User(
                    username=username,
                    status=status,
                    data_limit=entry.get("data_limit"),
                    data_limit_reset_strategy=_cast_reset_strategy(
                        entry.get("data_limit_reset_strategy")
                    ),
                    expire=entry.get("expire"),
                    note=entry.get("note"),
                    on_hold_expire_duration=entry.get("on_hold_expire_duration"),
                    on_hold_timeout=_parse_dt(entry.get("on_hold_timeout")),
                    auto_delete_in_days=entry.get("auto_delete_in_days"),
                    admin=admin_obj,
                )
                db.add(dbuser)
                created_users += 1

        db.commit()

    utils.success(
        "Import complete. "
        f"Users created: {created_users}, updated: {updated_users}, skipped: {skipped_users}. "
        f"Inbounds created: {created_inbounds}. Domains placeholders created: {created_hosts}."
    )


@app.command(name="domains")
def backup_domains(
    output: Optional[str] = typer.Option(None, "--output", "-o", help="Output JSON file."),
):
    """Backup domain/host settings (ProxyHost)."""
    target = Path(output) if output else _backup_dir() / f"domains-backup-{_now_stamp()}.json"

    with GetDB() as db:
        hosts = db.query(ProxyHost).all()

    payload = {
        "exported_at": datetime.utcnow().isoformat(),
        "sanitized": True,
        "domains": [_serialize_host(h) for h in hosts],
    }
    _write_json(target, payload)
    utils.success(f"Domains backup saved: {target}")


@app.command(name="inbounds")
def backup_inbounds(
    output: Optional[str] = typer.Option(None, "--output", "-o", help="Output JSON file."),
):
    """Backup inbound tags and Xray inbound settings."""
    target = Path(output) if output else _backup_dir() / f"inbounds-backup-{_now_stamp()}.json"

    with GetDB() as db:
        inbounds = db.query(ProxyInbound).all()

    xray_config_path = _resolve_xray_config_path()
    payload = {
        "exported_at": datetime.utcnow().isoformat(),
        "sanitized": True,
        "inbounds": [{"tag": i.tag} for i in inbounds],
    }
    _write_json(target, payload)
    utils.success(f"Inbounds backup saved: {target}")
