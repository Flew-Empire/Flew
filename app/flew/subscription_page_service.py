from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List
from urllib.parse import urlsplit, urlunsplit

from app.utils.system import readable_size


def _append_client_type(url: str, client_type: str) -> str:
    parts = urlsplit(url)
    path = parts.path.rstrip("/")
    return urlunsplit(
        (parts.scheme, parts.netloc, f"{path}/{client_type}", parts.query, parts.fragment)
    )


def _safe_size(value: int | None) -> str:
    if not value:
        return "Unlimited"
    return readable_size(int(value))


def _status_variant(status_value: str) -> str:
    status_value = (status_value or "").strip().lower()
    if status_value == "active":
        return "active"
    if status_value == "limited":
        return "limited"
    if status_value in {"expired", "disabled"}:
        return "expired"
    return "inactive"


def _status_label(status_value: str) -> str:
    mapping = {
        "active": "Active",
        "limited": "Limited",
        "expired": "Expired",
        "disabled": "Disabled",
        "on_hold": "On hold",
    }
    return mapping.get((status_value or "").strip().lower(), "Unknown")


def _days_left(expire: int | None) -> int | None:
    if not expire:
        return None
    seconds_left = int(expire) - int(datetime.utcnow().timestamp())
    return max(0, seconds_left // 86400)


def _expire_label(expire: int | None) -> str:
    if not expire:
        return "Unlimited"
    return datetime.utcfromtimestamp(int(expire)).strftime("%Y-%m-%d %H:%M UTC")


def _client_links(base_url: str) -> Dict[str, str]:
    return {
        "auto": base_url,
        "v2ray": _append_client_type(base_url, "v2ray"),
        "v2ray_json": _append_client_type(base_url, "v2ray-json"),
        "clash_meta": _append_client_type(base_url, "clash-meta"),
        "clash": _append_client_type(base_url, "clash"),
        "sing_box": _append_client_type(base_url, "sing-box"),
        "outline": _append_client_type(base_url, "outline"),
    }


def _default_app_catalog() -> Dict[str, Dict[str, Any]]:
    return {
        "ios": {
            "label": "iPhone & iPad",
            "hint": "Best picks for Safari and iOS clients.",
            "apps": [
                {
                    "id": "happ",
                    "name": "Happ",
                    "tagline": "Best match for encrypted Happ links and advanced subscription metadata.",
                    "format": "happ_v5",
                    "launch_scheme": "happ://add/",
                    "launch_mode": "raw",
                    "install_url": "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
                    "guide_url": "https://www.happ.su/main/ru/faq/ios",
                },
                {
                    "id": "shadowrocket",
                    "name": "Shadowrocket",
                    "tagline": "Fast iOS client for plain subscription imports.",
                    "format": "auto",
                    "launch_scheme": "sub://",
                    "launch_mode": "base64",
                    "install_url": "https://apps.apple.com/us/app/shadowrocket/id932747118",
                },
                {
                    "id": "streisand",
                    "name": "Streisand",
                    "tagline": "Modern iOS client with clean import flow.",
                    "format": "auto",
                    "launch_scheme": "streisand://import/",
                    "launch_mode": "raw",
                    "install_url": "https://apps.apple.com/us/app/streisand/id6450534064",
                },
                {
                    "id": "outline-ios",
                    "name": "Outline",
                    "tagline": "Official Outline client for Shadowsocks-style access and quick installs.",
                    "format": "outline",
                    "launch_scheme": "ssconf://install-configuration?url=",
                    "launch_mode": "encoded",
                    "install_url": "https://apps.apple.com/us/app/outline-app/id1356178125",
                    "guide_url": "https://developers.google.com/outline/docs/download-links",
                },
            ],
        },
        "android": {
            "label": "Android",
            "hint": "Recommended Android clients for direct import.",
            "apps": [
                {
                    "id": "happ",
                    "name": "Happ",
                    "tagline": "Best match for encrypted Happ links and HWID-oriented flows.",
                    "format": "happ_v5",
                    "launch_scheme": "happ://add/",
                    "launch_mode": "raw",
                    "install_url": "https://play.google.com/store/apps/details?id=com.happproxy",
                    "guide_url": "https://www.happ.su/main/ru/faq/android",
                },
                {
                    "id": "v2rayng",
                    "name": "v2rayNG",
                    "tagline": "Classic Android client for V2Ray-style imports.",
                    "format": "v2ray",
                    "launch_scheme": "v2rayng://install-config?name=Flew&url=",
                    "launch_mode": "encoded",
                    "install_url": "https://github.com/2dust/v2rayNG/releases",
                },
                {
                    "id": "hiddify",
                    "name": "Hiddify",
                    "tagline": "Friendly mobile client with sing-box support.",
                    "format": "sing_box",
                    "launch_scheme": "hiddify://import/",
                    "launch_mode": "raw",
                    "install_url": "https://github.com/hiddify/hiddify-app/releases",
                },
                {
                    "id": "flclash",
                    "name": "FlClash",
                    "tagline": "Good option when you prefer Clash Meta profiles.",
                    "format": "clash_meta",
                    "launch_scheme": "clash://install-config?url=",
                    "launch_mode": "encoded",
                    "install_url": "https://github.com/chen08209/FlClash/releases",
                },
                {
                    "id": "outline-android",
                    "name": "Outline",
                    "tagline": "Official Outline client for Shadowsocks-based configurations.",
                    "format": "outline",
                    "launch_scheme": "ssconf://install-configuration?url=",
                    "launch_mode": "encoded",
                    "install_url": "https://play.google.com/store/apps/details?id=org.outline.android.client",
                    "guide_url": "https://developers.google.com/outline/docs/download-links",
                },
            ],
        },
        "windows": {
            "label": "Windows",
            "hint": "Desktop clients for import and everyday use.",
            "apps": [
                {
                    "id": "happ-desktop",
                    "name": "Happ Desktop",
                    "tagline": "Desktop experience for Happ-compatible encrypted links.",
                    "format": "auto",
                    "launch_scheme": "happ://add/",
                    "launch_mode": "page_url",
                    "install_url": "https://github.com/Happ-proxy/happ-desktop/releases",
                },
                {
                    "id": "v2rayn",
                    "name": "v2rayN",
                    "tagline": "Popular Windows client for direct subscription imports.",
                    "format": "v2ray",
                    "launch_scheme": "v2rayn://install-config?url=",
                    "launch_mode": "encoded",
                    "install_url": "https://github.com/2dust/v2rayN/releases",
                },
                {
                    "id": "hiddify-windows",
                    "name": "Hiddify",
                    "tagline": "Cross-platform desktop client with direct subscription import.",
                    "format": "sing_box",
                    "launch_scheme": "hiddify://import/",
                    "launch_mode": "raw",
                    "install_url": "https://github.com/hiddify/hiddify-app/releases",
                },
                {
                    "id": "clash-verge",
                    "name": "Clash Verge",
                    "tagline": "Desktop Clash Meta client for YAML subscriptions.",
                    "format": "clash_meta",
                    "launch_scheme": "clash://install-config?url=",
                    "launch_mode": "encoded",
                    "install_url": "https://github.com/clash-verge-rev/clash-verge-rev/releases",
                },
                {
                    "id": "outline-windows",
                    "name": "Outline",
                    "tagline": "Official Outline desktop client for quick Shadowsocks imports.",
                    "format": "outline",
                    "launch_scheme": "ssconf://install-configuration?url=",
                    "launch_mode": "encoded",
                    "install_url": "https://s3.amazonaws.com/outline-releases/client/windows/stable/Outline-Client.exe",
                    "guide_url": "https://developers.google.com/outline/docs/download-links",
                },
            ],
        },
        "macos": {
            "label": "macOS",
            "hint": "Mac-ready apps for both plain and encrypted links.",
            "apps": [
                {
                    "id": "happ-macos",
                    "name": "Happ",
                    "tagline": "Recommended when you want Happ link support on macOS.",
                    "format": "happ_v5",
                    "launch_scheme": "happ://add/",
                    "launch_mode": "raw",
                    "install_url": "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
                },
                {
                    "id": "streisand-macos",
                    "name": "Streisand",
                    "tagline": "Simple macOS client for subscription imports.",
                    "format": "auto",
                    "launch_scheme": "streisand://import/",
                    "launch_mode": "raw",
                    "install_url": "https://apps.apple.com/us/app/streisand/id6450534064",
                },
                {
                    "id": "clash-verge-macos",
                    "name": "Clash Verge",
                    "tagline": "Strong macOS choice for Clash Meta users.",
                    "format": "clash_meta",
                    "launch_scheme": "clash://install-config?url=",
                    "launch_mode": "encoded",
                    "install_url": "https://github.com/clash-verge-rev/clash-verge-rev/releases",
                },
                {
                    "id": "outline-macos",
                    "name": "Outline",
                    "tagline": "Official Outline client for macOS and Apple Silicon systems.",
                    "format": "outline",
                    "launch_scheme": "ssconf://install-configuration?url=",
                    "launch_mode": "encoded",
                    "install_url": "https://itunes.apple.com/us/app/outline-app/id1356178125",
                    "guide_url": "https://developers.google.com/outline/docs/download-links",
                },
            ],
        },
        "linux": {
            "label": "Linux",
            "hint": "Desktop clients for Debian, Ubuntu and similar systems.",
            "apps": [
                {
                    "id": "flclash-linux",
                    "name": "FlClash",
                    "tagline": "Clash Meta client for Linux desktops.",
                    "format": "clash_meta",
                    "launch_scheme": "clash://install-config?url=",
                    "launch_mode": "encoded",
                    "install_url": "https://github.com/chen08209/FlClash/releases",
                },
                {
                    "id": "hiddify-linux",
                    "name": "Hiddify",
                    "tagline": "Cross-platform sing-box based client.",
                    "format": "sing_box",
                    "launch_scheme": "hiddify://import/",
                    "launch_mode": "raw",
                    "install_url": "https://github.com/hiddify/hiddify-app/releases",
                },
                {
                    "id": "outline-linux",
                    "name": "Outline",
                    "tagline": "Official Outline desktop client for Debian-based Linux systems.",
                    "format": "outline",
                    "launch_scheme": "ssconf://install-configuration?url=",
                    "launch_mode": "encoded",
                    "install_url": "https://developers.google.com/outline/docs/download-links",
                    "guide_url": "https://support.google.com/outline/answer/15331527?hl=en",
                },
            ],
        },
        "android_tv": {
            "label": "Android TV",
            "hint": "TV-oriented clients and guides.",
            "apps": [
                {
                    "id": "happ-tv",
                    "name": "Happ",
                    "tagline": "Recommended TV client with step-by-step setup docs.",
                    "format": "happ_v5",
                    "launch_scheme": "happ://add/",
                    "launch_mode": "raw",
                    "install_url": "https://play.google.com/store/apps/details?id=com.happproxy",
                    "guide_url": "https://www.happ.su/main/ru/faq/android-tv",
                }
            ],
        },
        "apple_tv": {
            "label": "Apple TV",
            "hint": "Use Happ-compatible links for Apple TV setup.",
            "apps": [
                {
                    "id": "happ-apple-tv",
                    "name": "Happ TV",
                    "tagline": "Apple TV setup flow for encrypted Happ links.",
                    "format": "happ_v5",
                    "launch_scheme": "happ://add/",
                    "launch_mode": "raw",
                    "install_url": "https://apps.apple.com/us/app/happ-proxy-utility-for-tv/id6748297274",
                    "guide_url": "https://www.happ.su/main/ru/faq/android-tv",
                }
            ],
        },
    }


def build_subscription_page_payload(
    user: Any,
    *,
    profile_title: str,
    support_link: str,
    page_subscription_url: str,
    hidden_subscription_url: str,
    custom_remarks: List[str],
    announce_text: str,
    happ_v5_link: str,
    happ_v4_link: str,
    happ_v3_link: str,
    hide_settings: bool,
) -> Dict[str, Any]:
    status_value = getattr(getattr(user, "status", None), "value", getattr(user, "status", ""))
    client_links = _client_links(page_subscription_url)
    quick_links = [
        {"id": "auto", "label": "Auto", "url": client_links["auto"]},
        {"id": "v2ray", "label": "V2Ray", "url": client_links["v2ray"]},
        {"id": "clash_meta", "label": "Clash Meta", "url": client_links["clash_meta"]},
        {"id": "sing_box", "label": "Sing-box", "url": client_links["sing_box"]},
        {"id": "outline", "label": "Outline", "url": client_links["outline"]},
    ]
    if happ_v5_link:
        quick_links.insert(1, {"id": "happ_v5", "label": "Happ v5", "url": happ_v5_link})
    if happ_v4_link:
        quick_links.append({"id": "happ_v4", "label": "Happ v4", "url": happ_v4_link})
    if happ_v3_link:
        quick_links.append({"id": "happ_v3", "label": "Happ v3", "url": happ_v3_link})

    return {
        "branding": {
            "title": profile_title or "Flew",
            "subtitle": "Smart subscription page",
            "supportLink": support_link or "",
        },
        "user": {
            "username": getattr(user, "username", ""),
            "status": {
                "value": status_value,
                "label": _status_label(status_value),
                "variant": _status_variant(status_value),
            },
            "usedTraffic": readable_size(int(getattr(user, "used_traffic", 0) or 0)),
            "usedTrafficBytes": int(getattr(user, "used_traffic", 0) or 0),
            "lifetimeTraffic": readable_size(int(getattr(user, "lifetime_used_traffic", 0) or 0)),
            "trafficLimit": _safe_size(getattr(user, "data_limit", None)),
            "trafficLimitBytes": int(getattr(user, "data_limit", 0) or 0),
            "expiresAt": _expire_label(getattr(user, "expire", None)),
            "expiresUnix": int(getattr(user, "expire", 0) or 0),
            "daysLeft": _days_left(getattr(user, "expire", None)),
            "links": list(getattr(user, "links", []) or []),
            "remarks": list(custom_remarks or []),
            "announce": announce_text or "",
        },
        "subscription": {
            "pageUrl": page_subscription_url,
            "hiddenUrl": hidden_subscription_url,
            "clientLinks": client_links,
            "quickLinks": quick_links,
            "happ": {
                "v5": happ_v5_link or "",
                "v4": happ_v4_link or "",
                "v3": happ_v3_link or "",
            },
            "hideSettings": bool(hide_settings),
        },
        "catalog": _default_app_catalog(),
    }
