import json
import os
import threading
from datetime import datetime
from typing import Optional

_storage_file = "data/v2box_hwid_limits.json"
_storage_lock = threading.Lock()

# Legacy constant kept for compatibility with old imports.
MAX_LIMIT = 5


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


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


def _normalize_device_id(v: Optional[str]) -> str:
    # Normalize case so UUID-like IDs are matched robustly across clients.
    return (v or "").strip().lower()


def get_v2box_limit_for_username(username: str) -> Optional[int]:
    # V2Box limit logic is disabled by request; keep function for compatibility.
    return None


def get_required_v2box_device_id_for_username(username: str) -> Optional[str]:
    username = (username or "").strip()
    if not username:
        return None
    with _storage_lock:
        data = _load_data()
        entry = (data.get("users") or {}).get(username) or {}
    val = _normalize_device_id(entry.get("required_device_id") or entry.get("required_hwid"))
    return val or None


def set_v2box_settings_for_username(username: str, limit: Optional[int], required_device_id: Optional[str]) -> dict:
    username = (username or "").strip()
    if not username:
        return {"limit": None, "required_device_id": None}

    norm_id = _normalize_device_id(required_device_id)

    with _storage_lock:
        data = _load_data()
        users = data.get("users") or {}
        entry = users.get(username) or {}

        if not norm_id:
            entry.pop("required_device_id", None)
            entry.pop("required_hwid", None)
            entry.pop("limit", None)
            entry.pop("devices", None)
        else:
            entry["required_device_id"] = norm_id
            entry.pop("required_hwid", None)
            entry.pop("limit", None)
            entry.pop("devices", None)

        entry["updated_at"] = _now_iso()
        users[username] = entry
        data["users"] = users
        _save_data(data)

    return {"limit": None, "required_device_id": norm_id or None}


def clear_v2box_for_username(username: str) -> bool:
    username = (username or "").strip()
    if not username:
        return False
    with _storage_lock:
        data = _load_data()
        users = data.get("users") or {}
        entry = users.get(username) or {}

        had = bool(entry.get("required_device_id") or entry.get("required_hwid") or entry.get("limit") or entry.get("devices"))
        entry.pop("required_device_id", None)
        entry.pop("required_hwid", None)
        entry.pop("limit", None)
        entry.pop("devices", None)
        entry["updated_at"] = _now_iso()
        users[username] = entry
        data["users"] = users
        _save_data(data)
    return had


def _extract_device_id(
    headers: dict,
    query_params: Optional[dict] = None,
    allow_query: bool = False,
) -> str:
    # Prefer client headers. Query params are allowed only when explicitly enabled.
    for key in ("x-device-id", "x-hwid", "x-install-id", "x-app-instance-id"):
        v = headers.get(key)
        if v and str(v).strip():
            return str(v).strip()
    if allow_query and query_params:
        for key in ("v2box_id", "v2box_hwid", "device_id", "hwid"):
            v = query_params.get(key)
            if v and str(v).strip():
                return str(v).strip()
    return ""


def has_v2box_protection(username: str) -> bool:
    return bool(get_required_v2box_device_id_for_username(username))


def check_and_register_v2box_for_username(username: str, headers: dict, query_params: Optional[dict] = None) -> bool:
    username = (username or "").strip()
    if not username:
        return True

    with _storage_lock:
        data = _load_data()
        users = data.get("users") or {}
        entry = users.get(username) or {}

        required_id = _normalize_device_id(entry.get("required_device_id") or entry.get("required_hwid"))
        # Legacy behavior: only enforce when required_id is configured.
        if not required_id:
            return True

        # Strict mode: accept device-id only from headers (prevents URL reuse).
        device_id = _normalize_device_id(_extract_device_id(headers, query_params, allow_query=False))

        if not device_id:
            return False
        if device_id != required_id:
            return False

        entry["last_seen_at"] = _now_iso()
        users[username] = entry
        data["users"] = users
        _save_data(data)
        return True
