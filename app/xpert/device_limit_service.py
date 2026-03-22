import hashlib
import json
import os
import re
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


DEFAULT_ALLOWED_DEVICES = 1
MAX_ALLOWED_DEVICES_SUDO = 10

_storage_lock = threading.Lock()


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _get_storage_file() -> str:
    env_path = (os.getenv("XPERT_DEVICE_LIMITS_FILE") or "").strip()
    if env_path:
        return env_path

    data_path = "data/sub_device_limits.json"
    if os.path.isdir("data") or os.path.exists(data_path):
        return data_path

    if os.path.exists("sub_hwid_locks.json") or os.path.exists("v2box_hwid_limits.json"):
        return "sub_device_limits.json"

    parent_dir = os.path.abspath(os.path.join(os.getcwd(), ".."))
    parent_hwid = os.path.join(parent_dir, "sub_hwid_locks.json")
    parent_v2box = os.path.join(parent_dir, "v2box_hwid_limits.json")
    if os.path.exists(parent_hwid) or os.path.exists(parent_v2box):
        return os.path.join(parent_dir, "sub_device_limits.json")

    return "sub_device_limits.json"


def _load_data() -> Dict[str, Any]:
    storage_file = _get_storage_file()
    if not os.path.exists(storage_file):
        return {"users": {}}
    try:
        with open(storage_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {"users": {}}
        if not isinstance(data.get("users"), dict):
            data["users"] = {}
        return data
    except Exception:
        return {"users": {}}


def _save_data(data: Dict[str, Any]) -> None:
    storage_file = _get_storage_file()
    parent = os.path.dirname(storage_file)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(storage_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _normalize_str(value: Any) -> str:
    return (str(value) if value is not None else "").strip()


def _normalize_device_id(value: Any) -> str:
    return _normalize_str(value).lower()


def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        s = str(value).strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _safe_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
    except Exception:
        return default
    return parsed if parsed >= 1 else default


def _strip_client_hint_quotes(value: str) -> str:
    text = _normalize_str(value)
    if text.startswith('"') and text.endswith('"') and len(text) >= 2:
        text = text[1:-1]
    return text


def _extract_device_id(headers: Dict[str, Any], query_params: Optional[Dict[str, Any]] = None) -> str:
    # Prefer explicit client-provided IDs, then optional query fallback for older clients.
    for key in ("x-device-id", "x-hwid", "x-install-id", "x-app-instance-id"):
        value = _normalize_str(headers.get(key))
        if value:
            return value

    if query_params:
        for key in ("device_id", "hwid", "happ_hwid", "v2box_id", "v2box_hwid"):
            value = _normalize_str(query_params.get(key))
            if value:
                return value

    return ""


def _extract_android_model(ua: str) -> str:
    if not ua:
        return ""
    m = re.search(r"Android\s+[0-9][0-9._]*;\s*([^;)\[]+?)\s+Build", ua, flags=re.IGNORECASE)
    if m:
        return _normalize_str(m.group(1))
    m = re.search(r"Android\s+[0-9][0-9._]*;\s*([^;)\[]+)", ua, flags=re.IGNORECASE)
    if m:
        model = _normalize_str(m.group(1))
        if model.lower() in {"wv", "mobile"}:
            return ""
        return model
    return ""


def _extract_android_os(ua: str) -> str:
    if not ua:
        return ""
    m = re.search(r"Android\s+([0-9][0-9._]*)", ua, flags=re.IGNORECASE)
    if not m:
        return "Android"
    return f"Android {m.group(1).replace('_', '.')}"


def _extract_ios_os(ua: str) -> str:
    if not ua:
        return ""
    m = re.search(r"OS\s+([0-9_]+)\s+like\s+Mac\s+OS\s+X", ua, flags=re.IGNORECASE)
    if not m:
        return "iOS"
    return f"iOS {m.group(1).replace('_', '.')}"


def _detect_device_meta(
    headers: Dict[str, Any], user_agent: str
) -> Tuple[str, str, str, str]:
    ua = _normalize_str(user_agent)
    ua_l = ua.lower()

    brand = _normalize_str(headers.get("x-device-brand"))
    model = _normalize_str(headers.get("x-device-model")) or _strip_client_hint_quotes(
        _normalize_str(headers.get("sec-ch-ua-model"))
    )
    os_name = _normalize_str(headers.get("x-device-os")) or _normalize_str(headers.get("x-ver-os"))
    device_type = ""

    if "android" in ua_l:
        device_type = "phone" if "mobile" in ua_l else "tablet"
        if not os_name:
            os_name = _extract_android_os(ua)
        if not model:
            model = _extract_android_model(ua)
        if not brand:
            model_l = model.lower()
            if model_l.startswith("sm-") or "samsung" in model_l:
                brand = "Samsung"
            elif model_l.startswith("m2") or model_l.startswith("m3") or model_l.startswith("redmi"):
                brand = "Xiaomi"
            elif model_l.startswith("pixel"):
                brand = "Google"
            else:
                brand = "Android"
    elif "iphone" in ua_l or "ipad" in ua_l or "ios" in ua_l:
        brand = brand or "Apple"
        if not model:
            if "ipad" in ua_l:
                model = "iPad"
            else:
                model = "iPhone"
        if not os_name:
            os_name = _extract_ios_os(ua)
        device_type = "tablet" if "ipad" in ua_l else "phone"
    elif "windows nt" in ua_l:
        brand = brand or "Microsoft"
        model = model or "Desktop"
        os_name = os_name or "Windows"
        device_type = "desktop"
    elif "mac os x" in ua_l or "macintosh" in ua_l:
        brand = brand or "Apple"
        model = model or "Mac"
        os_name = os_name or "macOS"
        device_type = "desktop"
    elif "linux" in ua_l:
        brand = brand or "Linux"
        model = model or "Desktop"
        os_name = os_name or "Linux"
        device_type = "desktop"

    if not device_type:
        if "tablet" in ua_l or "ipad" in ua_l:
            device_type = "tablet"
        elif "mobile" in ua_l or "android" in ua_l or "iphone" in ua_l:
            device_type = "phone"
        else:
            device_type = "desktop" if ua else "other"

    return brand or "Unknown", model or "Unknown", os_name or "Unknown", device_type


def _build_fingerprint_source(
    headers: Dict[str, Any],
    user_agent: str,
    ip: str,
    raw_device_id: str,
) -> str:
    if raw_device_id:
        return f"id:{_normalize_device_id(raw_device_id)}"

    chunks = [
        _normalize_str(user_agent),
        _strip_client_hint_quotes(_normalize_str(headers.get("sec-ch-ua-platform"))),
        _strip_client_hint_quotes(_normalize_str(headers.get("sec-ch-ua-model"))),
        _normalize_str(headers.get("x-device-model")),
        _normalize_str(headers.get("x-device-os")),
        _normalize_str(headers.get("accept-language")),
    ]
    base = "|".join(chunks)
    digest = hashlib.sha256(base.encode("utf-8", "ignore")).hexdigest()[:24]
    return f"fp:{digest}"


def _build_device_context(
    headers: Dict[str, Any],
    user_agent: str,
    ip: str,
    query_params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    raw_id = _extract_device_id(headers, query_params)
    fingerprint = _build_fingerprint_source(headers, user_agent, ip, raw_id)
    brand, model, os_name, device_type = _detect_device_meta(headers, user_agent)
    return {
        "fingerprint": fingerprint,
        "raw_device_id": _normalize_str(raw_id) or None,
        "brand": brand,
        "model": model,
        "os": os_name,
        "device_type": device_type,
        "user_agent": _normalize_str(user_agent),
        "last_ip": _normalize_str(ip),
    }


def _normalize_device_record(fingerprint: str, record: Dict[str, Any]) -> Dict[str, Any]:
    status = _normalize_str(record.get("status")).lower()
    if status not in {"allowed", "banned"}:
        status = "allowed"

    out = {
        "fingerprint": _normalize_str(record.get("fingerprint")) or fingerprint,
        "raw_device_id": _normalize_str(record.get("raw_device_id")) or None,
        "brand": _normalize_str(record.get("brand")) or "Unknown",
        "model": _normalize_str(record.get("model")) or "Unknown",
        "os": _normalize_str(record.get("os")) or "Unknown",
        "device_type": _normalize_str(record.get("device_type")) or "other",
        "status": status,
        "first_seen_at": _normalize_str(record.get("first_seen_at")) or _now_iso(),
        "last_seen_at": _normalize_str(record.get("last_seen_at")) or _now_iso(),
        "first_ip": _normalize_str(record.get("first_ip")) or None,
        "last_ip": _normalize_str(record.get("last_ip")) or None,
        "user_agent": _normalize_str(record.get("user_agent")) or None,
        "seen_count": max(1, _safe_int(record.get("seen_count"), 1)),
        "updated_at": _normalize_str(record.get("updated_at")) or _now_iso(),
        "force_banned": bool(record.get("force_banned", False)),
    }
    return out


def _can_rotate_hwid(existing: Dict[str, Any], device_ctx: Dict[str, Any]) -> bool:
    # Allow HWID rotation when the app re-issues HWID for the same device.
    # Guardrail: same last_ip when available.
    existing_ip = _normalize_str(existing.get("last_ip"))
    incoming_ip = _normalize_str(device_ctx.get("last_ip"))
    if existing_ip and incoming_ip and existing_ip != incoming_ip:
        return False
    return True


def _ua_family(user_agent: Any) -> str:
    ua = _normalize_str(user_agent)
    if not ua:
        return ""
    token = ua.split(" ", 1)[0]
    return token.split("/", 1)[0].lower()


def _coarse_device_signature(device: Dict[str, Any]) -> Tuple[str, str, str, str, str]:
    # A soft signature for clients that do not send stable HWID/device-id.
    return (
        _normalize_str(device.get("brand")).lower(),
        _normalize_str(device.get("model")).lower(),
        _normalize_str(device.get("os")).lower(),
        _normalize_str(device.get("device_type")).lower(),
        _ua_family(device.get("user_agent")),
    )


def _pick_matching_device_fingerprint(
    devices: Dict[str, Dict[str, Any]],
    device_ctx: Dict[str, Any],
    *,
    only_without_raw_id: bool,
) -> Optional[str]:
    sig = _coarse_device_signature(device_ctx)
    candidates: List[Tuple[str, Dict[str, Any]]] = []

    for fp, raw_rec in devices.items():
        rec = _normalize_device_record(fp, raw_rec)
        if only_without_raw_id and _normalize_str(rec.get("raw_device_id")):
            continue
        if _coarse_device_signature(rec) != sig:
            continue
        candidates.append((fp, rec))

    if not candidates:
        return None

    def _rank(item: Tuple[str, Dict[str, Any]]) -> Tuple[int, float]:
        _, rec = item
        status_rank = 0 if _normalize_str(rec.get("status")).lower() == "allowed" else 1
        dt = _parse_dt(rec.get("last_seen_at"))
        ts = dt.timestamp() if dt else 0.0
        return (status_rank, -ts)

    candidates.sort(key=_rank)
    return candidates[0][0]


def _collapse_soft_duplicates(devices: Dict[str, Dict[str, Any]]) -> bool:
    if not devices:
        return False

    normalized: Dict[str, Dict[str, Any]] = {}
    groups: Dict[Tuple[str, str, str, str, str], List[Tuple[str, Dict[str, Any]]]] = {}
    for fp, raw_rec in devices.items():
        rec = _normalize_device_record(fp, raw_rec)
        normalized[fp] = rec

        # Only collapse clients without stable device-id/HWID.
        if _normalize_str(rec.get("raw_device_id")):
            continue

        sig = _coarse_device_signature(rec)
        if not any(sig):
            continue
        groups.setdefault(sig, []).append((fp, rec))

    merged: Dict[str, Dict[str, Any]] = dict(normalized)
    for items in groups.values():
        if len(items) <= 1:
            continue

        def _rank(item: Tuple[str, Dict[str, Any]]) -> Tuple[int, float, str]:
            fp, rec = item
            status_rank = 0 if _normalize_str(rec.get("status")).lower() == "allowed" else 1
            dt = _parse_dt(rec.get("last_seen_at"))
            ts = dt.timestamp() if dt else 0.0
            return (status_rank, -ts, fp)

        keep_fp, keep_rec = sorted(items, key=_rank)[0]
        all_recs = [rec for _, rec in items]

        total_seen = sum(_safe_int(rec.get("seen_count"), 1) for rec in all_recs)
        first_rec = min(
            items,
            key=lambda item: (_parse_dt(item[1].get("first_seen_at")) or datetime.max, item[0]),
        )[1]
        last_rec = max(
            items,
            key=lambda item: (_parse_dt(item[1].get("last_seen_at")) or datetime.min, item[0]),
        )[1]

        merged_rec = dict(keep_rec)
        merged_rec["status"] = "allowed" if any(
            _normalize_str(rec.get("status")).lower() == "allowed" for rec in all_recs
        ) else "banned"
        merged_rec["seen_count"] = max(1, total_seen)

        first_seen = _normalize_str(first_rec.get("first_seen_at"))
        last_seen = _normalize_str(last_rec.get("last_seen_at"))
        if first_seen:
            merged_rec["first_seen_at"] = first_seen
        if last_seen:
            merged_rec["last_seen_at"] = last_seen

        first_ip = _normalize_str(first_rec.get("first_ip")) or _normalize_str(first_rec.get("last_ip"))
        last_ip = _normalize_str(last_rec.get("last_ip")) or _normalize_str(last_rec.get("first_ip"))
        if first_ip:
            merged_rec["first_ip"] = first_ip
        if last_ip:
            merged_rec["last_ip"] = last_ip

        if not _normalize_str(merged_rec.get("user_agent")):
            merged_rec["user_agent"] = _normalize_str(last_rec.get("user_agent")) or None

        merged_rec["updated_at"] = _now_iso()
        merged[keep_fp] = _normalize_device_record(keep_fp, merged_rec)

        for fp, _ in items:
            if fp == keep_fp:
                continue
            merged.pop(fp, None)

    changed = (set(merged.keys()) != set(devices.keys()))
    if not changed:
        for fp in merged:
            if devices.get(fp) != merged[fp]:
                changed = True
                break
    if changed:
        devices.clear()
        devices.update(merged)
    return changed


def _normalize_entry(entry: Any) -> Dict[str, Any]:
    if not isinstance(entry, dict):
        entry = {}

    limit = _safe_int(entry.get("limit"), DEFAULT_ALLOWED_DEVICES)
    unlimited = bool(entry.get("unlimited", False))
    raw_devices = entry.get("devices")
    devices: Dict[str, Dict[str, Any]] = {}
    if isinstance(raw_devices, dict):
        for fp, rec in raw_devices.items():
            if not isinstance(rec, dict):
                continue
            fingerprint = _normalize_str(fp) or _normalize_str(rec.get("fingerprint"))
            if not fingerprint:
                continue
            devices[fingerprint] = _normalize_device_record(fingerprint, rec)

    return {
        "limit": limit,
        "unlimited": unlimited,
        "devices": devices,
        "updated_at": _normalize_str(entry.get("updated_at")) or _now_iso(),
    }


def _is_unknown_meta(value: Any) -> bool:
    val = _normalize_str(value).lower()
    return (not val) or val in {"unknown", "other", "n/a", "na", "none", "null", "-"}


def _meta_quality_rank(rec: Dict[str, Any]) -> int:
    # Lower is better: records with real brand/model/os beat Unknown/empty records.
    quality = 0
    for key in ("brand", "model", "os"):
        if not _is_unknown_meta(rec.get(key)):
            quality += 1
    return 0 if quality > 0 else 1


def _dt_to_ts(dt: Optional[datetime], *, fallback: float) -> float:
    if not dt:
        return fallback
    try:
        return float(dt.timestamp())
    except Exception:
        return fallback


def _device_sort_key(item: Tuple[str, Dict[str, Any]]) -> Tuple[float, int, float, str]:
    fp, rec = item
    first_seen = _parse_dt(rec.get("first_seen_at"))
    last_seen = _parse_dt(rec.get("last_seen_at"))
    first_seen_ts = _dt_to_ts(first_seen, fallback=float("inf"))
    last_seen_ts = _dt_to_ts(last_seen, fallback=float("-inf"))
    # Stable order:
    # 1) oldest first_seen
    # 2) richer metadata first (not Unknown/empty)
    # 3) if tie, most recently seen first
    # 4) fingerprint for deterministic ordering
    return (first_seen_ts, _meta_quality_rank(rec), -last_seen_ts, fp)


def _policy_sort_key(item: Tuple[str, Dict[str, Any]]) -> Tuple[float, int, float, str]:
    fp, rec = item
    last_seen = _parse_dt(rec.get("last_seen_at")) or _parse_dt(rec.get("first_seen_at"))
    last_seen_ts = _dt_to_ts(last_seen, fallback=float("-inf"))
    first_seen_ts = _dt_to_ts(_parse_dt(rec.get("first_seen_at")), fallback=float("inf"))
    # Prefer the most recently seen devices for allow-list rotation.
    return (-last_seen_ts, _meta_quality_rank(rec), first_seen_ts, fp)


def _apply_limit_policy(entry: Dict[str, Any]) -> None:
    devices = entry.get("devices") or {}
    if not devices:
        return

    limit = _safe_int(entry.get("limit"), DEFAULT_ALLOWED_DEVICES)
    entry["limit"] = limit
    unlimited = bool(entry.get("unlimited", False))
    ordered_devices = sorted(devices.items(), key=_policy_sort_key)
    force_banned_fps = {
        fp for fp, rec in ordered_devices if bool((rec or {}).get("force_banned", False))
    }

    if unlimited:
        for fp, rec in devices.items():
            if fp in force_banned_fps:
                rec["status"] = "banned"
                continue
            if _normalize_str(rec.get("status")).lower() != "banned":
                rec["status"] = "allowed"
        return

    allowed_fps: set = set()
    for fp, _ in ordered_devices:
        if fp in force_banned_fps:
            continue
        allowed_fps.add(fp)
        if len(allowed_fps) >= limit:
            break

    for fp, rec in devices.items():
        if fp in force_banned_fps:
            rec["status"] = "banned"
            continue
        rec["status"] = "allowed" if fp in allowed_fps else "banned"


def get_device_settings_for_username(username: str) -> Dict[str, Any]:
    username = _normalize_str(username)
    if not username:
        return {"limit": DEFAULT_ALLOWED_DEVICES, "unlimited": False}

    with _storage_lock:
        data = _load_data()
        entry = _normalize_entry((data.get("users") or {}).get(username))
        return {"limit": int(entry["limit"]), "unlimited": bool(entry["unlimited"])}


def set_device_settings_for_username(
    username: str,
    limit: Optional[int],
    unlimited: bool = False,
) -> Dict[str, Any]:
    username = _normalize_str(username)
    if not username:
        return {"limit": DEFAULT_ALLOWED_DEVICES, "unlimited": False, "devices_count": 0}

    with _storage_lock:
        data = _load_data()
        users = data.get("users") or {}
        entry = _normalize_entry(users.get(username))

        if limit is None:
            normalized_limit = int(entry.get("limit") or DEFAULT_ALLOWED_DEVICES)
        else:
            normalized_limit = _safe_int(limit, DEFAULT_ALLOWED_DEVICES)

        entry["limit"] = normalized_limit
        entry["unlimited"] = bool(unlimited)
        _apply_limit_policy(entry)
        entry["updated_at"] = _now_iso()

        users[username] = entry
        data["users"] = users
        _save_data(data)

        return {
            "limit": int(entry["limit"]),
            "unlimited": bool(entry["unlimited"]),
            "devices_count": len(entry.get("devices") or {}),
        }


def list_devices_for_username(username: str) -> List[Dict[str, Any]]:
    username = _normalize_str(username)
    if not username:
        return []

    with _storage_lock:
        data = _load_data()
        users = data.get("users") or {}
        entry = _normalize_entry(users.get(username))
        devices = entry.get("devices") or {}
        if _collapse_soft_duplicates(devices):
            entry["devices"] = devices
            _apply_limit_policy(entry)
            entry["updated_at"] = _now_iso()
            users[username] = entry
            data["users"] = users
            _save_data(data)

    devices = entry.get("devices") or {}
    ordered = [rec for _, rec in sorted(devices.items(), key=_device_sort_key)]
    return ordered


def reset_devices_for_username(username: str) -> Dict[str, Any]:
    username = _normalize_str(username)
    if not username:
        return {"cleared": 0, "devices_count": 0}

    with _storage_lock:
        data = _load_data()
        users = data.get("users") or {}
        entry = _normalize_entry(users.get(username))
        devices = entry.get("devices") or {}
        cleared = len(devices)
        entry["devices"] = {}
        entry["updated_at"] = _now_iso()
        users[username] = entry
        data["users"] = users
        _save_data(data)

    return {
        "cleared": cleared,
        "devices_count": 0,
        "limit": int(entry.get("limit") or DEFAULT_ALLOWED_DEVICES),
        "unlimited": bool(entry.get("unlimited")),
    }


def set_device_status_for_username(
    username: str,
    fingerprint: str,
    status: str,
    force: bool = False,
) -> Optional[Dict[str, Any]]:
    username = _normalize_str(username)
    fingerprint = _normalize_str(fingerprint)
    status = _normalize_str(status).lower()
    if not username or not fingerprint or status not in {"allowed", "banned"}:
        return None

    with _storage_lock:
        data = _load_data()
        users = data.get("users") or {}
        entry = _normalize_entry(users.get(username))
        devices = entry.get("devices") or {}
        if fingerprint not in devices:
            return None

        evicted_fingerprints: List[str] = []
        if status == "allowed" and not bool(entry.get("unlimited")):
            limit = _safe_int(entry.get("limit"), DEFAULT_ALLOWED_DEVICES)
            keep_other_allowed = max(0, limit - 1)
            allowed_others: List[Tuple[str, Dict[str, Any]]] = []
            for fp, raw_rec in devices.items():
                if fp == fingerprint:
                    continue
                normalized = _normalize_device_record(fp, raw_rec)
                if _normalize_str(normalized.get("status")).lower() == "allowed":
                    allowed_others.append((fp, normalized))

            # Manual unban should be actionable: if no free slot, ban older allowed
            # devices to keep the configured limit while allowing the requested one.
            if len(allowed_others) > keep_other_allowed:
                to_ban = len(allowed_others) - keep_other_allowed
                for fp, rec_to_ban in sorted(allowed_others, key=_device_sort_key)[:to_ban]:
                    rec_to_ban["status"] = "banned"
                    rec_to_ban["updated_at"] = _now_iso()
                    devices[fp] = rec_to_ban
                    evicted_fingerprints.append(fp)

        rec = _normalize_device_record(fingerprint, devices[fingerprint])
        rec["status"] = status
        if status == "banned":
            if force:
                rec["force_banned"] = True
        else:
            rec["force_banned"] = False
        rec["updated_at"] = _now_iso()
        rec["last_seen_at"] = _normalize_str(rec.get("last_seen_at")) or _now_iso()
        devices[fingerprint] = rec
        entry["devices"] = devices
        _apply_limit_policy(entry)
        entry["updated_at"] = _now_iso()
        users[username] = entry
        data["users"] = users
        _save_data(data)
        out = dict(devices.get(fingerprint) or rec)
        if evicted_fingerprints:
            out["evicted_fingerprints"] = evicted_fingerprints
        return out


def check_and_register_device_for_username(
    username: str,
    headers: Dict[str, Any],
    user_agent: str,
    ip: str,
    query_params: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, Dict[str, Any]]:
    username = _normalize_str(username)
    if not username:
        return True, {}

    headers = {str(k).lower(): v for k, v in (headers or {}).items()}
    device_ctx = _build_device_context(headers, user_agent, ip, query_params)
    fingerprint = device_ctx["fingerprint"]

    with _storage_lock:
        data = _load_data()
        users = data.get("users") or {}
        entry = _normalize_entry(users.get(username))
        devices = entry.get("devices") or {}
        _collapse_soft_duplicates(devices)
        now = _now_iso()

        incoming_raw_id = _normalize_str(device_ctx.get("raw_device_id"))
        if incoming_raw_id:
            # If client started sending stable device-id now, migrate matching legacy fp:* record.
            if fingerprint not in devices:
                matched_fp = _pick_matching_device_fingerprint(
                    devices,
                    device_ctx,
                    only_without_raw_id=True,
                )
                if matched_fp and matched_fp in devices:
                    migrated = _normalize_device_record(matched_fp, devices.pop(matched_fp))
                    migrated["fingerprint"] = fingerprint
                    migrated["raw_device_id"] = incoming_raw_id
                    migrated["updated_at"] = now
                    devices[fingerprint] = migrated
            # HWID rotation guard: if raw-id changed but the device looks identical
            # and was seen recently, treat as the same device.
            if fingerprint not in devices:
                matched_fp = _pick_matching_device_fingerprint(
                    devices,
                    device_ctx,
                    only_without_raw_id=False,
                )
                if matched_fp and matched_fp in devices:
                    candidate = _normalize_device_record(matched_fp, devices[matched_fp])
                    if _can_rotate_hwid(candidate, device_ctx):
                        migrated = _normalize_device_record(matched_fp, devices.pop(matched_fp))
                        migrated["fingerprint"] = fingerprint
                        migrated["raw_device_id"] = incoming_raw_id
                        migrated["updated_at"] = now
                        devices[fingerprint] = migrated
        else:
            # For clients without stable id (Hiddify/Streisand/etc), reuse an existing
            # matching record to avoid duplicate registrations of the same device.
            if fingerprint not in devices:
                matched_fp = _pick_matching_device_fingerprint(
                    devices,
                    device_ctx,
                    only_without_raw_id=True,
                )
                if matched_fp:
                    fingerprint = matched_fp
                    device_ctx["fingerprint"] = matched_fp
                else:
                    # If a device sometimes omits HWID, reuse the existing record
                    # (even if it has raw_device_id) when it looks identical and IP matches.
                    matched_fp = _pick_matching_device_fingerprint(
                        devices,
                        device_ctx,
                        only_without_raw_id=False,
                    )
                    if matched_fp and matched_fp in devices:
                        candidate = _normalize_device_record(matched_fp, devices[matched_fp])
                        if _can_rotate_hwid(candidate, device_ctx):
                            fingerprint = matched_fp
                            device_ctx["fingerprint"] = matched_fp

        existing = devices.get(fingerprint)
        if existing:
            existing = _normalize_device_record(fingerprint, existing)
            for key in ("raw_device_id", "brand", "model", "os", "device_type", "user_agent"):
                value = _normalize_str(device_ctx.get(key))
                if value:
                    existing[key] = value
            if device_ctx.get("last_ip"):
                existing["last_ip"] = device_ctx["last_ip"]
            if not existing.get("first_ip") and device_ctx.get("last_ip"):
                existing["first_ip"] = device_ctx["last_ip"]
            existing["last_seen_at"] = now
            existing["updated_at"] = now
            existing["seen_count"] = _safe_int(existing.get("seen_count"), 1) + 1
            devices[fingerprint] = existing
        else:
            allowed_count = sum(
                1
                for rec in devices.values()
                if _normalize_str(rec.get("status")).lower() == "allowed"
            )
            limit = _safe_int(entry.get("limit"), DEFAULT_ALLOWED_DEVICES)
            status = "allowed" if bool(entry.get("unlimited")) or allowed_count < limit else "banned"
            devices[fingerprint] = _normalize_device_record(
                fingerprint,
                {
                    **device_ctx,
                    "status": status,
                    "first_seen_at": now,
                    "last_seen_at": now,
                    "first_ip": device_ctx.get("last_ip"),
                    "last_ip": device_ctx.get("last_ip"),
                    "seen_count": 1,
                    "updated_at": now,
                },
            )

        entry["devices"] = devices
        _apply_limit_policy(entry)
        entry["updated_at"] = now
        users[username] = entry
        data["users"] = users
        _save_data(data)

        current = devices.get(fingerprint) or {}
        allowed = _normalize_str(current.get("status")).lower() != "banned"
        return allowed, current


def _legacy_candidate_paths(filename: str) -> List[str]:
    out: List[str] = []
    parent_dir = os.path.abspath(os.path.join(os.getcwd(), ".."))
    for path in (f"data/{filename}", filename, os.path.join(parent_dir, filename)):
        if path not in out and os.path.exists(path):
            out.append(path)
    return out


def seed_device_data_from_legacy_sources() -> Dict[str, int]:
    imported = 0
    touched_users = 0

    with _storage_lock:
        data = _load_data()
        users = data.get("users") or {}

        # Legacy: v2box_hwid_limits.json
        for path in _legacy_candidate_paths("v2box_hwid_limits.json"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    legacy = json.load(f)
            except Exception:
                continue
            legacy_users = legacy.get("users") if isinstance(legacy, dict) else {}
            if not isinstance(legacy_users, dict):
                continue

            for username, raw_entry in legacy_users.items():
                if not isinstance(raw_entry, dict):
                    continue
                uname = _normalize_str(username)
                if not uname:
                    continue

                entry = _normalize_entry(users.get(uname))
                devices = entry.get("devices") or {}
                updated_at = _normalize_str(raw_entry.get("updated_at")) or _now_iso()

                ids_with_ts: List[Tuple[str, str]] = []
                raw_devices = raw_entry.get("devices")
                if isinstance(raw_devices, dict):
                    for raw_id, ts in raw_devices.items():
                        norm_id = _normalize_device_id(raw_id)
                        if norm_id:
                            ids_with_ts.append((norm_id, _normalize_str(ts) or updated_at))
                ids_with_ts.sort(key=lambda x: _parse_dt(x[1]) or datetime.max)

                required_id = _normalize_device_id(
                    raw_entry.get("required_device_id") or raw_entry.get("required_hwid")
                )
                if required_id and required_id not in [x[0] for x in ids_with_ts]:
                    ids_with_ts.insert(0, (required_id, updated_at))

                changed = False
                for norm_id, ts in ids_with_ts:
                    fp = f"id:{norm_id}"
                    if fp in devices:
                        continue
                    devices[fp] = _normalize_device_record(
                        fp,
                        {
                            "fingerprint": fp,
                            "raw_device_id": norm_id,
                            "brand": "Unknown",
                            "model": "Unknown",
                            "os": "Unknown",
                            "device_type": "other",
                            "status": "allowed",
                            "first_seen_at": ts,
                            "last_seen_at": ts,
                            "seen_count": 1,
                            "updated_at": updated_at,
                        },
                    )
                    imported += 1
                    changed = True

                if changed:
                    entry["devices"] = devices
                    entry["updated_at"] = _now_iso()
                    users[uname] = entry
                    touched_users += 1

        # Legacy: sub_hwid_locks.json
        for path in _legacy_candidate_paths("sub_hwid_locks.json"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    legacy = json.load(f)
            except Exception:
                continue
            legacy_locks = legacy.get("locks") if isinstance(legacy, dict) else {}
            if not isinstance(legacy_locks, dict):
                continue

            for username, raw_entry in legacy_locks.items():
                if not isinstance(raw_entry, dict):
                    continue
                uname = _normalize_str(username)
                if not uname:
                    continue

                entry = _normalize_entry(users.get(uname))
                devices = entry.get("devices") or {}
                updated_at = _normalize_str(raw_entry.get("updated_at")) or _now_iso()
                ids: List[str] = []

                required = _normalize_device_id(raw_entry.get("hwid") or raw_entry.get("required_hwid"))
                if required:
                    ids.append(required)

                seen_list = raw_entry.get("seen_hwids")
                if isinstance(seen_list, list):
                    for raw_id in seen_list:
                        norm_id = _normalize_device_id(raw_id)
                        if norm_id and norm_id not in ids:
                            ids.append(norm_id)

                changed = False
                for norm_id in ids:
                    fp = f"id:{norm_id}"
                    if fp in devices:
                        continue
                    devices[fp] = _normalize_device_record(
                        fp,
                        {
                            "fingerprint": fp,
                            "raw_device_id": norm_id,
                            "brand": "Unknown",
                            "model": "Unknown",
                            "os": "Unknown",
                            "device_type": "other",
                            "status": "allowed",
                            "first_seen_at": updated_at,
                            "last_seen_at": updated_at,
                            "seen_count": 1,
                            "updated_at": updated_at,
                        },
                    )
                    imported += 1
                    changed = True

                if changed:
                    entry["devices"] = devices
                    entry["updated_at"] = _now_iso()
                    users[uname] = entry
                    touched_users += 1

        data["users"] = users
        _save_data(data)

    return {"imported_devices": imported, "touched_users": touched_users}


def enforce_first_device_policy_for_all_users(default_limit: int = DEFAULT_ALLOWED_DEVICES) -> Dict[str, int]:
    users_total = 0
    devices_total = 0
    banned_total = 0

    with _storage_lock:
        data = _load_data()
        users = data.get("users") or {}

        for username, raw_entry in list(users.items()):
            users_total += 1
            entry = _normalize_entry(raw_entry)
            entry["unlimited"] = False
            entry["limit"] = _safe_int(entry.get("limit"), default_limit)
            if entry["limit"] < default_limit:
                entry["limit"] = default_limit

            devices = entry.get("devices") or {}
            devices_total += len(devices)
            if devices:
                ordered = sorted(devices.items(), key=_device_sort_key)
                keep_allowed: set = set()
                for fp, _ in ordered[: entry["limit"]]:
                    keep_allowed.add(fp)

                for fp, rec in devices.items():
                    new_status = "allowed" if fp in keep_allowed else "banned"
                    old_status = _normalize_str(rec.get("status")).lower()
                    rec["status"] = new_status
                    rec["updated_at"] = _now_iso()
                    if old_status != "banned" and new_status == "banned":
                        banned_total += 1
                entry["devices"] = devices

            entry["updated_at"] = _now_iso()
            users[username] = entry

        data["users"] = users
        _save_data(data)

    return {
        "users_total": users_total,
        "devices_total": devices_total,
        "banned_total": banned_total,
    }
