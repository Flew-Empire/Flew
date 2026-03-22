from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional, Tuple

import jwt

from config import INSTALL_DOWNLOAD_TOKEN_TTL_SECONDS
from app.utils.jwt import get_secret_key


def create_install_download_token(
    *,
    edition: str,
    filename: str,
    product: str = "xpert",
    ttl_seconds: Optional[int] = None,
) -> Tuple[str, datetime]:
    ttl = max(60, int(ttl_seconds or INSTALL_DOWNLOAD_TOKEN_TTL_SECONDS or 900))
    now = datetime.utcnow()
    exp = now + timedelta(seconds=ttl)
    payload = {
        "sub": "install_download",
        "product": product,
        "edition": edition,
        "filename": filename,
        "iat": now,
        "exp": exp,
    }
    token = jwt.encode(payload, get_secret_key(), algorithm="HS256")
    return token, exp


def verify_install_download_token(token: str) -> Optional[dict]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, get_secret_key(), algorithms=["HS256"])
    except jwt.exceptions.PyJWTError:
        return None
    if payload.get("sub") != "install_download":
        return None
    return payload
