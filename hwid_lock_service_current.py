import json
import os
import threading
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from app.utils.jwt import get_subscription_payload
from config import XRAY_SUBSCRIPTION_PATH

_storage_file = 'data/sub_hwid_locks.json'
_storage_lock = threading.Lock()


def normalize_hwid(hwid: str) -> str:
    return (hwid or '').strip()


def _load_data() -> dict:
    if not os.path.exists(_storage_file):
        return {'locks': {}}
    try:
        with open(_storage_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {'locks': {}}
        if not isinstance(data.get('locks'), dict):
            data['locks'] = {}
        return data
    except Exception:
        return {'locks': {}}


def _save_data(data: dict) -> None:
    os.makedirs(os.path.dirname(_storage_file), exist_ok=True)
    with open(_storage_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _normalize_entry(item: dict) -> dict:
    if not isinstance(item, dict):
        return {}

    hwid = normalize_hwid(item.get('hwid') or item.get('required_hwid') or '')

    max_unique_hwid = item.get('max_unique_hwid')
    try:
        max_unique_hwid = int(max_unique_hwid) if max_unique_hwid is not None else None
    except Exception:
        max_unique_hwid = None
    if max_unique_hwid is not None and not (1 <= max_unique_hwid <= 5):
        max_unique_hwid = None

    seen = []
    for v in item.get('seen_hwids') or []:
        vv = normalize_hwid(v)
        if vv and vv not in seen:
            seen.append(vv)

    out = {'updated_at': item.get('updated_at')}
    if hwid:
        out['hwid'] = hwid
    if max_unique_hwid is not None:
        out['max_unique_hwid'] = max_unique_hwid
    if seen:
        out['seen_hwids'] = seen
    return out


def extract_subscription_token(url: str) -> Optional[str]:
    try:
        parsed = urlparse(url.strip())
        parts = [p for p in parsed.path.split('/') if p]
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
    if not payload or not payload.get('username'):
        return None
    return payload['username']


def set_required_hwid_for_subscription_url(url: str, hwid: str) -> Optional[str]:
    hwid_norm = normalize_hwid(hwid)
    if not hwid_norm:
        return None

    username = _get_username_from_sub_url(url)
    if not username:
        return None

    with _storage_lock:
        data = _load_data()
        entry = _normalize_entry(data.get('locks', {}).get(username, {}))
        entry['hwid'] = hwid_norm
        seen = entry.get('seen_hwids') or []
        if hwid_norm not in seen:
            seen.append(hwid_norm)
        entry['seen_hwids'] = seen
        entry['updated_at'] = datetime.utcnow().isoformat()
        data['locks'][username] = entry
        _save_data(data)
    return username


def set_hwid_limit_for_subscription_url(url: str, max_unique_hwid: int, seed_hwid: str = '') -> Optional[str]:
    try:
        max_unique_hwid = int(max_unique_hwid)
    except Exception:
        return None
    if not (1 <= max_unique_hwid <= 5):
        return None

    username = _get_username_from_sub_url(url)
    if not username:
        return None

    seed = normalize_hwid(seed_hwid)
    with _storage_lock:
        data = _load_data()
        entry = _normalize_entry(data.get('locks', {}).get(username, {}))
        entry['max_unique_hwid'] = max_unique_hwid

        seen = entry.get('seen_hwids') or []
        required = normalize_hwid(entry.get('hwid', ''))
        if required and required not in seen:
            seen.append(required)
        if seed and seed not in seen:
            seen.append(seed)
        if seen:
            entry['seen_hwids'] = seen

        entry['updated_at'] = datetime.utcnow().isoformat()
        data['locks'][username] = entry
        _save_data(data)
    return username


def get_required_hwid_for_username(username: str) -> Optional[str]:
    if not username:
        return None
    with _storage_lock:
        data = _load_data()
        item = _normalize_entry(data.get('locks', {}).get(username))
    hwid = normalize_hwid(item.get('hwid', ''))
    return hwid or None


def check_and_register_hwid_for_username(username: str, x_hwid: str) -> bool:
    if not username:
        return True

    incoming = normalize_hwid(x_hwid)

    with _storage_lock:
        data = _load_data()
        raw = data.get('locks', {}).get(username)
        item = _normalize_entry(raw)

        required = normalize_hwid(item.get('hwid', ''))
        max_unique = item.get('max_unique_hwid')
        seen = item.get('seen_hwids') or []

        # No lock/limit configured => old behavior.
        if not required and max_unique is None:
            return True

        # If strict HWID without limit -> old strict mode.
        if required and max_unique is None:
            return incoming == required

        # Any mode with limit requires x-hwid header.
        if not incoming:
            return False

        # Ensure required hwid is counted inside allowed pool.
        if required and required not in seen:
            seen.append(required)

        # Already known device.
        if incoming in seen:
            item['seen_hwids'] = seen
            data['locks'][username] = item
            _save_data(data)
            return True

        # New device but limit reached.
        if max_unique is not None and len(seen) >= max_unique:
            return False

        # Register new device within limit.
        seen.append(incoming)
        item['seen_hwids'] = seen
        item['updated_at'] = datetime.utcnow().isoformat()
        data['locks'][username] = item
        _save_data(data)
        return True


def clear_hwid_lock_for_username(username: str) -> bool:
    """
    Remove HWID lock/limit entry for a username.
    Returns True if an entry existed and was removed, False otherwise.
    """
    username = (username or "").strip()
    if not username:
        return False

    with _storage_lock:
        data = _load_data()
        locks = data.get("locks", {})
        existed = username in locks
        if existed:
            try:
                del locks[username]
            except Exception:
                locks.pop(username, None)
            data["locks"] = locks
            _save_data(data)
        return existed
