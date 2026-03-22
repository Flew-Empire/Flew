from typing import Optional, Tuple
import ipaddress
import os

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse

from app.db import Session, get_db, crud
from app.models.install_otp import (
    InstallDownloadTokenRequest,
    InstallDownloadTokenResponse,
    InstallOtpVerifyRequest,
    InstallOtpVerifyResponse,
)
from app.utils.install_tokens import (
    create_install_download_token,
    verify_install_download_token,
)
from config import (
    INSTALL_CLIENT_SCRIPT,
    INSTALL_DOWNLOAD_TOKEN_TTL_SECONDS,
    INSTALL_MARZBAN_PATCH_FILENAME,
    INSTALL_MARZBAN_PATCH_SCRIPT,
    INSTALL_RELEASES_DIR,
)

router = APIRouter(tags=["Install"], prefix="/api/install")

_ALLOWED_EDITIONS = {"standard", "full", "custom"}
_ALLOWED_PRODUCTS = {"xpert", "marzban_patch"}


def _normalize_edition(value: str) -> str:
    return (value or "").strip().lower()


def _normalize_product(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _strip_port(value: str) -> str:
    if not value:
        return value
    if value.count(":") == 1 and "." in value:
        return value.split(":", 1)[0]
    return value


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return _strip_port(forwarded_for.split(",")[0].strip())
    if request.client:
        return _strip_port(request.client.host)
    return ""


def _ip_allowed(bound_ip: Optional[str], client_ip: str) -> bool:
    if not bound_ip:
        return True
    if not client_ip:
        return False
    try:
        client = ipaddress.ip_address(client_ip)
    except ValueError:
        return False
    parts = [p.strip() for p in str(bound_ip).split(",") if p.strip()]
    for part in parts:
        try:
            if "/" in part:
                if client in ipaddress.ip_network(part, strict=False):
                    return True
            else:
                if client == ipaddress.ip_address(part):
                    return True
        except ValueError:
            continue
    return False


def _resolve_releases_dir() -> str:
    base = INSTALL_RELEASES_DIR or "releases"
    if os.path.isabs(base):
        return base
    return os.path.abspath(os.path.join(os.getcwd(), base))


def _get_release_path(edition: str) -> Tuple[str, str]:
    normalized = _normalize_edition(edition)
    if normalized not in _ALLOWED_EDITIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid edition")
    filename = f"xpert-{normalized}.tar.gz"
    path = os.path.join(_resolve_releases_dir(), filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")
    return path, filename


def _get_marzban_patch_path(edition: str) -> Tuple[str, str]:
    raw = (INSTALL_MARZBAN_PATCH_FILENAME or "marzban-patch-{edition}.tar.gz").strip()
    if "{edition}" in raw:
        normalized = _normalize_edition(edition)
        if not normalized or normalized not in _ALLOWED_EDITIONS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid edition")
        filename = raw.format(edition=normalized)
    else:
        filename = raw
    if not filename:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Patch filename not configured")
    path = os.path.join(_resolve_releases_dir(), filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patch release not found")
    return path, filename


def _get_install_script_path() -> Tuple[str, str]:
    base = INSTALL_CLIENT_SCRIPT or "scripts/install_client.sh"
    if os.path.isabs(base):
        path = base
    else:
        path = os.path.abspath(os.path.join(os.getcwd(), base))

    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Install script not found")
    return path, os.path.basename(path)


def _get_marzban_install_script_path() -> Tuple[str, str]:
    base = INSTALL_MARZBAN_PATCH_SCRIPT or "scripts/install_marzban_patch.sh"
    if os.path.isabs(base):
        path = base
    else:
        path = os.path.abspath(os.path.join(os.getcwd(), base))

    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Install script not found")
    return path, os.path.basename(path)


def _build_verify_response(status: str, item) -> InstallOtpVerifyResponse:
    return InstallOtpVerifyResponse(
        valid=status == "ok",
        status=status,
        otp_id=getattr(item, "id", None) if item else None,
        expires_at=getattr(item, "expires_at", None) if item else None,
        used_at=getattr(item, "used_at", None) if item else None,
    )


@router.post("/otp/verify", response_model=InstallOtpVerifyResponse)
def verify_install_otp(
    payload: InstallOtpVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    status, item = crud.verify_install_otp(db, payload.code, consume=False)
    if status == "ok":
        bound_ip = getattr(item, "bound_ip", None) if item else None
        if bound_ip and not _ip_allowed(bound_ip, _get_client_ip(request)):
            status = "ip_mismatch"
    return _build_verify_response(status, item)


@router.post("/otp/exchange", response_model=InstallDownloadTokenResponse)
def exchange_install_otp(
    payload: InstallDownloadTokenRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    status_value, item = crud.verify_install_otp(db, payload.code, consume=False)
    if status_value != "ok":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"status": status_value},
        )

    bound_ip = getattr(item, "bound_ip", None) if item else None
    if bound_ip and not _ip_allowed(bound_ip, _get_client_ip(request)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"status": "ip_mismatch"},
        )

    otp_product = _normalize_product(getattr(item, "product", None)) or "xpert"
    if otp_product not in _ALLOWED_PRODUCTS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"status": "product_missing"},
        )
    if payload.product:
        requested_product = _normalize_product(payload.product)
        if requested_product and requested_product != otp_product:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"status": "product_mismatch"},
            )
    if otp_product != "xpert":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"status": "product_mismatch"},
        )

    otp_edition = _normalize_edition(getattr(item, "edition", "") if item else "")
    if not otp_edition or otp_edition not in _ALLOWED_EDITIONS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"status": "edition_missing"},
        )

    if payload.edition:
        requested = _normalize_edition(payload.edition)
        if requested and requested != otp_edition:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"status": "edition_mismatch"},
            )

    status_value, item = crud.verify_install_otp(db, payload.code, consume=True)
    if status_value != "ok":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"status": status_value},
        )

    _, filename = _get_release_path(otp_edition)
    token, expires_at = create_install_download_token(
        edition=otp_edition,
        product=otp_product,
        filename=filename,
        ttl_seconds=INSTALL_DOWNLOAD_TOKEN_TTL_SECONDS,
    )
    return InstallDownloadTokenResponse(
        token=token,
        expires_at=expires_at,
        product=otp_product,
        edition=otp_edition,
        filename=filename,
        download_path=f"/api/install/download?token={token}",
    )


@router.post("/marzban/otp/exchange", response_model=InstallDownloadTokenResponse)
def exchange_marzban_patch_otp(
    payload: InstallDownloadTokenRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    status_value, item = crud.verify_install_otp(db, payload.code, consume=False)
    if status_value != "ok":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"status": status_value},
        )

    bound_ip = getattr(item, "bound_ip", None) if item else None
    if bound_ip and not _ip_allowed(bound_ip, _get_client_ip(request)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"status": "ip_mismatch"},
        )

    otp_product = _normalize_product(getattr(item, "product", None)) or "xpert"
    if otp_product not in _ALLOWED_PRODUCTS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"status": "product_missing"},
        )
    if payload.product:
        requested_product = _normalize_product(payload.product)
        if requested_product and requested_product != otp_product:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"status": "product_mismatch"},
            )
    if otp_product != "marzban_patch":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"status": "product_mismatch"},
        )

    status_value, item = crud.verify_install_otp(db, payload.code, consume=True)
    if status_value != "ok":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"status": status_value},
        )

    otp_edition = _normalize_edition(getattr(item, "edition", "") if item else "")
    if not otp_edition or otp_edition not in _ALLOWED_EDITIONS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"status": "edition_missing"},
        )

    if payload.edition:
        requested = _normalize_edition(payload.edition)
        if requested and requested != otp_edition:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"status": "edition_mismatch"},
            )

    _, filename = _get_marzban_patch_path(otp_edition)
    token, expires_at = create_install_download_token(
        edition=otp_edition,
        product=otp_product,
        filename=filename,
        ttl_seconds=INSTALL_DOWNLOAD_TOKEN_TTL_SECONDS,
    )
    return InstallDownloadTokenResponse(
        token=token,
        expires_at=expires_at,
        product=otp_product,
        edition=otp_edition,
        filename=filename,
        download_path=f"/api/install/marzban/download?token={token}",
    )


@router.get("/download")
def download_release(
    token: str = Query(...),
):
    payload = verify_install_download_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token")

    product = _normalize_product(payload.get("product")) or "xpert"
    if product != "xpert":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token")

    edition = payload.get("edition") or ""
    filename = payload.get("filename") or ""
    path, resolved_name = _get_release_path(edition)
    if filename and filename != resolved_name:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token")

    return FileResponse(
        path,
        media_type="application/gzip",
        filename=resolved_name,
    )


@router.get("/marzban/download")
def download_marzban_patch(
    token: str = Query(...),
):
    payload = verify_install_download_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token")

    product = _normalize_product(payload.get("product")) or "xpert"
    if product != "marzban_patch":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token")

    filename = payload.get("filename") or ""
    edition = payload.get("edition") or ""
    path, resolved_name = _get_marzban_patch_path(edition)
    if filename and filename != resolved_name:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token")

    return FileResponse(
        path,
        media_type="application/gzip",
        filename=resolved_name,
    )


@router.get("/script")
def download_install_script():
    path, filename = _get_install_script_path()
    return FileResponse(
        path,
        media_type="text/x-shellscript",
        filename=filename,
    )


@router.get("/marzban/script")
def download_marzban_install_script():
    path, filename = _get_marzban_install_script_path()
    return FileResponse(
        path,
        media_type="text/x-shellscript",
        filename=filename,
    )
