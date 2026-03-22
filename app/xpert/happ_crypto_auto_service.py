import json
import os
import threading
from datetime import datetime
from typing import Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import requests

from app import logger

_storage_file = "data/happ_crypto_links.json"
_storage_lock = threading.Lock()
_crypto_api = "https://crypto.happ.su/api-v2.php"


def _load_data() -> dict:
    if not os.path.exists(_storage_file):
        return {"links": {}}
    try:
        with open(_storage_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {"links": {}}
        if not isinstance(data.get("links"), dict):
            data["links"] = {}
        return data
    except Exception:
        return {"links": {}}


def _save_data(data: dict) -> None:
    os.makedirs(os.path.dirname(_storage_file), exist_ok=True)
    with open(_storage_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _normalize_source_url(url: str) -> str:
    parts = urlsplit((url or "").strip())
    if not parts.scheme or not parts.netloc:
        return ""
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    # Needed for hiding edit/share/QR/JSON in Happ UI where this flag is respected.
    query["hide-settings"] = "true"
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query, doseq=True), parts.fragment)
    )


def _extract_link_from_response(resp: requests.Response) -> str:
    content_type = (resp.headers.get("content-type") or "").lower()
    if "application/json" in content_type:
        try:
            data = resp.json()
            if isinstance(data, str):
                return data.strip()
            if isinstance(data, dict):
                for key in ("url", "link", "result", "data", "encrypted", "encrypted_link"):
                    value = data.get(key)
                    if isinstance(value, str) and value.strip():
                        return value.strip()
        except Exception:
            pass
    return (resp.text or "").strip()


def _create_crypto_link(source_url: str) -> Optional[str]:
    payload = {"url": source_url}
    resp = requests.post(_crypto_api, json=payload, timeout=12)
    resp.raise_for_status()
    link = _extract_link_from_response(resp)
    return link or None


def get_cached_or_create_happ_crypto_link(username: str, source_url: str) -> Optional[str]:
    username = (username or "").strip()
    if not username:
        return None

    normalized_source = _normalize_source_url(source_url)
    if not normalized_source:
        return None

    with _storage_lock:
        data = _load_data()
        entry = data.get("links", {}).get(username, {})
        cached_source = (entry.get("source_url") or "").strip()
        cached_link = (entry.get("link") or "").strip()
        if cached_source == normalized_source and cached_link:
            return cached_link

    try:
        locked_link = _create_crypto_link(normalized_source)
    except Exception as exc:
        logger.warning(f"HAPP_CRYPTO_AUTO_FAIL user={username} err={exc}")
        return None

    if not locked_link:
        return None

    with _storage_lock:
        data = _load_data()
        links = data.setdefault("links", {})
        links[username] = {
            "source_url": normalized_source,
            "link": locked_link,
            "updated_at": datetime.utcnow().isoformat(),
        }
        _save_data(data)
    return locked_link


def clear_happ_crypto_link_for_username(username: str) -> None:
    username = (username or "").strip()
    if not username:
        return
    with _storage_lock:
        data = _load_data()
        links = data.get("links", {})
        if username in links:
            links.pop(username, None)
            data["links"] = links
            _save_data(data)

