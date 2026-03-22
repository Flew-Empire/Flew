import json
import os
import threading
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

from fastapi import Request

from app.utils.jwt import get_subscription_payload
from config import XRAY_SUBSCRIPTION_PATH, XPERT_IP_ROTATION_WINDOW_SECONDS

_storage_file = "data/sub_ip_limits.json"
_storage_lock = threading.Lock()

WINDOW_SECONDS_DEFAULT = int(XPERT_IP_ROTATION_WINDOW_SECONDS or 0)
DEFAULT_UNIQUE_IP_LIMIT = 2


def _now() -> datetime:
    return datetime.utcnow()


def _parse_dt(s: str) -> Optional[datetime]:
    try:
        if not s:
            return None
        # Stored as utc isoformat without Z.
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _now_iso() -> str:
    return _now().isoformat()


def _normalize_entry(raw: Any) -> Dict[str, Any]:
    entry: Dict[str, Any] = raw if isinstance(raw, dict) else {}
    limit = entry.get("limit")
    disabled = bool(entry.get("disabled", False))

    def _as_dt(val: Any) -> Optional[datetime]:
        return _parse_dt(str(val)) if val else None

    active_ip = (entry.get("active_ip") or "").strip()
    standby_ip = (entry.get("standby_ip") or "").strip()
    active_seen_at = _as_dt(entry.get("active_seen_at"))
    standby_seen_at = _as_dt(entry.get("standby_seen_at"))

    # Migrate legacy "ips" map -> active/standby (most recent first).
    legacy_ips = entry.get("ips")
    if (not active_ip and not standby_ip) and isinstance(legacy_ips, dict):
        items: list[Tuple[str, datetime]] = []
        for ip, ts in legacy_ips.items():
            ip = (ip or "").strip()
            dt = _parse_dt(ts) if isinstance(ts, str) else None
            if ip and dt:
                items.append((ip, dt))
        items.sort(key=lambda x: x[1], reverse=True)
        if items:
            active_ip, active_seen_at = items[0]
        if len(items) > 1:
            standby_ip, standby_seen_at = items[1]

    return {
        "limit": limit,
        "disabled": disabled,
        "active_ip": active_ip or None,
        "standby_ip": standby_ip or None,
        "active_seen_at": active_seen_at.isoformat() if active_seen_at else None,
        "standby_seen_at": standby_seen_at.isoformat() if standby_seen_at else None,
        "updated_at": entry.get("updated_at") or _now_iso(),
    }


def _prune_slots(entry: Dict[str, Any], cutoff: datetime) -> None:
    for key_ip, key_ts in (("active_ip", "active_seen_at"), ("standby_ip", "standby_seen_at")):
        ip = entry.get(key_ip)
        ts = _parse_dt(entry.get(key_ts)) if entry.get(key_ts) else None
        if ip and ts and ts < cutoff:
            entry[key_ip] = None
            entry[key_ts] = None


def _load_data() -> dict:
    if not os.path.exists(_storage_file):
        return {"users": {}}
    try:
        with open(_storage_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {"users": {}}
        if not isinstance(data.get("users"), dict):
            data["users"] = {}
        return data
    except Exception:
        return {"users": {}}


def _save_data(data: dict) -> None:
    os.makedirs(os.path.dirname(_storage_file), exist_ok=True)
    with open(_storage_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def normalize_ip(ip: str) -> str:
    return (ip or "").strip()


def extract_subscription_token(url: str) -> Optional[str]:
    try:
        parsed = urlparse(url.strip())
        parts = [p for p in parsed.path.split("/") if p]
        if not parts:
            return None
        for idx, part in enumerate(parts):
            if part == XRAY_SUBSCRIPTION_PATH and idx + 1 < len(parts):
                token = parts[idx + 1].strip()
                return token or None
    except Exception:
        return None
    return None


def _get_username_from_sub_url(url: str) -> Optional[str]:
    token = extract_subscription_token(url)
    if not token:
        return None
    payload = get_subscription_payload(token)
    if not payload or not payload.get("username"):
        return None
    return payload["username"]


def get_client_ip(request: Request) -> str:
    # Trust nginx reverse proxy headers.
    h = request.headers
    ip = h.get("x-real-ip") or ""
    if not ip:
        xff = h.get("x-forwarded-for") or ""
        if xff:
            ip = xff.split(",")[0].strip()
    if not ip:
        try:
            ip = request.client.host if request.client else ""
        except Exception:
            ip = ""
    return normalize_ip(ip)


def get_unique_ip_limit_for_username(username: str) -> int:
    username = (username or "").strip()
    if not username:
        return DEFAULT_UNIQUE_IP_LIMIT
    with _storage_lock:
        data = _load_data()
        u = data.get("users", {}).get(username) or {}
    if bool(u.get("disabled")):
        return 0
    try:
        limit = int(u.get("limit")) if u.get("limit") is not None else DEFAULT_UNIQUE_IP_LIMIT
    except Exception:
        limit = DEFAULT_UNIQUE_IP_LIMIT
    if limit < 1:
        limit = DEFAULT_UNIQUE_IP_LIMIT
    return limit


def set_unique_ip_limit_for_username(username: str, limit: Optional[int]) -> None:
    username = (username or "").strip()
    if not username:
        return

    # None/0 disables limit (unlimited).
    if limit is not None:
        try:
            limit = int(limit)
        except Exception:
            limit = None
    if limit is not None and limit <= 0:
        limit = None

    with _storage_lock:
        data = _load_data()
        users = data.get("users", {})
        entry = _normalize_entry(users.get(username))
        if limit is None:
            entry.pop("limit", None)
            entry["disabled"] = True
        else:
            entry["disabled"] = False
            if limit == DEFAULT_UNIQUE_IP_LIMIT:
                # clear override only
                entry.pop("limit", None)
            else:
                entry["limit"] = limit
            # If limit is 1, drop standby slot.
            if int(limit) <= 1:
                entry["standby_ip"] = None
                entry["standby_seen_at"] = None
        entry["updated_at"] = _now_iso()
        users[username] = entry
        data["users"] = users
        _save_data(data)


def clear_ip_tracking_for_username(username: str) -> None:
    username = (username or "").strip()
    if not username:
        return
    with _storage_lock:
        data = _load_data()
        users = data.get("users", {})
        entry = _normalize_entry(users.get(username))
        entry["active_ip"] = None
        entry["standby_ip"] = None
        entry["active_seen_at"] = None
        entry["standby_seen_at"] = None
        entry["updated_at"] = _now_iso()
        users[username] = entry
        data["users"] = users
        _save_data(data)


def check_and_register_ip_for_username(username: str, ip: str, window_seconds: int = WINDOW_SECONDS_DEFAULT) -> bool:
    username = (username or "").strip()
    ip = normalize_ip(ip)
    if not username:
        return True
    if not ip:
        return True

    limit = get_unique_ip_limit_for_username(username)
    if limit <= 0:
        return True
    cutoff = _now() - timedelta(seconds=window_seconds) if window_seconds > 0 else None

    with _storage_lock:
        data = _load_data()
        users = data.get("users", {})
        entry = _normalize_entry(users.get(username))
        if cutoff:
            _prune_slots(entry, cutoff)

        active_ip = (entry.get("active_ip") or "").strip()
        standby_ip = (entry.get("standby_ip") or "").strip()
        now_iso = _now_iso()

        if ip == active_ip:
            entry["active_seen_at"] = now_iso
        elif ip == standby_ip and standby_ip:
            # Swap active and standby
            entry["active_ip"] = standby_ip
            entry["active_seen_at"] = now_iso
            entry["standby_ip"] = active_ip or None
            entry["standby_seen_at"] = _now_iso() if active_ip else None
        else:
            # New IP: rotate. Keep up to 2 slots (active + standby).
            if limit <= 1:
                entry["active_ip"] = ip
                entry["active_seen_at"] = now_iso
                entry["standby_ip"] = None
                entry["standby_seen_at"] = None
            else:
                entry["standby_ip"] = active_ip or None
                entry["standby_seen_at"] = entry.get("active_seen_at") if active_ip else None
                entry["active_ip"] = ip
                entry["active_seen_at"] = now_iso

        entry["updated_at"] = now_iso
        users[username] = entry
        data["users"] = users
        _save_data(data)
        return True
