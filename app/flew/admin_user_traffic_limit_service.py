import json
import os
import threading
from typing import Optional

_storage_file = "data/admin_user_traffic_limits.json"
_storage_lock = threading.Lock()


def _load_data() -> dict:
    if not os.path.exists(_storage_file):
        return {"admins": {}}
    try:
        with open(_storage_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {"admins": {}}
        if not isinstance(data.get("admins"), dict):
            data["admins"] = {}
        return data
    except Exception:
        return {"admins": {}}


def _save_data(data: dict) -> None:
    os.makedirs(os.path.dirname(_storage_file), exist_ok=True)
    with open(_storage_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_admin_user_traffic_limit_bytes(admin_username: str) -> Optional[int]:
    admin_username = (admin_username or "").strip()
    if not admin_username:
        return None
    with _storage_lock:
        data = _load_data()
        entry = (data.get("admins", {}) or {}).get(admin_username) or {}
    value = entry.get("user_traffic_limit")
    if value is None:
        return None
    try:
        value = int(value)
    except Exception:
        return None
    if value <= 0:
        return None
    return value


def set_admin_user_traffic_limit_bytes(admin_username: str, limit_bytes: Optional[int]) -> Optional[int]:
    admin_username = (admin_username or "").strip()
    if not admin_username:
        return None

    if limit_bytes is not None:
        try:
            limit_bytes = int(limit_bytes)
        except Exception:
            limit_bytes = None
    if limit_bytes is not None and limit_bytes <= 0:
        limit_bytes = None

    with _storage_lock:
        data = _load_data()
        admins = data.get("admins", {}) or {}
        entry = admins.get(admin_username) or {}
        if limit_bytes is None:
            entry.pop("user_traffic_limit", None)
        else:
            entry["user_traffic_limit"] = int(limit_bytes)
        admins[admin_username] = entry
        data["admins"] = admins
        _save_data(data)

    return limit_bytes
