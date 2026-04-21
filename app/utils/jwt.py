import json
import time
import jwt
from base64 import b64decode, b64encode
from datetime import datetime, timedelta
from functools import lru_cache
from hashlib import sha256
from math import ceil
from typing import Union
from urllib.parse import urlparse

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from config import JWT_ACCESS_TOKEN_EXPIRE_MINUTES, XRAY_SUBSCRIPTION_PATH


@lru_cache(maxsize=None)
def get_secret_key():
    from app.db import GetDB, get_jwt_secret_key
    try:
        with GetDB() as db:
            return get_jwt_secret_key(db)
    except Exception as e:
        # Clear cache and retry once
        get_secret_key.cache_clear()
        try:
            with GetDB() as db:
                return get_jwt_secret_key(db)
        except Exception:
            # If still fails, raise the original error
            raise e


def create_admin_token(username: str, is_sudo=False) -> str:
    data = {"sub": username, "access": "sudo" if is_sudo else "admin", "iat": datetime.utcnow()}
    if JWT_ACCESS_TOKEN_EXPIRE_MINUTES > 0:
        expire = datetime.utcnow() + timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
        data["exp"] = expire
    encoded_jwt = jwt.encode(data, get_secret_key(), algorithm="HS256")
    return encoded_jwt


def get_admin_payload(token: str) -> Union[dict, None]:
    try:
        payload = jwt.decode(token, get_secret_key(), algorithms=["HS256"])
        username: str = payload.get("sub")
        access: str = payload.get("access")
        if not username or access not in ('admin', 'sudo'):
            return
        try:
            created_at = datetime.utcfromtimestamp(payload['iat'])
        except KeyError:
            created_at = None

        return {"username": username, "is_sudo": access == "sudo", "created_at": created_at}
    except jwt.exceptions.PyJWTError:
        return


def create_subscription_token(username: str) -> str:
    data = username + ',' + str(ceil(time.time()))
    data_b64_str = b64encode(data.encode('utf-8'), altchars=b'-_').decode('utf-8').rstrip('=')
    data_b64_sign = b64encode(
        sha256(
            (data_b64_str+get_secret_key()).encode('utf-8')
        ).digest(),
        altchars=b'-_'
    ).decode('utf-8')[:10]
    data_final = data_b64_str + data_b64_sign
    return data_final


@lru_cache(maxsize=1)
def _get_subscription_cipher():
    key = sha256((get_secret_key() + ":subscription-link").encode("utf-8")).digest()
    return AESGCM(key)


def _b64url_encode(data: bytes) -> str:
    return b64encode(data, altchars=b"-_").decode("utf-8").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    return b64decode(
        data.encode("utf-8") + b"=" * (-len(data.encode("utf-8")) % 4),
        altchars=b"-_",
        validate=True,
    )


def create_subscription_opaque_token(username: str) -> str:
    payload = json.dumps(
        {"sub": username, "iat": int(time.time())},
        separators=(",", ":"),
    ).encode("utf-8")
    nonce = os.urandom(12)
    encrypted = _get_subscription_cipher().encrypt(nonce, payload, b"flew-sub")
    compact = _b64url_encode(nonce + encrypted)
    split_at = 10 if len(compact) > 24 else max(6, len(compact) // 2)
    return f"{compact[:split_at]}/{compact[split_at:]}"


def create_stable_subscription_opaque_token(username: str, issued_at: int) -> str:
    safe_username = str(username or "").strip()
    safe_issued_at = max(1, int(issued_at or 1))
    payload = json.dumps(
        {"sub": safe_username, "iat": safe_issued_at},
        separators=(",", ":"),
    ).encode("utf-8")
    nonce = sha256(
        f"{get_secret_key()}:subscription-stable:{safe_username}".encode("utf-8")
    ).digest()[:12]
    encrypted = _get_subscription_cipher().encrypt(nonce, payload, b"flew-sub")
    compact = _b64url_encode(nonce + encrypted)
    split_at = 10 if len(compact) > 24 else max(6, len(compact) // 2)
    return f"{compact[:split_at]}/{compact[split_at:]}"


def _get_opaque_subscription_payload(token: str) -> Union[dict, None]:
    try:
        compact = "".join(part.strip() for part in str(token or "").split("/") if part.strip())
        if len(compact) < 24:
            return
        raw = _b64url_decode(compact)
        if len(raw) <= 12:
            return
        nonce, encrypted = raw[:12], raw[12:]
        payload_raw = _get_subscription_cipher().decrypt(nonce, encrypted, b"flew-sub")
        payload = json.loads(payload_raw.decode("utf-8"))
        username = payload.get("sub")
        issued_at = int(payload.get("iat"))
        if not username or issued_at <= 0:
            return
        return {"username": username, "created_at": datetime.utcfromtimestamp(issued_at)}
    except Exception:
        return


def extract_subscription_token_from_url(url: str) -> Union[str, None]:
    try:
        parsed = urlparse((url or "").strip())
        parts = [part for part in parsed.path.split("/") if part]
        if not parts:
            return

        suffixes = {"info", "usage", "sing-box", "clash-meta", "clash", "outline", "v2ray", "v2ray-json"}
        for idx, part in enumerate(parts):
            if part != XRAY_SUBSCRIPTION_PATH:
                continue

            tail = parts[idx + 1 :]
            if not tail:
                return
            if len(tail) >= 2 and tail[1] not in suffixes:
                return f"{tail[0]}/{tail[1]}"
            return tail[0]
    except Exception:
        return
    return


def get_subscription_payload_from_url(url: str) -> Union[dict, None]:
    token = extract_subscription_token_from_url(url)
    if not token:
        return
    return get_subscription_payload(token)


def get_subscription_payload(token: str) -> Union[dict, None]:
    try:
        if "/" in (token or ""):
            payload = _get_opaque_subscription_payload(token)
            if payload:
                return payload

        if len(token) < 15:
            return

        if token.startswith("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."):
            payload = jwt.decode(token, get_secret_key(), algorithms=["HS256"])
            if payload.get("access") == "subscription":
                return {"username": payload['sub'], "created_at": datetime.utcfromtimestamp(payload['iat'])}
            else:
                return
        else:
            u_token = token[:-10]
            u_signature = token[-10:]
            try:
                u_token_dec = b64decode(
                    (u_token.encode('utf-8') + b'=' * (-len(u_token.encode('utf-8')) % 4)),
                    altchars=b'-_', validate=True)
                u_token_dec_str = u_token_dec.decode('utf-8')
            except:
                return
            u_token_resign = b64encode(sha256((u_token+get_secret_key()).encode('utf-8')
                                              ).digest(), altchars=b'-_').decode('utf-8')[:10]
            if u_signature == u_token_resign:
                u_username = u_token_dec_str.split(',')[0]
                u_created_at = int(u_token_dec_str.split(',')[1])
                return {"username": u_username, "created_at": datetime.utcfromtimestamp(u_created_at)}
            else:
                return
    except jwt.exceptions.PyJWTError:
        return
