from __future__ import annotations

from typing import Iterable, Set

from config import XPERT_EDITION, XPERT_FEATURES, XPANEL_ENABLED


_FEATURES_BY_EDITION = {
    "standard": {
        "admin_limits",
        "happ_crypto",
        "ip_limits",
        "traffic_stats",
        "online_stats",
        "cpu_stats",
        "admin_filter",
    },
    "full": {
        "admin_limits",
        "happ_crypto",
        "ip_limits",
        "traffic_stats",
        "online_stats",
        "cpu_stats",
        "admin_filter",
        "admin_manager",
        "v2box_id",
    },
    "custom": {
        "admin_limits",
        "happ_crypto",
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
    normalized = (edition or "").strip().lower()
    if normalized in _FEATURES_BY_EDITION:
        return set(_FEATURES_BY_EDITION[normalized])
    return set(_FEATURES_BY_EDITION["custom"])


def enabled_features() -> Set[str]:
    if XPERT_FEATURES:
        features = _normalize(XPERT_FEATURES)
    else:
        features = _edition_features(XPERT_EDITION)

    if XPANEL_ENABLED:
        features.add("xpanel")
    return features


def feature_enabled(name: str) -> bool:
    if not name:
        return False
    return name.strip().lower() in enabled_features()
