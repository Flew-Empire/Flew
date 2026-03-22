import json
import logging
import os
import threading
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import requests
from sqlalchemy.orm import Session
from urllib3.exceptions import InsecureRequestWarning

from app.db import crud
from app.db.models import Admin, User
from app.models.user import UserResponse
from app.xpert.storage import DATA_DIR

requests.packages.urllib3.disable_warnings(category=InsecureRequestWarning)

logger = logging.getLogger(__name__)

PANEL_SYNC_MAX_TARGETS = 4
MAX_USERNAME_SUFFIX_TRIES = 32

SYNC_USER_FIELDS = (
    "username",
    "status",
    "expire",
    "data_limit",
    "data_limit_reset_strategy",
    "proxies",
    "inbounds",
    "note",
    "on_hold_expire_duration",
    "on_hold_timeout",
    "next_plan",
)

VALID_REMOTE_STATUSES = {"active", "disabled", "on_hold"}
CREATE_ALLOWED_STATUSES = {"active", "on_hold"}


def _utc_now_iso() -> str:
    return datetime.utcnow().isoformat()


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _jsonify_value(value: Any) -> Any:
    if hasattr(value, "value"):
        return getattr(value, "value")
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _jsonify_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonify_value(item) for item in value]
    return value


def build_user_clone_payload(user_data: Dict) -> Dict:
    payload: Dict = {}
    for key in SYNC_USER_FIELDS:
        if key in user_data:
            payload[key] = _jsonify_value(user_data.get(key))

    if payload.get("expire") in (None, ""):
        payload["expire"] = 0
    if payload.get("data_limit") in (None, ""):
        payload["data_limit"] = 0

    status = str(payload.get("status") or "").strip().lower()
    if status:
        normalized = status if status in VALID_REMOTE_STATUSES else "disabled"
        payload["_desired_status"] = normalized
        payload["status"] = normalized if normalized in CREATE_ALLOWED_STATUSES else "active"
    else:
        payload["_desired_status"] = "active"
        payload["status"] = "active"

    return payload


class PanelSyncService:
    def __init__(self):
        self.storage_file = os.path.join(DATA_DIR, "panel_sync_targets.json")
        self.state_file = os.path.join(DATA_DIR, "panel_sync_state.json")
        self._lock = threading.RLock()
        self._ensure_storage()
        self._ensure_state()

    # target storage
    def _default_targets(self) -> List[Dict]:
        return [
            {
                "id": i + 1,
                "url": "",
                "username": "",
                "password": "",
                "enabled": False,
                "last_status": "idle",
                "last_message": "",
                "last_checked": None,
            }
            for i in range(PANEL_SYNC_MAX_TARGETS)
        ]

    def _ensure_storage(self):
        os.makedirs(os.path.dirname(self.storage_file), exist_ok=True)
        if not os.path.exists(self.storage_file):
            self._save_targets_unlocked({"targets": self._default_targets()})
            return
        data = self._load_targets_unlocked()
        targets = self._normalize_targets(data.get("targets") or [])
        self._save_targets_unlocked({"targets": targets})

    def _load_targets_unlocked(self) -> Dict:
        return self._load_json_with_retry(
            path=self.storage_file,
            default={"targets": self._default_targets()},
            warn_prefix="Failed to load panel sync targets",
        )

    def _save_targets_unlocked(self, data: Dict):
        self._atomic_write_json(self.storage_file, data)

    def _normalize_target(self, idx: int, src: Optional[Dict]) -> Dict:
        src = src or {}
        url = str(src.get("url", "") or "").strip()
        username = str(src.get("username", "") or "").strip()
        password = str(src.get("password", "") or "")
        enabled = bool(src.get("enabled", False)) and bool(url and username and password)
        return {
            "id": idx + 1,
            "url": url,
            "username": username,
            "password": password,
            "enabled": enabled,
            "last_status": str(src.get("last_status", "idle") or "idle"),
            "last_message": str(src.get("last_message", "") or ""),
            "last_checked": src.get("last_checked"),
        }

    def _normalize_targets(self, targets: List[Dict]) -> List[Dict]:
        normalized: List[Dict] = []
        for i in range(PANEL_SYNC_MAX_TARGETS):
            src = targets[i] if i < len(targets) else {}
            normalized.append(self._normalize_target(i, src))
        return normalized

    def get_targets(self) -> List[Dict]:
        with self._lock:
            data = self._load_targets_unlocked()
            targets = self._normalize_targets(data.get("targets") or [])
            if targets != data.get("targets"):
                self._save_targets_unlocked({"targets": targets})
            return targets

    def save_targets(self, targets: List[Dict]) -> List[Dict]:
        with self._lock:
            normalized = self._normalize_targets(targets or [])
            self._save_targets_unlocked({"targets": normalized})
            self._prune_state_to_target_ids_unlocked({int(item["id"]) for item in normalized})
            return normalized

    # state storage
    def _default_state(self) -> Dict:
        return {"targets": {}}

    def _ensure_state(self):
        os.makedirs(os.path.dirname(self.state_file), exist_ok=True)
        with self._lock:
            state = self._load_state_unlocked()
            normalized = self._normalize_state_unlocked(state)
            self._save_state_unlocked(normalized)

    def _load_state_unlocked(self) -> Dict:
        if not os.path.exists(self.state_file):
            return self._default_state()
        return self._load_json_with_retry(
            path=self.state_file,
            default=self._default_state(),
            warn_prefix="Failed to load panel sync state",
        )

    def _save_state_unlocked(self, state: Dict):
        self._atomic_write_json(self.state_file, state)

    def _atomic_write_json(self, path: str, payload: Dict):
        directory = os.path.dirname(path) or "."
        os.makedirs(directory, exist_ok=True)
        tmp_path = f"{path}.tmp.{os.getpid()}.{int(time.time() * 1000)}"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)

    def _load_json_with_retry(
        self,
        path: str,
        default: Dict,
        warn_prefix: str,
        attempts: int = 3,
        delay_seconds: float = 0.08,
    ) -> Dict:
        last_error: Optional[Exception] = None
        for attempt in range(attempts):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    return data
                return dict(default)
            except Exception as e:
                last_error = e
                if attempt < attempts - 1:
                    time.sleep(delay_seconds)
        logger.warning("%s: %s", warn_prefix, last_error)
        return dict(default)

    def _normalize_state_unlocked(self, state: Dict) -> Dict:
        out = {"targets": {}}
        raw_targets = state.get("targets") if isinstance(state, dict) else {}
        if not isinstance(raw_targets, dict):
            raw_targets = {}

        for idx in range(1, PANEL_SYNC_MAX_TARGETS + 1):
            key = str(idx)
            target_state = raw_targets.get(key)
            if not isinstance(target_state, dict):
                continue
            raw_users = target_state.get("users")
            if not isinstance(raw_users, dict):
                raw_users = {}
            users: Dict[str, Dict] = {}
            for local_username, info in raw_users.items():
                if not isinstance(info, dict):
                    continue
                remote_username = str(info.get("remote_username") or "").strip()
                if not remote_username:
                    continue
                users[str(local_username)] = {
                    "remote_username": remote_username,
                    "created_by_sync": bool(info.get("created_by_sync", True)),
                    "last_sync_at": info.get("last_sync_at"),
                    "last_error": str(info.get("last_error", "") or ""),
                    "last_remote_used_traffic": _safe_int(info.get("last_remote_used_traffic"), 0),
                    "usage_initialized": bool(info.get("usage_initialized", False)),
                    "cached_links": info.get("cached_links") if isinstance(info.get("cached_links"), list) else [],
                    "cached_status": str(info.get("cached_status", "") or ""),
                    "cached_data_limit": _safe_int(info.get("cached_data_limit"), 0),
                    "cached_expire": _safe_int(info.get("cached_expire"), 0),
                    "cached_updated_at": info.get("cached_updated_at"),
                }
            out["targets"][key] = {"users": users}
        return out

    def _ensure_target_state_unlocked(self, state: Dict, target_id: int) -> Dict:
        targets = state.setdefault("targets", {})
        key = str(int(target_id))
        if key not in targets or not isinstance(targets.get(key), dict):
            targets[key] = {"users": {}}
        target_state = targets[key]
        if not isinstance(target_state.get("users"), dict):
            target_state["users"] = {}
        return target_state

    def _prune_state_to_target_ids_unlocked(self, valid_ids: set):
        state = self._load_state_unlocked()
        targets = state.setdefault("targets", {})
        delete_keys = [key for key in targets.keys() if _safe_int(key, 0) not in valid_ids]
        for key in delete_keys:
            targets.pop(key, None)
        self._save_state_unlocked(self._normalize_state_unlocked(state))

    def _get_target_user_map(self, target_id: int) -> Dict[str, Dict]:
        with self._lock:
            state = self._normalize_state_unlocked(self._load_state_unlocked())
            target_state = self._ensure_target_state_unlocked(state, target_id)
            return dict(target_state.get("users", {}))

    def _get_target_user_entry(self, target_id: int, local_username: str) -> Optional[Dict]:
        users = self._get_target_user_map(target_id)
        entry = users.get(local_username)
        if not isinstance(entry, dict):
            return None
        return dict(entry)

    def _set_target_user_entry(self, target_id: int, local_username: str, info: Dict):
        with self._lock:
            state = self._normalize_state_unlocked(self._load_state_unlocked())
            target_state = self._ensure_target_state_unlocked(state, target_id)
            users = target_state["users"]
            users[local_username] = {
                **(users.get(local_username) or {}),
                **info,
            }
            self._save_state_unlocked(self._normalize_state_unlocked(state))

    def _remove_target_user_entry(self, target_id: int, local_username: str):
        with self._lock:
            state = self._normalize_state_unlocked(self._load_state_unlocked())
            target_state = self._ensure_target_state_unlocked(state, target_id)
            target_state["users"].pop(local_username, None)
            self._save_state_unlocked(self._normalize_state_unlocked(state))

    def _bulk_merge_target_user_entries(self, updates: List[Tuple[int, str, Dict]]):
        if not updates:
            return
        with self._lock:
            state = self._normalize_state_unlocked(self._load_state_unlocked())
            for target_id, local_username, info in updates:
                target_state = self._ensure_target_state_unlocked(state, target_id)
                users = target_state["users"]
                users[local_username] = {
                    **(users.get(local_username) or {}),
                    **(info or {}),
                }
            self._save_state_unlocked(self._normalize_state_unlocked(state))

    def _iter_target_user_entries(self, target_id: int) -> List[Tuple[str, Dict]]:
        users = self._get_target_user_map(target_id)
        return [(username, dict(info)) for username, info in users.items() if isinstance(info, dict)]

    def get_cached_user_links(self, local_username: str, include_disabled_targets: bool = False) -> List[str]:
        targets = self.get_targets()
        target_ids = {
            int(item["id"])
            for item in targets
            if include_disabled_targets or bool(item.get("enabled"))
        }
        with self._lock:
            state = self._normalize_state_unlocked(self._load_state_unlocked())

        links: List[str] = []
        seen = set()
        for key, target_state in (state.get("targets") or {}).items():
            target_id = _safe_int(key, 0)
            if target_id not in target_ids:
                continue
            users = target_state.get("users") if isinstance(target_state, dict) else {}
            if not isinstance(users, dict):
                continue
            entry = users.get(local_username)
            if not isinstance(entry, dict):
                continue
            cached_links = entry.get("cached_links")
            if not isinstance(cached_links, list):
                continue
            for raw_link in cached_links:
                link = str(raw_link or "").strip()
                if not link or link in seen:
                    continue
                seen.add(link)
                links.append(link)
        return links

    # remote api helpers
    def _origin_from_url(self, raw_url: str) -> str:
        value = str(raw_url or "").strip()
        if not value:
            return ""
        if "://" not in value:
            value = f"https://{value}"
        parsed = urlparse(value)
        scheme = parsed.scheme or "https"
        netloc = parsed.netloc
        if not netloc and parsed.path:
            netloc = parsed.path.split("/")[0]
        if not netloc:
            return ""
        return f"{scheme}://{netloc}".rstrip("/")

    def _api_base(self, target: Dict) -> str:
        origin = self._origin_from_url(target.get("url", ""))
        return f"{origin}/api" if origin else ""

    def _auth_token(self, target: Dict) -> str:
        api_base = self._api_base(target)
        if not api_base:
            raise RuntimeError("Invalid panel URL")
        resp = requests.post(
            f"{api_base}/admin/token",
            data={
                "username": target.get("username", ""),
                "password": target.get("password", ""),
            },
            timeout=(8, 20),
            verify=False,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Auth failed: HTTP {resp.status_code}")
        payload = resp.json() if resp.text else {}
        token = payload.get("access_token")
        if not token:
            raise RuntimeError("Auth failed: no access token")
        return token

    def _request(
        self,
        method: str,
        target: Dict,
        path: str,
        token: str,
        json_payload: Optional[Dict] = None,
        timeout: Tuple[int, int] = (8, 25),
    ) -> requests.Response:
        api_base = self._api_base(target)
        headers = {"Authorization": f"Bearer {token}"}
        if json_payload is not None:
            headers["Content-Type"] = "application/json"
        return requests.request(
            method=method,
            url=f"{api_base}{path}",
            headers=headers,
            json=json_payload,
            timeout=timeout,
            verify=False,
        )

    def _fetch_supported_inbounds(self, target: Dict, token: str) -> Dict[str, List[str]]:
        try:
            resp = self._request("GET", target, "/inbounds", token, timeout=(8, 20))
            if resp.status_code != 200:
                return {}
            raw = resp.json() if resp.text else {}
            if not isinstance(raw, dict):
                return {}
        except Exception:
            return {}

        out: Dict[str, List[str]] = {}
        for proto, items in raw.items():
            proto_key = str(proto).strip().lower()
            tags: List[str] = []
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        tag = str(item.get("tag") or "").strip()
                        if tag:
                            tags.append(tag)
                    elif isinstance(item, str):
                        val = item.strip()
                        if val:
                            tags.append(val)
            if proto_key:
                out[proto_key] = list(dict.fromkeys(tags))
        return out

    def _prepare_payload_for_target(self, payload: Dict, supported_inbounds: Dict[str, List[str]]) -> Dict:
        if not supported_inbounds:
            return dict(payload)

        prepared = dict(payload)
        supported_protocols = list(supported_inbounds.keys())

        proxies_raw = prepared.get("proxies") or {}
        inbounds_raw = prepared.get("inbounds") or {}

        proxies: Dict[str, Any] = {}
        if isinstance(proxies_raw, dict):
            for proto, cfg in proxies_raw.items():
                proto_key = str(proto).strip().lower()
                if proto_key in supported_inbounds:
                    proxies[proto_key] = cfg if isinstance(cfg, dict) else {}

        inbounds: Dict[str, List[str]] = {}
        if isinstance(inbounds_raw, dict):
            for proto, tags in inbounds_raw.items():
                proto_key = str(proto).strip().lower()
                if proto_key not in supported_inbounds:
                    continue
                allowed = set(supported_inbounds.get(proto_key) or [])
                selected: List[str] = []
                if isinstance(tags, list):
                    for tag in tags:
                        tag_val = str(tag).strip()
                        if tag_val and tag_val in allowed:
                            selected.append(tag_val)
                if not selected:
                    selected = list(supported_inbounds.get(proto_key) or [])
                inbounds[proto_key] = selected

        for proto in supported_protocols:
            if proto not in proxies:
                proxies[proto] = {}
            if proto not in inbounds:
                inbounds[proto] = list(supported_inbounds.get(proto) or [])

        prepared["proxies"] = proxies
        prepared["inbounds"] = inbounds
        return prepared

    def _status_for_create(self, desired_status: str) -> str:
        if desired_status in CREATE_ALLOWED_STATUSES:
            return desired_status
        return "active"

    def _build_update_payload(self, payload: Dict, desired_status: str, include_full: bool = True) -> Dict:
        source = {
            k: v
            for k, v in payload.items()
            if not str(k).startswith("_")
        }
        if not include_full:
            source = {
                k: source.get(k)
                for k in (
                    "status",
                    "expire",
                    "data_limit",
                    "data_limit_reset_strategy",
                    "note",
                )
                if k in source
            }
        source.pop("username", None)
        if desired_status in VALID_REMOTE_STATUSES:
            source["status"] = desired_status
        return source

    def _is_username_conflict(self, resp: requests.Response) -> bool:
        if resp.status_code == 409:
            return True
        if resp.status_code not in (400, 422):
            return False
        detail = ""
        try:
            payload = resp.json()
            detail = str(payload.get("detail") if isinstance(payload, dict) else payload)
        except Exception:
            detail = resp.text or ""
        low = detail.lower()
        return (
            "exists" in low
            or "already exist" in low
            or ("username" in low and ("taken" in low or "exist" in low))
        )

    def _fetch_remote_user(self, target: Dict, token: str, remote_username: str) -> Optional[Dict]:
        resp = self._request("GET", target, f"/user/{remote_username}", token)
        if resp.status_code == 404:
            return None
        if resp.status_code != 200:
            raise RuntimeError(f"Fetch user failed: HTTP {resp.status_code}")
        data = resp.json() if resp.text else {}
        if isinstance(data, dict):
            return data
        return None

    def _fetch_remote_usage_map(self, target: Dict, token: str) -> Dict[str, int]:
        resp = self._request("GET", target, "/users?limit=100000", token, timeout=(8, 60))
        if resp.status_code != 200:
            raise RuntimeError(f"List users failed: HTTP {resp.status_code}")
        payload = resp.json() if resp.text else {}
        users = payload.get("users") if isinstance(payload, dict) else []
        if not isinstance(users, list):
            return {}
        out: Dict[str, int] = {}
        for item in users:
            if not isinstance(item, dict):
                continue
            username = str(item.get("username") or "").strip()
            if not username:
                continue
            out[username] = _safe_int(item.get("used_traffic"), 0)
        return out

    def _build_snapshot_from_remote(self, remote_user: Dict) -> Dict:
        links = remote_user.get("links") if isinstance(remote_user.get("links"), list) else []
        clean_links = [str(link).strip() for link in links if str(link).strip()]
        return {
            "cached_links": clean_links,
            "cached_status": str(remote_user.get("status") or ""),
            "cached_data_limit": _safe_int(remote_user.get("data_limit"), 0),
            "cached_expire": _safe_int(remote_user.get("expire"), 0),
            "cached_updated_at": _utc_now_iso(),
            "last_remote_used_traffic": _safe_int(remote_user.get("used_traffic"), 0),
            "usage_initialized": True,
            "last_error": "",
        }

    def _stamp_result(self, target: Dict, status: str, message: str):
        target["last_status"] = status
        target["last_message"] = message
        target["last_checked"] = _utc_now_iso()

    def _update_target_runtime_state(self, target_id: int, status: str, message: str):
        with self._lock:
            data = self._load_targets_unlocked()
            targets = self._normalize_targets(data.get("targets") or [])
            changed = False
            for item in targets:
                if int(item.get("id") or 0) != int(target_id):
                    continue
                self._stamp_result(item, status, message)
                changed = True
                break
            if changed:
                self._save_targets_unlocked({"targets": targets})

    def test_targets(self) -> List[Dict]:
        targets = self.get_targets()
        for target in targets:
            if not target.get("url"):
                self._stamp_result(target, "idle", "Empty URL")
                continue
            if not (target.get("username") and target.get("password")):
                self._stamp_result(target, "idle", "Missing credentials")
                continue
            try:
                token = self._auth_token(target)
                resp = self._request("GET", target, "/admin", token, timeout=(8, 20))
                if resp.status_code == 200:
                    details = resp.json() if resp.text else {}
                    username = details.get("username") if isinstance(details, dict) else ""
                    self._stamp_result(target, "ok", f"Connected{f' as {username}' if username else ''}")
                else:
                    self._stamp_result(target, "error", f"System check failed: HTTP {resp.status_code}")
            except Exception as e:
                self._stamp_result(target, "error", str(e))

        with self._lock:
            self._save_targets_unlocked({"targets": self._normalize_targets(targets)})
        return targets

    def _create_user_with_fallback(
        self,
        target: Dict,
        token: str,
        payload: Dict,
        desired_status: str,
        preferred_username: Optional[str] = None,
    ) -> Dict:
        request_payload = {
            k: v for k, v in payload.items() if not str(k).startswith("_")
        }
        base_username = str(request_payload.get("username") or "").strip()
        if not base_username:
            raise RuntimeError("Missing username in sync payload")

        candidates: List[str] = []
        if preferred_username:
            pref = str(preferred_username).strip()
            if pref:
                candidates.append(pref)
        for i in range(MAX_USERNAME_SUFFIX_TRIES + 1):
            suffix = "_" * i
            candidate = f"{base_username}{suffix}"
            if candidate not in candidates:
                candidates.append(candidate)

        for candidate in candidates:
            body = dict(request_payload)
            body["username"] = candidate
            body["status"] = self._status_for_create(desired_status)
            resp = self._request("POST", target, "/user", token, json_payload=body)
            if resp.status_code in (200, 201):
                if desired_status == "disabled":
                    disable = self._request(
                        "PUT",
                        target,
                        f"/user/{candidate}",
                        token,
                        json_payload={"status": "disabled"},
                    )
                    if disable.status_code != 200:
                        logger.warning(
                            "Created remote user %s but failed to disable (HTTP %s)",
                            candidate,
                            disable.status_code,
                        )
                return {
                    "status": "created",
                    "code": resp.status_code,
                    "remote_username": candidate,
                }
            if self._is_username_conflict(resp):
                continue
            return {
                "status": "error",
                "code": resp.status_code,
                "message": (resp.text or "")[:200],
            }

        return {
            "status": "error",
            "code": 409,
            "message": "Unable to allocate unique username",
        }

    def _update_remote_user(
        self,
        target: Dict,
        token: str,
        remote_username: str,
        payload: Dict,
        desired_status: str,
    ) -> Dict:
        full_update = self._build_update_payload(payload, desired_status, include_full=True)
        resp = self._request(
            "PUT",
            target,
            f"/user/{remote_username}",
            token,
            json_payload=full_update,
        )
        if resp.status_code == 200:
            return {"status": "updated", "code": 200, "remote_username": remote_username}
        if resp.status_code == 404:
            return {"status": "not_found", "code": 404, "remote_username": remote_username}
        if resp.status_code == 422:
            mini_update = self._build_update_payload(payload, desired_status, include_full=False)
            fallback = self._request(
                "PUT",
                target,
                f"/user/{remote_username}",
                token,
                json_payload=mini_update,
            )
            if fallback.status_code == 200:
                return {"status": "updated", "code": 200, "remote_username": remote_username}
            return {
                "status": "error",
                "code": fallback.status_code,
                "message": (fallback.text or "")[:200],
            }
        return {
            "status": "error",
            "code": resp.status_code,
            "message": (resp.text or "")[:200],
        }

    def _sync_user_to_target(
        self,
        target: Dict,
        payload: Dict,
        target_context: Optional[Dict] = None,
        mapping: Optional[Dict] = None,
    ) -> Dict:
        target_id = int(target.get("id") or 0)
        local_username = str(payload.get("username") or "").strip()
        if not local_username:
            return {"status": "error", "message": "Missing local username"}

        mapping = mapping or self._get_target_user_entry(target_id, local_username) or {}
        desired_status = str(payload.get("_desired_status") or payload.get("status") or "active").strip().lower()

        token = (target_context or {}).get("token")
        if not token:
            token = self._auth_token(target)
        supported_inbounds = (target_context or {}).get("supported_inbounds")
        if supported_inbounds is None:
            supported_inbounds = self._fetch_supported_inbounds(target, token)
        prepared = self._prepare_payload_for_target(payload, supported_inbounds or {})

        remote_username = str(mapping.get("remote_username") or "").strip()
        if remote_username:
            updated = self._update_remote_user(target, token, remote_username, prepared, desired_status)
            if updated.get("status") == "updated":
                remote_user = self._fetch_remote_user(target, token, remote_username)
                if remote_user:
                    self._set_target_user_entry(
                        target_id,
                        local_username,
                        {
                            "remote_username": remote_username,
                            "created_by_sync": True,
                            "last_sync_at": _utc_now_iso(),
                            **self._build_snapshot_from_remote(remote_user),
                        },
                    )
                return {
                    "status": "updated",
                    "code": updated.get("code"),
                    "remote_username": remote_username,
                }
            if updated.get("status") == "not_found":
                # Remote user was removed manually: recreate and remap.
                created = self._create_user_with_fallback(
                    target=target,
                    token=token,
                    payload=prepared,
                    desired_status=desired_status,
                    preferred_username=remote_username,
                )
                if created.get("status") != "created":
                    return created
                remote_username = str(created.get("remote_username"))
                remote_user = self._fetch_remote_user(target, token, remote_username)
                snapshot = self._build_snapshot_from_remote(remote_user or {})
                self._set_target_user_entry(
                    target_id,
                    local_username,
                    {
                        "remote_username": remote_username,
                        "created_by_sync": True,
                        "last_sync_at": _utc_now_iso(),
                        **snapshot,
                    },
                )
                return {
                    "status": "created",
                    "code": created.get("code"),
                    "remote_username": remote_username,
                }
            return updated

        # Mapping is empty: adopt existing same-name user if possible, otherwise create fallback.
        base_username = str(prepared.get("username") or "").strip()
        if base_username:
            adopted = self._update_remote_user(
                target=target,
                token=token,
                remote_username=base_username,
                payload=prepared,
                desired_status=desired_status,
            )
            if adopted.get("status") == "updated":
                remote_user = self._fetch_remote_user(target, token, base_username)
                snapshot = self._build_snapshot_from_remote(remote_user or {})
                self._set_target_user_entry(
                    target_id,
                    local_username,
                    {
                        "remote_username": base_username,
                        "created_by_sync": True,
                        "last_sync_at": _utc_now_iso(),
                        **snapshot,
                    },
                )
                return {
                    "status": "updated",
                    "code": adopted.get("code"),
                    "remote_username": base_username,
                }

        created = self._create_user_with_fallback(
            target=target,
            token=token,
            payload=prepared,
            desired_status=desired_status,
            preferred_username=None,
        )
        if created.get("status") != "created":
            return created

        remote_username = str(created.get("remote_username"))
        remote_user = self._fetch_remote_user(target, token, remote_username)
        snapshot = self._build_snapshot_from_remote(remote_user or {})
        self._set_target_user_entry(
            target_id,
            local_username,
            {
                "remote_username": remote_username,
                "created_by_sync": True,
                "last_sync_at": _utc_now_iso(),
                **snapshot,
            },
        )
        return {
            "status": "created",
            "code": created.get("code"),
            "remote_username": remote_username,
        }

    # public sync methods
    def sync_user_to_enabled_targets(self, payload: Dict) -> Dict:
        targets = [target for target in self.get_targets() if target.get("enabled")]
        results = []
        for target in targets:
            target_id = int(target.get("id") or 0)
            try:
                context = {
                    "token": self._auth_token(target),
                }
                context["supported_inbounds"] = self._fetch_supported_inbounds(target, context["token"])
                outcome = self._sync_user_to_target(target, payload, target_context=context)
                self._update_target_runtime_state(target_id, "ok", "Sync OK")
                results.append(
                    {
                        "target_id": target_id,
                        "target_url": target.get("url"),
                        **outcome,
                    }
                )
            except Exception as e:
                msg = str(e)
                self._update_target_runtime_state(target_id, "error", msg)
                results.append(
                    {
                        "target_id": target_id,
                        "target_url": target.get("url"),
                        "status": "error",
                        "message": msg,
                    }
                )
        return {
            "username": payload.get("username"),
            "enabled_targets": len(targets),
            "results": results,
        }

    def sync_users_to_enabled_targets(self, payloads: List[Dict]) -> Dict:
        summary = {
            "total_users": len(payloads),
            "created": 0,
            "updated": 0,
            "errors": 0,
            "results": [],
        }
        targets = [target for target in self.get_targets() if target.get("enabled")]
        contexts: Dict[int, Dict] = {}
        for target in targets:
            target_id = int(target.get("id") or 0)
            try:
                token = self._auth_token(target)
                contexts[target_id] = {
                    "token": token,
                    "supported_inbounds": self._fetch_supported_inbounds(target, token),
                }
                self._update_target_runtime_state(target_id, "ok", "Connected")
            except Exception as e:
                contexts[target_id] = {"error": str(e)}
                self._update_target_runtime_state(target_id, "error", str(e))

        for payload in payloads:
            local_username = str(payload.get("username") or "").strip()
            item = {
                "username": local_username,
                "enabled_targets": len(targets),
                "results": [],
            }
            for target in targets:
                target_id = int(target.get("id") or 0)
                context = contexts.get(target_id) or {}
                if context.get("error"):
                    summary["errors"] += 1
                    item["results"].append(
                        {
                            "target_id": target_id,
                            "target_url": target.get("url"),
                            "status": "error",
                            "message": context.get("error"),
                        }
                    )
                    continue
                try:
                    outcome = self._sync_user_to_target(target, payload, target_context=context)
                    status = outcome.get("status")
                    if status == "created":
                        summary["created"] += 1
                    elif status == "updated":
                        summary["updated"] += 1
                    else:
                        summary["errors"] += 1
                    item["results"].append(
                        {
                            "target_id": target_id,
                            "target_url": target.get("url"),
                            **outcome,
                        }
                    )
                except Exception as e:
                    summary["errors"] += 1
                    item["results"].append(
                        {
                            "target_id": target_id,
                            "target_url": target.get("url"),
                            "status": "error",
                            "message": str(e),
                        }
                    )
            summary["results"].append(item)
        return summary

    def sync_all_users_from_db(self, db: Session) -> Dict:
        dbusers = crud.get_users(db=db)
        payloads: List[Dict] = []
        local_usernames = set()
        for db_user in dbusers:
            try:
                serialized = UserResponse.model_validate(db_user).model_dump(mode="json")
                payload = build_user_clone_payload(serialized)
                username = str(payload.get("username") or "").strip()
                if username:
                    payloads.append(payload)
                    local_usernames.add(username)
            except Exception:
                logger.exception(
                    "Failed to serialize user %s for panel sync",
                    getattr(db_user, "username", ""),
                )

        summary = self.sync_users_to_enabled_targets(payloads)
        cleanup = self.cleanup_orphaned_mappings(db, local_usernames)
        summary["orphan_cleanup"] = cleanup
        return summary

    def cleanup_orphaned_mappings(self, db: Session, local_usernames: Optional[set] = None) -> Dict:
        if local_usernames is None:
            local_usernames = {str(u.username) for u in crud.get_users(db=db)}

        removed = 0
        errors = 0
        details = []

        targets = self.get_targets()
        for target in targets:
            target_id = int(target.get("id") or 0)
            users = self._iter_target_user_entries(target_id)
            if not users:
                continue
            if not (target.get("url") and target.get("username") and target.get("password")):
                continue
            try:
                token = self._auth_token(target)
            except Exception as e:
                details.append({"target_id": target_id, "status": "error", "message": str(e)})
                errors += len(users)
                continue

            for local_username, info in users:
                if local_username in local_usernames:
                    continue
                remote_username = str(info.get("remote_username") or "").strip()
                if not remote_username:
                    self._remove_target_user_entry(target_id, local_username)
                    continue
                try:
                    resp = self._request("DELETE", target, f"/user/{remote_username}", token)
                    if resp.status_code in (200, 404):
                        removed += 1
                        self._remove_target_user_entry(target_id, local_username)
                    else:
                        errors += 1
                        details.append(
                            {
                                "target_id": target_id,
                                "local_username": local_username,
                                "remote_username": remote_username,
                                "status": "error",
                                "message": f"HTTP {resp.status_code}",
                            }
                        )
                except Exception as e:
                    errors += 1
                    details.append(
                        {
                            "target_id": target_id,
                            "local_username": local_username,
                            "remote_username": remote_username,
                            "status": "error",
                            "message": str(e),
                        }
                    )
        return {"removed": removed, "errors": errors, "details": details[:30]}

    def delete_user_from_enabled_targets(self, local_username: str) -> Dict:
        targets = [target for target in self.get_targets() if target.get("enabled")]
        results = []
        for target in targets:
            target_id = int(target.get("id") or 0)
            mapping = self._get_target_user_entry(target_id, local_username)
            remote_username = str((mapping or {}).get("remote_username") or "").strip()
            if not remote_username:
                results.append(
                    {
                        "target_id": target_id,
                        "target_url": target.get("url"),
                        "status": "skipped",
                        "message": "No mapped remote username",
                    }
                )
                continue
            try:
                token = self._auth_token(target)
                resp = self._request("DELETE", target, f"/user/{remote_username}", token)
                if resp.status_code in (200, 404):
                    self._remove_target_user_entry(target_id, local_username)
                    results.append(
                        {
                            "target_id": target_id,
                            "target_url": target.get("url"),
                            "remote_username": remote_username,
                            "status": "deleted",
                            "code": resp.status_code,
                        }
                    )
                else:
                    results.append(
                        {
                            "target_id": target_id,
                            "target_url": target.get("url"),
                            "remote_username": remote_username,
                            "status": "error",
                            "code": resp.status_code,
                            "message": (resp.text or "")[:200],
                        }
                    )
            except Exception as e:
                results.append(
                    {
                        "target_id": target_id,
                        "target_url": target.get("url"),
                        "remote_username": remote_username,
                        "status": "error",
                        "message": str(e),
                    }
                )
        return {"username": local_username, "results": results}

    def reset_user_in_enabled_targets(self, local_username: str) -> Dict:
        targets = [target for target in self.get_targets() if target.get("enabled")]
        results = []
        for target in targets:
            target_id = int(target.get("id") or 0)
            mapping = self._get_target_user_entry(target_id, local_username)
            remote_username = str((mapping or {}).get("remote_username") or "").strip()
            if not remote_username:
                continue
            try:
                token = self._auth_token(target)
                resp = self._request("POST", target, f"/user/{remote_username}/reset", token)
                if resp.status_code == 200:
                    remote_user = self._fetch_remote_user(target, token, remote_username)
                    if remote_user:
                        self._set_target_user_entry(
                            target_id,
                            local_username,
                            {
                                "remote_username": remote_username,
                                "last_sync_at": _utc_now_iso(),
                                **self._build_snapshot_from_remote(remote_user),
                            },
                        )
                    results.append(
                        {
                            "target_id": target_id,
                            "target_url": target.get("url"),
                            "remote_username": remote_username,
                            "status": "reset",
                        }
                    )
                else:
                    results.append(
                        {
                            "target_id": target_id,
                            "target_url": target.get("url"),
                            "remote_username": remote_username,
                            "status": "error",
                            "code": resp.status_code,
                            "message": (resp.text or "")[:200],
                        }
                    )
            except Exception as e:
                results.append(
                    {
                        "target_id": target_id,
                        "target_url": target.get("url"),
                        "remote_username": remote_username,
                        "status": "error",
                        "message": str(e),
                    }
                )
        return {"username": local_username, "results": results}

    def revoke_user_in_enabled_targets(self, local_username: str) -> Dict:
        targets = [target for target in self.get_targets() if target.get("enabled")]
        results = []
        for target in targets:
            target_id = int(target.get("id") or 0)
            mapping = self._get_target_user_entry(target_id, local_username)
            remote_username = str((mapping or {}).get("remote_username") or "").strip()
            if not remote_username:
                continue
            try:
                token = self._auth_token(target)
                resp = self._request("POST", target, f"/user/{remote_username}/revoke_sub", token)
                if resp.status_code == 200:
                    results.append(
                        {
                            "target_id": target_id,
                            "target_url": target.get("url"),
                            "remote_username": remote_username,
                            "status": "revoked",
                        }
                    )
                else:
                    results.append(
                        {
                            "target_id": target_id,
                            "target_url": target.get("url"),
                            "remote_username": remote_username,
                            "status": "error",
                            "code": resp.status_code,
                            "message": (resp.text or "")[:200],
                        }
                    )
            except Exception as e:
                results.append(
                    {
                        "target_id": target_id,
                        "target_url": target.get("url"),
                        "remote_username": remote_username,
                        "status": "error",
                        "message": str(e),
                    }
                )
        return {"username": local_username, "results": results}

    def purge_target_users(self, target_id: int) -> Dict:
        targets = {int(item["id"]): item for item in self.get_targets()}
        target = targets.get(int(target_id))
        if not target:
            raise RuntimeError("Target not found")
        if not (target.get("url") and target.get("username") and target.get("password")):
            raise RuntimeError("Target credentials are required to purge users")

        mappings = self._iter_target_user_entries(target_id)
        if not mappings:
            return {"target_id": target_id, "total": 0, "deleted": 0, "errors": 0, "details": []}

        token = self._auth_token(target)
        deleted = 0
        errors = 0
        details = []
        for local_username, info in mappings:
            remote_username = str(info.get("remote_username") or "").strip()
            if not remote_username:
                self._remove_target_user_entry(target_id, local_username)
                continue
            try:
                resp = self._request("DELETE", target, f"/user/{remote_username}", token)
                if resp.status_code in (200, 404):
                    deleted += 1
                    self._remove_target_user_entry(target_id, local_username)
                    details.append(
                        {
                            "local_username": local_username,
                            "remote_username": remote_username,
                            "status": "deleted",
                            "code": resp.status_code,
                        }
                    )
                else:
                    errors += 1
                    details.append(
                        {
                            "local_username": local_username,
                            "remote_username": remote_username,
                            "status": "error",
                            "code": resp.status_code,
                            "message": (resp.text or "")[:200],
                        }
                    )
            except Exception as e:
                errors += 1
                details.append(
                    {
                        "local_username": local_username,
                        "remote_username": remote_username,
                        "status": "error",
                        "message": str(e),
                    }
                )

        return {
            "target_id": target_id,
            "total": len(mappings),
            "deleted": deleted,
            "errors": errors,
            "details": details[:50],
        }

    def sync_usage_from_targets(self, db: Session) -> Dict:
        targets = [target for target in self.get_targets() if target.get("enabled")]
        user_deltas: Dict[str, int] = {}
        touched_entries: List[Tuple[int, str, int]] = []
        errors = []

        for target in targets:
            target_id = int(target.get("id") or 0)
            entries = self._iter_target_user_entries(target_id)
            if not entries:
                continue
            try:
                token = self._auth_token(target)
                usage_map = self._fetch_remote_usage_map(target, token)
            except Exception as e:
                errors.append({"target_id": target_id, "message": str(e)})
                continue

            for local_username, info in entries:
                remote_username = str(info.get("remote_username") or "").strip()
                if not remote_username:
                    continue
                if remote_username not in usage_map:
                    continue
                remote_used = _safe_int(usage_map.get(remote_username), 0)
                usage_initialized = bool(info.get("usage_initialized", False))
                prev = _safe_int(info.get("last_remote_used_traffic"), 0)
                delta = 0
                if usage_initialized:
                    if remote_used >= prev:
                        delta = remote_used - prev
                touched_entries.append((target_id, local_username, remote_used))
                if delta > 0:
                    user_deltas[local_username] = user_deltas.get(local_username, 0) + delta

        # persist remote usage baselines in one state write
        sync_at = _utc_now_iso()
        self._bulk_merge_target_user_entries(
            [
                (
                    target_id,
                    local_username,
                    {
                        "last_remote_used_traffic": remote_used,
                        "usage_initialized": True,
                        "last_sync_at": sync_at,
                    },
                )
                for target_id, local_username, remote_used in touched_entries
            ]
        )

        if user_deltas:
            users = db.query(User).filter(User.username.in_(list(user_deltas.keys()))).all()
            admin_deltas: Dict[int, int] = {}
            for user in users:
                inc = _safe_int(user_deltas.get(user.username), 0)
                if inc <= 0:
                    continue
                user.used_traffic = _safe_int(user.used_traffic, 0) + inc
                if user.admin_id:
                    admin_deltas[user.admin_id] = admin_deltas.get(user.admin_id, 0) + inc
            if admin_deltas:
                admins = db.query(Admin).filter(Admin.id.in_(list(admin_deltas.keys()))).all()
                for admin in admins:
                    inc = _safe_int(admin_deltas.get(admin.id), 0)
                    if inc > 0:
                        admin.users_usage = _safe_int(admin.users_usage, 0) + inc
            db.commit()

        return {
            "targets": len(targets),
            "users_with_delta": len([k for k, v in user_deltas.items() if v > 0]),
            "total_delta": sum(user_deltas.values()) if user_deltas else 0,
            "errors": errors[:20],
        }


panel_sync_service = PanelSyncService()
