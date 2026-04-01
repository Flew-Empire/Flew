import copy
import json
import os
import re
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.models.subscription_settings import SubscriptionSettingsResponse
from app.utils.system import readable_size
from config import SUB_PROFILE_TITLE, SUB_SUPPORT_URL, SUB_UPDATE_INTERVAL

_storage_lock = threading.Lock()
_storage_file = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "data",
    "subscription_settings.json",
)

_template_pattern = re.compile(r"\{\{\s*([A-Z0-9_]+)\s*\}\}")

_DEFAULT_ANNOUNCE = """Обновляйте подписку перед каждым подключением 🔄

Her bir birikdirmeden öň podpiskany täzeläň 🔄"""


def _default_custom_remarks() -> Dict[str, List[str]]:
    return {
        "expired_users": ["Subscription expired", "Contact support"],
        "limited_users": ["Subscription limited", "Contact support"],
        "disabled_users": ["Subscription disabled", "Contact support"],
        "empty_hosts": ["No active hosts available", "Check Hosts page"],
        "hwid_max_devices_exceeded": ["Device limit reached"],
        "hwid_not_supported": ["App not supported"],
    }


def _default_settings() -> Dict[str, Any]:
    try:
        profile_update_interval = max(1, int(str(SUB_UPDATE_INTERVAL or "12").strip()))
    except Exception:
        profile_update_interval = 12
    return {
        "profile_title": SUB_PROFILE_TITLE or "Flew",
        "support_link": SUB_SUPPORT_URL or "",
        "profile_update_interval": profile_update_interval,
        "is_profile_web_page_url_enabled": True,
        "serve_json_for_happ": False,
        "is_show_custom_remarks": True,
        "randomize_text_links": False,
        "happ_announce": _DEFAULT_ANNOUNCE,
        "happ_routing": "",
        "custom_response_headers": {},
        "custom_remarks": _default_custom_remarks(),
        "hwid_settings": {
            "enabled": False,
            "fallback_device_limit": 1,
            "max_devices_announce": "Device limit reached",
        },
    }


def _normalize_list(items: Optional[List[str]], fallback: List[str]) -> List[str]:
    if not isinstance(items, list):
        return list(fallback)
    cleaned = [str(item).strip() for item in items if str(item).strip()]
    return cleaned or list(fallback)


def _normalize_settings(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    defaults = _default_settings()
    data = copy.deepcopy(defaults)
    if not isinstance(raw, dict):
        return data

    for key in (
        "profile_title",
        "support_link",
        "happ_announce",
        "happ_routing",
    ):
        if key in raw and raw[key] is not None:
            data[key] = str(raw[key]).strip()

    for key in (
        "is_profile_web_page_url_enabled",
        "serve_json_for_happ",
        "is_show_custom_remarks",
        "randomize_text_links",
    ):
        if key in raw and raw[key] is not None:
            data[key] = bool(raw[key])

    if raw.get("profile_update_interval") is not None:
        try:
            data["profile_update_interval"] = max(
                1, int(raw["profile_update_interval"])
            )
        except Exception:
            pass

    headers = raw.get("custom_response_headers")
    if isinstance(headers, dict):
        cleaned_headers = {}
        for key, value in headers.items():
            header_key = str(key).strip()
            if not header_key:
                continue
            cleaned_headers[header_key] = str(value).strip()
        data["custom_response_headers"] = cleaned_headers

    remarks = raw.get("custom_remarks")
    if isinstance(remarks, dict):
        for key, fallback in defaults["custom_remarks"].items():
            data["custom_remarks"][key] = _normalize_list(remarks.get(key), fallback)

    hwid = raw.get("hwid_settings")
    if isinstance(hwid, dict):
        if hwid.get("enabled") is not None:
            data["hwid_settings"]["enabled"] = bool(hwid["enabled"])
        if hwid.get("fallback_device_limit") is not None:
            try:
                data["hwid_settings"]["fallback_device_limit"] = max(
                    0, int(hwid["fallback_device_limit"])
                )
            except Exception:
                pass
        if hwid.get("max_devices_announce") is not None:
            value = str(hwid["max_devices_announce"]).strip()
            data["hwid_settings"]["max_devices_announce"] = value or None

    return data


def _load_settings_unlocked() -> Dict[str, Any]:
    try:
        if os.path.exists(_storage_file):
            with open(_storage_file, "r", encoding="utf-8") as file:
                return _normalize_settings(json.load(file))
    except Exception:
        pass
    data = _normalize_settings({})
    os.makedirs(os.path.dirname(_storage_file), exist_ok=True)
    with open(_storage_file, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
    return data


def get_subscription_settings() -> Dict[str, Any]:
    with _storage_lock:
        return _load_settings_unlocked()


def update_subscription_settings(updates: Dict[str, Any]) -> Dict[str, Any]:
    with _storage_lock:
        current = _load_settings_unlocked()
        merged = copy.deepcopy(current)
        for key, value in (updates or {}).items():
            if value is None:
                continue
            if key == "custom_remarks" and isinstance(value, dict):
                merged[key].update(value)
                continue
            if key == "hwid_settings" and isinstance(value, dict):
                merged[key].update(value)
                continue
            merged[key] = value
        normalized = _normalize_settings(merged)
        os.makedirs(os.path.dirname(_storage_file), exist_ok=True)
        with open(_storage_file, "w", encoding="utf-8") as file:
            json.dump(normalized, file, ensure_ascii=False, indent=2)
        return normalized


def get_subscription_settings_model() -> SubscriptionSettingsResponse:
    return SubscriptionSettingsResponse.model_validate(get_subscription_settings())


def _status_value(user: Any) -> str:
    status = getattr(user, "status", "")
    value = getattr(status, "value", status)
    return str(value or "").strip() or "active"


def _days_left(user: Any) -> str:
    expire = getattr(user, "expire", None)
    if not expire:
        return "Unlimited"
    seconds_left = int(expire) - int(datetime.utcnow().timestamp())
    return str(max(0, seconds_left // 86400))


def _total_traffic_bytes(user: Any) -> int:
    data_limit = getattr(user, "data_limit", None)
    return int(data_limit or 0)


def _traffic_used_bytes(user: Any) -> int:
    return int(getattr(user, "used_traffic", 0) or 0)


def _traffic_left_bytes(user: Any) -> int:
    total = _total_traffic_bytes(user)
    if total <= 0:
        return 0
    return max(0, total - _traffic_used_bytes(user))


def _safe_string(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def render_subscription_value(
    template: str,
    user: Any,
    settings: Optional[Dict[str, Any]] = None,
    subscription_url: str = "",
) -> str:
    if not template:
        return ""
    settings = settings or get_subscription_settings()
    replacements = {
        "USERNAME": _safe_string(getattr(user, "username", "")),
        "STATUS": _status_value(user).upper(),
        "DAYS_LEFT": _days_left(user),
        "TRAFFIC_USED": readable_size(_traffic_used_bytes(user)),
        "TRAFFIC_LEFT": (
            "Unlimited"
            if _total_traffic_bytes(user) <= 0
            else readable_size(_traffic_left_bytes(user))
        ),
        "TOTAL_TRAFFIC": (
            "Unlimited"
            if _total_traffic_bytes(user) <= 0
            else readable_size(_total_traffic_bytes(user))
        ),
        "TRAFFIC_USED_BYTES": str(_traffic_used_bytes(user)),
        "TRAFFIC_LEFT_BYTES": str(_traffic_left_bytes(user)),
        "TOTAL_TRAFFIC_BYTES": str(_total_traffic_bytes(user)),
        "SUBSCRIPTION_URL": subscription_url,
        "EXPIRE_UNIX": _safe_string(getattr(user, "expire", 0) or 0),
        "HWID_LIMIT": _safe_string(
            settings.get("hwid_settings", {}).get("fallback_device_limit", 1)
        ),
    }

    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        return replacements.get(key, match.group(0))

    return _template_pattern.sub(replace, template)


def get_custom_remarks_for_user(
    user: Any,
    settings: Optional[Dict[str, Any]] = None,
    *,
    is_empty_hosts: bool = False,
    hwid_max_devices_exceeded: bool = False,
    hwid_not_supported: bool = False,
    subscription_url: str = "",
) -> List[str]:
    settings = settings or get_subscription_settings()
    if not settings.get("is_show_custom_remarks", True):
        return []

    remarks = settings.get("custom_remarks", {})
    status = _status_value(user)
    selected: List[str] = []

    if hwid_max_devices_exceeded:
        selected = remarks.get("hwid_max_devices_exceeded", [])
    elif hwid_not_supported:
        selected = remarks.get("hwid_not_supported", [])
    elif is_empty_hosts:
        selected = remarks.get("empty_hosts", [])
    elif status == "expired":
        selected = remarks.get("expired_users", [])
    elif status == "limited":
        selected = remarks.get("limited_users", [])
    elif status == "disabled":
        selected = remarks.get("disabled_users", [])

    return [
        render_subscription_value(item, user, settings, subscription_url)
        for item in selected
        if str(item).strip()
    ]
