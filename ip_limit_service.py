import json
import os
import threading
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlparse

from fastapi import Request

from app.utils.jwt import get_subscription_payload
from config import XRAY_SUBSCRIPTION_PATH

_storage_file = "data/sub_ip_limits.json"
_storage_lock = threading.Lock()

WINDOW_SECONDS_DEFAULT = 2 * 60 * 60  # 2 hours
DEFAULT_UNIQUE_IP_LIMIT = 3


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

    # None/0 clears override (default applies).
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
        entry = users.get(username) or {}
        if limit is None or limit == DEFAULT_UNIQUE_IP_LIMIT:
            # clear override only (keep ip history if present)
            entry.pop("limit", None)
        else:
            entry["limit"] = limit
        entry["updated_at"] = _now().isoformat()
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
        entry = users.get(username) or {}
        entry.pop("ips", None)
        entry["updated_at"] = _now().isoformat()
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
    cutoff = _now() - timedelta(seconds=window_seconds)

    with _storage_lock:
        data = _load_data()
        users = data.get("users", {})
        entry = users.get(username) or {}
        ips = entry.get("ips") or {}
        if not isinstance(ips, dict):
            ips = {}

        # prune old
        pruned = {}
        for k, v in ips.items():
            dt = _parse_dt(v) if isinstance(v, str) else None
            if dt and dt >= cutoff:
                pruned[k] = v
        ips = pruned

        if ip in ips:
            ips[ip] = _now().isoformat()
            entry["ips"] = ips
            entry["updated_at"] = _now().isoformat()
            users[username] = entry
            data["users"] = users
            _save_data(data)
            return True

        if len(ips) >= limit:
            entry["ips"] = ips
            entry["updated_at"] = _now().isoformat()
            users[username] = entry
            data["users"] = users
            _save_data(data)
            return False

        ips[ip] = _now().isoformat()
        entry["ips"] = ips
        entry["updated_at"] = _now().isoformat()
        users[username] = entry
        data["users"] = users
        _save_data(data)
        return True

