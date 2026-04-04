from __future__ import annotations

from typing import Iterable, Set

from config import FLEW_EDITION, FLEW_FEATURES, XPANEL_ENABLED
from app.utils.edition_names import normalize_edition_name, valid_edition_names


_FEATURES_BY_EDITION = {
    "free": {
        "admin_accounts",
        "admin_manager",
        "happ_crypto",
        "subscription_settings",
        "traffic_stats",
        "online_stats",
        "cpu_stats",
        "admin_filter",
        "captcha",
    },
    "start": {
        "admin_accounts",
        "admin_limits",
        "happ_crypto",
        "subscription_settings",
        "ip_limits",
        "traffic_stats",
        "online_stats",
        "cpu_stats",
        "admin_filter",
    },
    "pro": {
        "admin_accounts",
        "admin_limits",
        "happ_crypto",
        "subscription_settings",
        "ip_limits",
        "traffic_stats",
        "online_stats",
        "cpu_stats",
        "admin_filter",
        "admin_manager",
        "v2box_id",
    },
    "x": {
        "admin_accounts",
        "admin_limits",
        "happ_crypto",
        "subscription_settings",
        "ip_limits",
        "traffic_stats",
        "online_stats",
        "cpu_stats",
        "admin_filter",
        "admin_manager",
        "v2box_id",
        "device_limit",
        "captcha",
    },
}


def _normalize(values: Iterable[str]) -> Set[str]:
    return {v.strip().lower() for v in values if str(v).strip()}


def _edition_features(edition: str) -> Set[str]:
    normalized = normalize_edition_name(edition)
    if normalized in valid_edition_names():
        return set(_FEATURES_BY_EDITION[normalized])
    return set(_FEATURES_BY_EDITION["free"])


def enabled_features() -> Set[str]:
    if FLEW_FEATURES:
        features = _normalize(FLEW_FEATURES)
    else:
        features = _edition_features(FLEW_EDITION)

    if XPANEL_ENABLED:
        features.add("xpanel")
    return features


def feature_enabled(name: str) -> bool:
    if not name:
        return False
    return name.strip().lower() in enabled_features()
