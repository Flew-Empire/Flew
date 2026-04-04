import re
import json
import base64
from distutils.version import LooseVersion
from typing import Dict, Tuple
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Request, Response
from fastapi.responses import HTMLResponse

from app.db import Session, crud, get_db
from app.dependencies import get_validated_sub, get_validated_sub_opaque, validate_dates
from app.models.user import SubscriptionUserResponse, UserResponse
from app.subscription.share import encode_title, generate_subscription
from app.flew.hwid_lock_service import check_and_register_hwid_for_username, has_hwid_protection
from app.flew.ip_limit_service import check_and_register_ip_for_username, get_client_ip
from app.flew.v2box_hwid_service import (
    check_and_register_v2box_for_username,
    get_required_v2box_device_id_for_username,
    has_v2box_protection,
)
from app.flew.device_limit_service import check_and_register_device_for_username
from app.flew.happ_crypto_service import create_happ_crypto_link
from app.flew.subscription_settings_service import (
    get_custom_remarks_for_user,
    get_subscription_settings,
    render_subscription_value,
)
from app.flew.subscription_page_service import build_subscription_page_payload
from app.templates import render_template
from app import logger
from app.utils.features import feature_enabled
from config import (
    SUB_PROFILE_TITLE,
    SUB_SUPPORT_URL,
    SUB_UPDATE_INTERVAL,
    SUBSCRIPTION_PAGE_TEMPLATE,
    USE_CUSTOM_JSON_DEFAULT,
    USE_CUSTOM_JSON_FOR_HAPP,
    USE_CUSTOM_JSON_FOR_STREISAND,
    USE_CUSTOM_JSON_FOR_V2RAYN,
    USE_CUSTOM_JSON_FOR_V2RAYNG,
    XRAY_SUBSCRIPTION_PATH,
)

client_config = {
    "clash-meta": {"config_format": "clash-meta", "media_type": "text/yaml", "as_base64": False, "reverse": False},
    "sing-box": {"config_format": "sing-box", "media_type": "application/json", "as_base64": False, "reverse": False},
    "clash": {"config_format": "clash", "media_type": "text/yaml", "as_base64": False, "reverse": False},
    "v2ray": {"config_format": "v2ray", "media_type": "text/plain", "as_base64": True, "reverse": False},
    "outline": {"config_format": "outline", "media_type": "application/json", "as_base64": False, "reverse": False},
    "v2ray-json": {"config_format": "v2ray-json", "media_type": "application/json", "as_base64": False,
                   "reverse": False}
}

router = APIRouter(tags=['Subscription'], prefix=f'/{XRAY_SUBSCRIPTION_PATH}')


def encode_announce(text: str) -> str:
    return "base64:" + base64.b64encode(text.encode("utf-8")).decode("ascii")


def _is_happ_user_agent(user_agent: str) -> bool:
    return re.match(r"^Happ/", user_agent or "") is not None


def _strip_client_type_suffix(url: str) -> str:
    parts = urlsplit(url)
    path = parts.path.rstrip("/")
    for client_type in client_config.keys():
        suffix = f"/{client_type}"
        if path.endswith(suffix):
            path = path[: -len(suffix)]
            break
    return urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))


def _subscription_page_url(request: Request) -> str:
    return _strip_client_type_suffix(str(request.url))


def _preferred_subscription_url(request: Request, client_type: str | None = None) -> str:
    current = str(request.url)
    if client_type and current.rstrip("/").endswith(f"/{client_type}"):
        return current
    base = _subscription_page_url(request).rstrip("/")
    if client_type:
        return f"{base}/{client_type}"
    return base


def _with_hide_settings(url: str) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["hide-settings"] = "true"
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query, doseq=True), parts.fragment)
    )


def _wants_subscription_page(request: Request, user_agent: str) -> bool:
    accept_header = (request.headers.get("accept") or "").lower()
    if "text/html" in accept_header:
        return True
    if (request.headers.get("sec-fetch-dest") or "").lower() == "document":
        return True
    if (request.headers.get("sec-fetch-mode") or "").lower() == "navigate":
        return True
    if (request.headers.get("upgrade-insecure-requests") or "").strip() == "1":
        return True
    # Do not rely on User-Agent alone here: some desktop/mobile clients reuse
    # browser-like UA strings, which breaks subscription import/update by
    # returning the interactive HTML page instead of raw config data.
    return False


def _build_subscription_headers(
    request: Request,
    user: UserResponse,
    user_agent: str,
    settings: Dict,
    subscription_url: str,
) -> Dict[str, str]:
    support_url = render_subscription_value(
        settings.get("support_link") or SUB_SUPPORT_URL,
        user,
        settings,
        subscription_url,
    )
    profile_title = render_subscription_value(
        settings.get("profile_title") or SUB_PROFILE_TITLE,
        user,
        settings,
        subscription_url,
    )
    response_headers: Dict[str, str] = {
        "content-disposition": f'attachment; filename="{user.username}"',
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        "pragma": "no-cache",
        "expires": "0",
        "support-url": support_url,
        "profile-title": encode_title(profile_title),
        "profile-update-interval": str(
            settings.get("profile_update_interval") or SUB_UPDATE_INTERVAL
        ),
        "subscription-userinfo": "; ".join(
            f"{key}={val}" for key, val in get_subscription_user_info(user).items()
        ),
    }

    if user.expire:
        response_headers["sub-expire"] = "1"
        response_headers["notification-subs-expire"] = "1"
        if support_url:
            response_headers["sub-expire-button-link"] = support_url

    if settings.get("is_profile_web_page_url_enabled", True):
        response_headers["profile-web-page-url"] = _subscription_page_url(request)

    remarks = get_custom_remarks_for_user(
        user,
        settings,
        is_empty_hosts=not bool(user.links),
        subscription_url=subscription_url,
    )
    announce_text = render_subscription_value(
        settings.get("happ_announce") or "",
        user,
        settings,
        subscription_url,
    )
    announce_parts = []
    if remarks and _is_happ_user_agent(user_agent):
        announce_parts.extend(remarks)
    if announce_text:
        announce_parts.append(announce_text)
    if announce_parts:
        response_headers["announce"] = encode_announce("\n".join(announce_parts))

    if _is_happ_user_agent(user_agent):
        response_headers["profile-title"] = profile_title
        response_headers.pop("profile-web-page-url", None)
        routing_value = render_subscription_value(
            settings.get("happ_routing") or "",
            user,
            settings,
            subscription_url,
        )
        if routing_value:
            response_headers["routing"] = routing_value

    for key, value in (settings.get("custom_response_headers") or {}).items():
        header_name = str(key).strip()
        if not header_name:
            continue
        response_headers[header_name] = render_subscription_value(
            str(value),
            user,
            settings,
            subscription_url,
        )

    return response_headers


def get_subscription_user_info(user: UserResponse) -> dict:
    """Retrieve user subscription information including upload, download, total data, and expiry."""
    return {
        "upload": 0,
        "download": user.used_traffic,
        "total": user.data_limit if user.data_limit is not None else 0,
        "expire": user.expire if user.expire is not None else 0,
    }


def _flag_enabled(v: str) -> bool:
    return (v or "").strip().lower() in ("1", "true", "yes", "on")


def _extract_happ_device_id(request: Request, x_hwid: str, allow_query: bool = True) -> Tuple[str, str]:
    raw_hwid = (x_hwid or "").strip()
    if raw_hwid:
        return raw_hwid, "header:x-hwid"

    headers = {k.lower(): v for k, v in request.headers.items()}
    for key in ("x-device-id", "x-install-id", "x-app-instance-id"):
        val = (headers.get(key) or "").strip()
        if val:
            return val, f"header:{key}"

    if allow_query:
        for key in ("device_id", "hwid", "happ_hwid"):
            val = (request.query_params.get(key) or "").strip()
            if val:
                return val, f"query:{key}"

    return "", "-"


def _log_happ_hwid_debug(user: UserResponse, device_id: str, source: str, request: Request) -> None:
    try:
        from hashlib import sha256
        sig = sha256(device_id.encode("utf-8", "ignore")).hexdigest()[:8] if device_id else "-"
        logger.info(
            f"HAPP_HWID_DEBUG user={user.username} dev_len={len(device_id)} src={source} sig={sig}"
        )
        if device_id:
            return
        hdrs = {k.lower(): request.headers.get(k, "") for k in request.headers.keys()}
        x_names = sorted([k for k in hdrs.keys() if k.startswith("x-")])
        picked_keys = [
            "x-device-os",
            "x-ver-os",
            "x-device-model",
            "x-device-id",
            "x-install-id",
            "x-app-instance-id",
        ]
        picked = {k: (hdrs.get(k, "")[:80]) for k in picked_keys if hdrs.get(k)}
        logger.info(f"HAPP_HEADERS_DEBUG user={user.username} x_names={x_names} picked={picked}")
    except Exception:
        pass


def _enforce_hwid_lock(user: UserResponse, device_id: str, user_agent: str, request: Request) -> None:
    if not feature_enabled("happ_crypto"):
        return
    mode_enabled = _flag_enabled(request.query_params.get("flew_hwid"))
    protected = has_hwid_protection(user.username)
    # Nothing to enforce for regular users without HWID protection.
    if not mode_enabled and not protected:
        return

    # Protected subscription is served only to Happ clients.
    if not re.match(r"^Happ/", user_agent or ""):
        raise HTTPException(status_code=404, detail="Not Found")

    if not check_and_register_hwid_for_username(user.username, device_id):
        raise HTTPException(status_code=404, detail="Not Found")




def _enforce_v2box_id_policy(user: UserResponse, request: Request, user_agent: str) -> None:
    if not feature_enabled("v2box_id"):
        return
    ua = (user_agent or "").lower()
    protected = has_v2box_protection(user.username)

    # If protection is enabled, only allow V2Box clients.
    if protected and "v2box" not in ua:
        logger.warning(f"V2BOX_BLOCK user={user.username} reason=ua_not_v2box ua={user_agent}")
        raise HTTPException(status_code=404, detail="Not Found")

    # Auto-bind on first V2Box request when no device is set yet.
    if "v2box" in ua:
        headers = {k.lower(): v for k, v in request.headers.items()}
        if not check_and_register_v2box_for_username(user.username, headers, dict(request.query_params)):
            logger.warning(f"V2BOX_BLOCK user={user.username} reason=device_id_mismatch_or_missing")
            raise HTTPException(status_code=404, detail="Not Found")


def _get_v2box_device_id_for_response(user: UserResponse, user_agent: str) -> str | None:
    if not feature_enabled("v2box_id"):
        return None
    if "v2box" not in (user_agent or "").lower():
        return None
    return get_required_v2box_device_id_for_username(user.username) or None


def _enforce_device_limit(user: UserResponse, request: Request, user_agent: str) -> None:
    if not feature_enabled("device_limit"):
        return
    ua = (user_agent or "").lower()
    # Skip link-preview/bot agents to avoid consuming a device slot.
    for marker in (
        "whatsapp",
        "facebookexternalhit",
        "facebot",
        "twitterbot",
        "telegrambot",
        "discordbot",
        "slackbot",
        "skypeuripreview",
        "linkedinbot",
    ):
        if marker in ua:
            return
    # Skip landing-page views to avoid treating browser opens as device activations.
    accept = (request.headers.get("accept") or "").lower()
    if "text/html" in accept:
        return

    headers = {k.lower(): v for k, v in request.headers.items()}
    ip = get_client_ip(request)
    allowed, device = check_and_register_device_for_username(
        username=user.username,
        headers=headers,
        user_agent=user_agent,
        ip=ip,
        query_params=dict(request.query_params),
    )
    if not allowed:
        logger.warning(
            "DEVICE_LIMIT_BLOCK user=%s fingerprint=%s ua=%s",
            user.username,
            (device or {}).get("fingerprint", "-"),
            user_agent or "-",
        )
        raise HTTPException(status_code=404, detail="Not Found")


def _enforce_unique_ip_limit(user: UserResponse, request: Request, user_agent: str) -> None:
    if not feature_enabled("ip_limits"):
        return
    # Apply only for non-Happ clients (Happ uses HWID logic).
    if re.match(r"^Happ/", user_agent or ""):
        return
    ip = get_client_ip(request)
    if not check_and_register_ip_for_username(user.username, ip):
        raise HTTPException(status_code=404, detail="Not Found")


def _serve_subscription_response(
    request: Request,
    db: Session,
    dbuser: UserResponse,
    user_agent: str,
    x_hwid: str,
    current_subscription_url: str,
    client_type: str | None = None,
):
    user: UserResponse = UserResponse.model_validate(dbuser)

    happ_device_id = ""
    if re.match(r"^Happ/", user_agent):
        require_header = False
        if feature_enabled("happ_crypto"):
            require_header = _flag_enabled(request.query_params.get("flew_hwid")) or has_hwid_protection(user.username)
        happ_device_id, source = _extract_happ_device_id(request, x_hwid, allow_query=not require_header)
        _log_happ_hwid_debug(user, happ_device_id, source, request)

    _enforce_hwid_lock(user, happ_device_id, user_agent, request)
    _enforce_v2box_id_policy(user, request, user_agent)
    _enforce_device_limit(user, request, user_agent)
    _enforce_unique_ip_limit(user, request, user_agent)
    v2box_device_id = _get_v2box_device_id_for_response(user, user_agent)
    settings = get_subscription_settings()

    if _wants_subscription_page(request, user_agent):
        page_subscription_url = _subscription_page_url(request)
        hidden_subscription_url = _with_hide_settings(page_subscription_url)
        custom_remarks = get_custom_remarks_for_user(
            user,
            settings,
            is_empty_hosts=not bool(user.links),
            subscription_url=page_subscription_url,
        )
        page_payload = build_subscription_page_payload(
            user,
            profile_title=render_subscription_value(
                settings.get("profile_title") or SUB_PROFILE_TITLE,
                user,
                settings,
                page_subscription_url,
            ),
            support_link=render_subscription_value(
                settings.get("support_link") or SUB_SUPPORT_URL,
                user,
                settings,
                page_subscription_url,
            ),
            page_subscription_url=page_subscription_url,
            hidden_subscription_url=hidden_subscription_url,
            custom_remarks=custom_remarks,
            announce_text=render_subscription_value(
                settings.get("happ_announce") or "",
                user,
                settings,
                page_subscription_url,
            ),
            happ_v5_link=create_happ_crypto_link(hidden_subscription_url, "v5", True),
            happ_v4_link=create_happ_crypto_link(hidden_subscription_url, "v4", True),
            happ_v3_link=create_happ_crypto_link(hidden_subscription_url, "v3", True),
            hide_settings=_flag_enabled(request.query_params.get("hide-settings")),
        )
        return HTMLResponse(
            render_template(
                SUBSCRIPTION_PAGE_TEMPLATE,
                {
                    "page_payload_b64": base64.b64encode(
                        json.dumps(page_payload, ensure_ascii=False).encode("utf-8")
                    ).decode("ascii"),
                    "meta_title": page_payload["branding"]["title"],
                    "meta_description": f'{page_payload["branding"]["title"]} subscription page for {user.username}',
                },
            ),
            headers={
                "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
                "pragma": "no-cache",
                "expires": "0",
            },
        )

    crud.update_user_sub(db, dbuser, user_agent)
    response_headers = _build_subscription_headers(
        request,
        user,
        user_agent,
        settings,
        current_subscription_url,
    )

    if client_type is not None:
        config = client_config.get(client_type)
        conf = generate_subscription(
            user=user,
            config_format=config["config_format"],
            as_base64=config["as_base64"],
            reverse=config["reverse"],
            v2box_device_id=v2box_device_id,
        )
        return Response(content=conf, media_type=config["media_type"], headers=response_headers)

    if re.match(r'^([Cc]lash-verge|[Cc]lash[-\.]?[Mm]eta|[Ff][Ll][Cc]lash|[Mm]ihomo)', user_agent):
        conf = generate_subscription(
            user=user,
            config_format="clash-meta",
            as_base64=False,
            reverse=False,
            v2box_device_id=v2box_device_id,
        )
        return Response(content=conf, media_type="text/yaml", headers=response_headers)

    elif re.match(r'^([Cc]lash|[Ss]tash)', user_agent):
        conf = generate_subscription(
            user=user,
            config_format="clash",
            as_base64=False,
            reverse=False,
            v2box_device_id=v2box_device_id,
        )
        return Response(content=conf, media_type="text/yaml", headers=response_headers)

    elif re.match(r'^(SFA|SFI|SFM|SFT|[Kk]aring|[Hh]iddify(?:[Nn]ext)?)', user_agent):
        conf = generate_subscription(
            user=user,
            config_format="sing-box",
            as_base64=False,
            reverse=False,
            v2box_device_id=v2box_device_id,
        )
        return Response(content=conf, media_type="application/json", headers=response_headers)

    elif re.match(r'^(SS|SSR|SSD|SSS|Outline|Shadowsocks|SSconf)', user_agent):
        conf = generate_subscription(
            user=user,
            config_format="outline",
            as_base64=False,
            reverse=False,
            v2box_device_id=v2box_device_id,
        )
        return Response(content=conf, media_type="application/json", headers=response_headers)

    elif (USE_CUSTOM_JSON_DEFAULT or USE_CUSTOM_JSON_FOR_V2RAYN) and re.match(r'^v2rayN/(\d+\.\d+)', user_agent):
        version_str = re.match(r'^v2rayN/(\d+\.\d+)', user_agent).group(1)
        if LooseVersion(version_str) >= LooseVersion("6.40"):
            conf = generate_subscription(
                user=user,
                config_format="v2ray-json",
                as_base64=False,
                reverse=False,
                v2box_device_id=v2box_device_id,
            )
            return Response(content=conf, media_type="application/json", headers=response_headers)
        else:
            conf = generate_subscription(
                user=user,
                config_format="v2ray",
                as_base64=True,
                reverse=False,
                v2box_device_id=v2box_device_id,
            )
            return Response(content=conf, media_type="text/plain", headers=response_headers)

    elif (USE_CUSTOM_JSON_DEFAULT or USE_CUSTOM_JSON_FOR_V2RAYNG) and re.match(r'^v2rayNG/(\d+\.\d+\.\d+)', user_agent):
        version_str = re.match(r'^v2rayNG/(\d+\.\d+\.\d+)', user_agent).group(1)
        if LooseVersion(version_str) >= LooseVersion("1.8.29"):
            conf = generate_subscription(
                user=user,
                config_format="v2ray-json",
                as_base64=False,
                reverse=False,
                v2box_device_id=v2box_device_id,
            )
            return Response(content=conf, media_type="application/json", headers=response_headers)
        elif LooseVersion(version_str) >= LooseVersion("1.8.18"):
            conf = generate_subscription(
                user=user,
                config_format="v2ray-json",
                as_base64=False,
                reverse=True,
                v2box_device_id=v2box_device_id,
            )
            return Response(content=conf, media_type="application/json", headers=response_headers)
        else:
            conf = generate_subscription(
                user=user,
                config_format="v2ray",
                as_base64=True,
                reverse=False,
                v2box_device_id=v2box_device_id,
            )
            return Response(content=conf, media_type="text/plain", headers=response_headers)

    elif re.match(r'^[Ss]treisand', user_agent):
        if USE_CUSTOM_JSON_DEFAULT or USE_CUSTOM_JSON_FOR_STREISAND:
            conf = generate_subscription(
                user=user,
                config_format="v2ray-json",
                as_base64=False,
                reverse=False,
                v2box_device_id=v2box_device_id,
            )
            return Response(content=conf, media_type="application/json", headers=response_headers)
        else:
            conf = generate_subscription(
                user=user,
                config_format="v2ray",
                as_base64=True,
                reverse=False,
                v2box_device_id=v2box_device_id,
            )
            return Response(content=conf, media_type="text/plain", headers=response_headers)

    elif (USE_CUSTOM_JSON_DEFAULT or USE_CUSTOM_JSON_FOR_HAPP or settings.get("serve_json_for_happ")) and re.match(r'^Happ/(\d+\.\d+\.\d+)', user_agent):
        version_str = re.match(r'^Happ/(\d+\.\d+\.\d+)', user_agent).group(1)
        if LooseVersion(version_str) >= LooseVersion("1.63.1"):
            conf = generate_subscription(
                user=user,
                config_format="v2ray-json",
                as_base64=False,
                reverse=False,
                v2box_device_id=v2box_device_id,
            )
            return Response(content=conf, media_type="application/json", headers=response_headers)
        else:
            conf = generate_subscription(
                user=user,
                config_format="v2ray",
                as_base64=True,
                reverse=False,
                v2box_device_id=v2box_device_id,
            )
            return Response(content=conf, media_type="text/plain", headers=response_headers)

    conf = generate_subscription(
        user=user,
        config_format="v2ray",
        as_base64=True,
        reverse=False,
        v2box_device_id=v2box_device_id,
    )
    return Response(content=conf, media_type="text/plain", headers=response_headers)


@router.get("/{token}/")
@router.get("/{token}", include_in_schema=False)
def user_subscription(
    request: Request,
    token: str = Path(...),
    db: Session = Depends(get_db),
    dbuser: UserResponse = Depends(get_validated_sub),
    user_agent: str = Header(default=""),
    x_hwid: str = Header(default="", alias="x-hwid"),
):
    """Provides a subscription link based on the user agent (Clash, V2Ray, etc.)."""
    return _serve_subscription_response(
        request=request,
        db=db,
        dbuser=dbuser,
        user_agent=user_agent,
        x_hwid=x_hwid,
        current_subscription_url=_preferred_subscription_url(request),
    )


@router.get("/{token}/info", response_model=SubscriptionUserResponse)
def user_subscription_info(
    dbuser: UserResponse = Depends(get_validated_sub),
):
    """Retrieves detailed information about the user's subscription."""
    return dbuser


@router.get("/{token}/usage")
def user_get_usage(
    dbuser: UserResponse = Depends(get_validated_sub),
    start: str = "",
    end: str = "",
    db: Session = Depends(get_db)
):
    """Fetches the usage statistics for the user within a specified date range."""
    start, end = validate_dates(start, end)

    usages = crud.get_user_usages(db, dbuser, start, end)

    return {"usages": usages, "username": dbuser.username}


@router.get("/{opaque_a}/{opaque_b}/info", response_model=SubscriptionUserResponse, include_in_schema=False)
def user_subscription_info_opaque(
    dbuser: UserResponse = Depends(get_validated_sub_opaque),
):
    return dbuser


@router.get("/{opaque_a}/{opaque_b}/usage", include_in_schema=False)
def user_get_usage_opaque(
    dbuser: UserResponse = Depends(get_validated_sub_opaque),
    start: str = "",
    end: str = "",
    db: Session = Depends(get_db)
):
    start, end = validate_dates(start, end)
    usages = crud.get_user_usages(db, dbuser, start, end)
    return {"usages": usages, "username": dbuser.username}


@router.get("/{opaque_a}/{opaque_b}/{client_type}", include_in_schema=False)
def user_subscription_with_client_type_opaque(
    request: Request,
    opaque_a: str = Path(...),
    opaque_b: str = Path(...),
    dbuser: UserResponse = Depends(get_validated_sub_opaque),
    client_type: str = Path(..., regex="sing-box|clash-meta|clash|outline|v2ray|v2ray-json"),
    db: Session = Depends(get_db),
    user_agent: str = Header(default=""),
    x_hwid: str = Header(default="", alias="x-hwid"),
):
    return _serve_subscription_response(
        request=request,
        db=db,
        dbuser=dbuser,
        user_agent=user_agent,
        x_hwid=x_hwid,
        current_subscription_url=_preferred_subscription_url(request, client_type),
        client_type=client_type,
    )


@router.get("/{opaque_a}/{opaque_b}/", include_in_schema=False)
@router.get("/{opaque_a}/{opaque_b}", include_in_schema=False)
def user_subscription_opaque(
    request: Request,
    opaque_a: str = Path(...),
    opaque_b: str = Path(...),
    db: Session = Depends(get_db),
    dbuser: UserResponse = Depends(get_validated_sub_opaque),
    user_agent: str = Header(default=""),
    x_hwid: str = Header(default="", alias="x-hwid"),
):
    return _serve_subscription_response(
        request=request,
        db=db,
        dbuser=dbuser,
        user_agent=user_agent,
        x_hwid=x_hwid,
        current_subscription_url=_preferred_subscription_url(request),
    )


@router.get("/{token}/{client_type}")
def user_subscription_with_client_type(
    request: Request,
    token: str = Path(...),
    dbuser: UserResponse = Depends(get_validated_sub),
    client_type: str = Path(..., regex="sing-box|clash-meta|clash|outline|v2ray|v2ray-json"),
    db: Session = Depends(get_db),
    user_agent: str = Header(default=""),
    x_hwid: str = Header(default="", alias="x-hwid"),
):
    """Provides a subscription link based on the specified client type (e.g., Clash, V2Ray)."""
    return _serve_subscription_response(
        request=request,
        db=db,
        dbuser=dbuser,
        user_agent=user_agent,
        x_hwid=x_hwid,
        current_subscription_url=_preferred_subscription_url(request, client_type),
        client_type=client_type,
    )
