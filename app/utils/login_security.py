import logging
import threading
import time
from typing import Dict, List, Tuple

import requests

from config import (
    LOGIN_CAPTCHA_ENABLED,
    LOGIN_CAPTCHA_REQUIRED_SECONDS,
    LOGIN_CAPTCHA_SECRET,
    LOGIN_CAPTCHA_SITE_KEY,
    LOGIN_CAPTCHA_THRESHOLD,
    LOGIN_CAPTCHA_VENDOR,
    LOGIN_CAPTCHA_WINDOW_SECONDS,
)
from app.utils.features import feature_enabled

logger = logging.getLogger(__name__)


_VERIFY_URLS = {
    "turnstile": "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    "hcaptcha": "https://hcaptcha.com/siteverify",
    "recaptcha": "https://www.google.com/recaptcha/api/siteverify",
}


def captcha_configured() -> bool:
    if not feature_enabled("captcha"):
        return False
    return bool(LOGIN_CAPTCHA_ENABLED and LOGIN_CAPTCHA_SITE_KEY and LOGIN_CAPTCHA_SECRET)


def get_captcha_public_config() -> Dict[str, str]:
    if not captcha_configured():
        return {}
    return {
        "captcha_required": True,
        "captcha_vendor": (LOGIN_CAPTCHA_VENDOR or "turnstile").lower(),
        "captcha_site_key": LOGIN_CAPTCHA_SITE_KEY,
    }


def verify_captcha(token: str, remote_ip: str) -> bool:
    if not captcha_configured():
        return True
    if not token:
        return False

    vendor = (LOGIN_CAPTCHA_VENDOR or "turnstile").lower()
    url = _VERIFY_URLS.get(vendor)
    if not url:
        logger.warning("Unknown captcha vendor: %s", vendor)
        return False

    payload = {"secret": LOGIN_CAPTCHA_SECRET, "response": token}
    if remote_ip:
        payload["remoteip"] = remote_ip

    try:
        resp = requests.post(url, data=payload, timeout=4)
        data = resp.json() if resp.ok else {}
        return bool(data.get("success"))
    except Exception as exc:
        logger.warning("Captcha verification failed: %s", exc)
        return False


def _now() -> float:
    return time.time()


def _norm_username(username: str) -> str:
    return (username or "").strip().lower()


def _norm_ip(ip: str) -> str:
    ip = (ip or "").strip()
    return ip or "unknown"


class LoginAttemptTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: Dict[str, Dict[str, float]] = {}

    def _keys(self, username: str, ip: str) -> List[str]:
        ip_key = f"ip:{_norm_ip(ip)}"
        user = _norm_username(username)
        keys = [ip_key]
        if user:
            keys.append(f"{ip_key}|user:{user}")
        return keys

    def _cleanup(self, now_ts: float) -> None:
        ttl = max(LOGIN_CAPTCHA_REQUIRED_SECONDS, LOGIN_CAPTCHA_WINDOW_SECONDS) + 60
        cutoff = now_ts - ttl
        stale = [k for k, v in self._entries.items() if v.get("last_ts", 0) < cutoff]
        for k in stale:
            self._entries.pop(k, None)

    def record_failure(self, username: str, ip: str) -> None:
        now_ts = _now()
        with self._lock:
            self._cleanup(now_ts)
            for key in self._keys(username, ip):
                entry = self._entries.get(
                    key,
                    {"count": 0, "first_ts": now_ts, "last_ts": now_ts, "captcha_until": 0.0},
                )
                if now_ts - entry.get("first_ts", now_ts) > LOGIN_CAPTCHA_WINDOW_SECONDS:
                    entry["count"] = 0
                    entry["first_ts"] = now_ts
                entry["count"] = entry.get("count", 0) + 1
                entry["last_ts"] = now_ts
                if entry["count"] >= LOGIN_CAPTCHA_THRESHOLD and LOGIN_CAPTCHA_REQUIRED_SECONDS > 0:
                    entry["captcha_until"] = max(
                        entry.get("captcha_until", 0.0), now_ts + LOGIN_CAPTCHA_REQUIRED_SECONDS
                    )
                self._entries[key] = entry

    def record_success(self, username: str, ip: str) -> None:
        with self._lock:
            for key in self._keys(username, ip):
                self._entries.pop(key, None)

    def is_captcha_required(self, username: str, ip: str) -> bool:
        if not captcha_configured():
            return False
        now_ts = _now()
        with self._lock:
            self._cleanup(now_ts)
            for key in self._keys(username, ip):
                entry = self._entries.get(key)
                if not entry:
                    continue
                if entry.get("captcha_until", 0.0) > now_ts:
                    return True
                if (
                    entry.get("count", 0) >= LOGIN_CAPTCHA_THRESHOLD
                    and now_ts - entry.get("first_ts", now_ts) <= LOGIN_CAPTCHA_WINDOW_SECONDS
                ):
                    return True
        return False


login_attempts = LoginAttemptTracker()
