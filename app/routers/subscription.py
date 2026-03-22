import re
import base64
from distutils.version import LooseVersion
from typing import Tuple

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Request, Response
from fastapi.responses import HTMLResponse

from app.db import Session, crud, get_db
from app.dependencies import get_validated_sub, validate_dates
from app.models.user import SubscriptionUserResponse, UserResponse
from app.subscription.share import encode_title, generate_subscription
from app.xpert.hwid_lock_service import check_and_register_hwid_for_username, has_hwid_protection
from app.xpert.ip_limit_service import check_and_register_ip_for_username, get_client_ip
from app.xpert.v2box_hwid_service import (
    check_and_register_v2box_for_username,
    get_required_v2box_device_id_for_username,
    has_v2box_protection,
)
from app.xpert.device_limit_service import check_and_register_device_for_username
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


SUB_ANNOUNCE_TEXT = """Обновляйте подписку перед каждым подключением 🔄

Her bir birikdirmeden öň podpiskany täzeläň 🔄"""


def encode_announce(text: str) -> str:
    return "base64:" + base64.b64encode(text.encode("utf-8")).decode("ascii")


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
    mode_enabled = _flag_enabled(request.query_params.get("xpert_hwid"))
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
    user: UserResponse = UserResponse.model_validate(dbuser)

    happ_device_id = ""
    # HAPP_HWID_DEBUG: log derived Happ device id (x-hwid/x-device-id/x-install-id/etc).
    if re.match(r"^Happ/", user_agent):
        require_header = False
        if feature_enabled("happ_crypto"):
            require_header = _flag_enabled(request.query_params.get("xpert_hwid")) or has_hwid_protection(user.username)
        happ_device_id, source = _extract_happ_device_id(request, x_hwid, allow_query=not require_header)
        _log_happ_hwid_debug(user, happ_device_id, source, request)

    _enforce_hwid_lock(user, happ_device_id, user_agent, request)
    _enforce_v2box_id_policy(user, request, user_agent)
    _enforce_device_limit(user, request, user_agent)
    _enforce_unique_ip_limit(user, request, user_agent)
    v2box_device_id = _get_v2box_device_id_for_response(user, user_agent)
    v2box_device_id = _get_v2box_device_id_for_response(user, user_agent)

    accept_header = request.headers.get("Accept", "")
    if "text/html" in accept_header:
        return HTMLResponse(
            render_template(
                SUBSCRIPTION_PAGE_TEMPLATE,
                {"user": user}
            )
        )

    crud.update_user_sub(db, dbuser, user_agent)
    response_headers = {
        "content-disposition": f'attachment; filename="{user.username}"',
        "profile-web-page-url": str(request.url),
        "support-url": SUB_SUPPORT_URL,
        "profile-title": encode_title(SUB_PROFILE_TITLE),
        "profile-update-interval": SUB_UPDATE_INTERVAL,
        "announce": encode_announce(SUB_ANNOUNCE_TEXT),
        "subscription-userinfo": "; ".join(
            f"{key}={val}"
            for key, val in get_subscription_user_info(user).items()
        )
    }

    if re.match(r'^Happ/', user_agent):
        response_headers.pop("subscription-userinfo", None)
        response_headers.pop("profile-web-page-url", None)
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

    elif re.match(r'^(SFA|SFI|SFM|SFT|[Kk]aring|[Hh]iddify[Nn]ext)', user_agent):
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

    elif (USE_CUSTOM_JSON_DEFAULT or USE_CUSTOM_JSON_FOR_HAPP) and re.match(r'^Happ/(\d+\.\d+\.\d+)', user_agent):
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



    else:
        conf = generate_subscription(
            user=user,
            config_format="v2ray",
            as_base64=True,
            reverse=False,
            v2box_device_id=v2box_device_id,
        )
        return Response(content=conf, media_type="text/plain", headers=response_headers)


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
    user: UserResponse = UserResponse.model_validate(dbuser)

    happ_device_id = ""
    # HAPP_HWID_DEBUG: log derived Happ device id (x-hwid/x-device-id/x-install-id/etc).
    if re.match(r"^Happ/", user_agent):
        require_header = False
        if feature_enabled("happ_crypto"):
            require_header = _flag_enabled(request.query_params.get("xpert_hwid")) or has_hwid_protection(user.username)
        happ_device_id, source = _extract_happ_device_id(request, x_hwid, allow_query=not require_header)
        _log_happ_hwid_debug(user, happ_device_id, source, request)

    _enforce_hwid_lock(user, happ_device_id, user_agent, request)
    _enforce_v2box_id_policy(user, request, user_agent)
    _enforce_device_limit(user, request, user_agent)
    _enforce_unique_ip_limit(user, request, user_agent)
    
    v2box_device_id = _get_v2box_device_id_for_response(user, user_agent)

    # Track subscription fetch for explicit client_type endpoints too (/sub/<token>/v2ray).
    crud.update_user_sub(db, dbuser, user_agent)

    response_headers = {
        "content-disposition": f'attachment; filename="{user.username}"',
        "profile-web-page-url": str(request.url),
        "support-url": SUB_SUPPORT_URL,
        "profile-title": encode_title(SUB_PROFILE_TITLE),
        "profile-update-interval": SUB_UPDATE_INTERVAL,
        "announce": encode_announce(SUB_ANNOUNCE_TEXT),
        "subscription-userinfo": "; ".join(
            f"{key}={val}"
            for key, val in get_subscription_user_info(user).items()
        )
    }

    if re.match(r'^Happ/', user_agent):
        response_headers.pop("subscription-userinfo", None)
        response_headers.pop("profile-web-page-url", None)
    config = client_config.get(client_type)
    conf = generate_subscription(
        user=user,
        config_format=config["config_format"],
        as_base64=config["as_base64"],
        reverse=config["reverse"],
        v2box_device_id=v2box_device_id,
    )

    return Response(content=conf, media_type=config["media_type"], headers=response_headers)
