from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError

from app import logger, xray
from app.db import Session, crud, get_db
from app.dependencies import get_admin_by_username, validate_admin
from app.models.admin import Admin, AdminCreate, AdminModify, Token
from app.models.install_otp import InstallOtpCreate, InstallOtpResponse
from app.utils import report, responses
from app.utils.jwt import create_admin_token
from app.xpert.panel_sync_service import panel_sync_service
from config import LOGIN_NOTIFY_WHITE_LIST
from app.utils.login_security import (
    captcha_configured,
    get_captcha_public_config,
    login_attempts,
    verify_captcha,
)

router = APIRouter(tags=["Admin"], prefix="/api", responses={401: responses._401})


def get_client_ip(request: Request) -> str:
    """Extract the client's IP address from the request headers or client."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "Unknown"


async def _get_captcha_token(request: Request) -> str:
    try:
        form = await request.form()
        return str(form.get("captcha_token") or "")
    except Exception:
        return ""


def _raise_login_error(detail: str, username: str, client_ip: str) -> None:
    payload = {"detail": detail}
    if captcha_configured() and login_attempts.is_captcha_required(username, client_ip):
        payload.update(get_captcha_public_config())
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=payload,
        headers={"WWW-Authenticate": "Bearer"},
    )


@router.post("/admin/token", response_model=Token)
async def admin_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Authenticate an admin and issue a token."""
    client_ip = get_client_ip(request)
    username = form_data.username or ""

    if captcha_configured() and login_attempts.is_captcha_required(username, client_ip):
        captcha_token = await _get_captcha_token(request)
        if not verify_captcha(captcha_token, client_ip):
            login_attempts.record_failure(username, client_ip)
            payload = {"detail": "Captcha required"}
            payload.update(get_captcha_public_config())
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=payload)

    dbadmin = validate_admin(db, username, form_data.password)
    if not dbadmin:
        report.login(username, form_data.password, client_ip, False)
        login_attempts.record_failure(username, client_ip)
        _raise_login_error("Incorrect username or password", username, client_ip)

    login_attempts.record_success(username, client_ip)

    if client_ip not in LOGIN_NOTIFY_WHITE_LIST:
        report.login(username, "🔒", client_ip, True)

    return Token(access_token=create_admin_token(username, dbadmin.is_sudo))


@router.get(
    "/admin/install-otp",
    response_model=List[InstallOtpResponse],
    responses={403: responses._403},
)
def list_install_otps(
    limit: Optional[int] = None,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """List recent installation OTPs."""
    return crud.list_install_otps(db, limit=limit or 25)


@router.post(
    "/admin/install-otp",
    response_model=InstallOtpResponse,
    responses={403: responses._403},
)
def create_install_otp(
    payload: InstallOtpCreate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Generate a one-time OTP for installations."""
    item = crud.create_install_otp(
        db=db,
        admin=admin,
        expires_in_minutes=payload.expires_in_minutes or 30,
        product=payload.product,
        edition=payload.edition,
        bound_ip=payload.bound_ip,
        note=payload.note,
    )
    try:
        crud.create_admin_action_log(
            db=db,
            admin=admin,
            action="license.install_otp_create",
            target_type="system",
            target_username=None,
            meta={
                "otp_id": item.id,
                "expires_at": item.expires_at.isoformat(),
                "product": getattr(item, "product", None),
                "edition": getattr(item, "edition", None),
                "bound_ip": getattr(item, "bound_ip", None),
            },
        )
    except Exception as e:
        logger.debug(f"Failed to create audit log for install_otp_create: {e}")
    return item


@router.delete(
    "/admin/install-otp/{otp_id}",
    response_model=InstallOtpResponse,
    responses={403: responses._403, 404: responses._404},
)
def delete_install_otp(
    otp_id: int,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Delete an installation OTP by id."""
    item = crud.delete_install_otp(db, otp_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OTP not found")
    try:
        crud.create_admin_action_log(
            db=db,
            admin=admin,
            action="license.install_otp_delete",
            target_type="system",
            target_username=None,
            meta={"otp_id": otp_id},
        )
    except Exception as e:
        logger.debug(f"Failed to create audit log for install_otp_delete: {e}")
    return item


@router.post(
    "/admin",
    response_model=Admin,
    responses={403: responses._403, 409: responses._409},
)
def create_admin(
    new_admin: AdminCreate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Create a new admin if the current admin has sudo privileges."""
    try:
        dbadmin = crud.create_admin(db, new_admin)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Admin already exists")

    return dbadmin


@router.put(
    "/admin/{username}",
    response_model=Admin,
    responses={403: responses._403},
)
def modify_admin(
    modified_admin: AdminModify,
    dbadmin: Admin = Depends(get_admin_by_username),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Modify an existing admin's details."""
    if (dbadmin.username != current_admin.username) and dbadmin.is_sudo:
        raise HTTPException(
            status_code=403,
            detail="You're not allowed to edit another sudoer's account. Use xpert-cli instead.",
        )

    old_traffic_limit = dbadmin.traffic_limit
    old_users_limit = dbadmin.users_limit
    fields_set = getattr(modified_admin, "model_fields_set", None) or getattr(modified_admin, "__fields_set__", set())

    updated_admin = crud.update_admin(db, dbadmin, modified_admin)

    # Audit logs for Admin Manager: track admin limit changes.
    try:
        actor = crud.get_admin(db, current_admin.username)

        if "traffic_limit" in fields_set and modified_admin.traffic_limit is not None and old_traffic_limit != updated_admin.traffic_limit:
            new_bytes = int(updated_admin.traffic_limit) if updated_admin.traffic_limit is not None else None
            crud.create_admin_action_log(
                db=db,
                admin=actor,
                action="admin.traffic_limit_set",
                target_type="admin",
                target_username=updated_admin.username,
                meta={
                    "old": old_traffic_limit,
                    "new": new_bytes,
                    "new_gb": round(new_bytes / (1024**3), 3) if new_bytes is not None else None,
                },
            )

        if "users_limit" in fields_set and modified_admin.users_limit is not None and old_users_limit != updated_admin.users_limit:
            crud.create_admin_action_log(
                db=db,
                admin=actor,
                action="admin.users_limit_set",
                target_type="admin",
                target_username=updated_admin.username,
                meta={
                    "old": old_users_limit,
                    "new": int(updated_admin.users_limit) if updated_admin.users_limit is not None else None,
                },
            )
    except Exception as e:
        logger.debug(f"Failed to create audit log for admin modify: {e}")

    return updated_admin


@router.delete(
    "/admin/{username}",
    responses={403: responses._403},
)
def remove_admin(
    dbadmin: Admin = Depends(get_admin_by_username),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Remove an admin from the database."""
    if dbadmin.is_sudo:
        raise HTTPException(
            status_code=403,
            detail="You're not allowed to delete sudo accounts. Use xpert-cli instead.",
        )

    crud.remove_admin(db, dbadmin)
    return {"detail": "Admin removed successfully"}


@router.get("/admin", response_model=Admin)
def get_current_admin(admin: Admin = Depends(Admin.get_current)):
    """Retrieve the current authenticated admin."""
    return admin


@router.get(
    "/admins",
    response_model=List[Admin],
    responses={403: responses._403},
)
def get_admins(
    offset: Optional[int] = None,
    limit: Optional[int] = None,
    username: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Fetch a list of admins with optional filters for pagination and username."""
    return crud.get_admins(db, offset, limit, username)


@router.post("/admin/{username}/users/disable", responses={403: responses._403, 404: responses._404})
def disable_all_active_users(
    dbadmin: Admin = Depends(get_admin_by_username),
    db: Session = Depends(get_db), admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Disable all active users under a specific admin"""
    crud.disable_all_active_users(db=db, admin=dbadmin)
    startup_config = xray.config.include_db_users()
    xray.core.restart(startup_config)
    for node_id, node in list(xray.nodes.items()):
        if node.connected:
            xray.operations.restart_node(node_id, startup_config)
    try:
        panel_sync_service.sync_all_users_from_db(db)
    except Exception as e:
        logger.warning(f"Panel sync failed after disabling users: {e}")
    return {"detail": "Users successfully disabled"}


@router.post("/admin/{username}/users/activate", responses={403: responses._403, 404: responses._404})
def activate_all_disabled_users(
    dbadmin: Admin = Depends(get_admin_by_username),
    db: Session = Depends(get_db), admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Activate all disabled users under a specific admin"""
    crud.activate_all_disabled_users(db=db, admin=dbadmin)
    startup_config = xray.config.include_db_users()
    xray.core.restart(startup_config)
    for node_id, node in list(xray.nodes.items()):
        if node.connected:
            xray.operations.restart_node(node_id, startup_config)
    try:
        panel_sync_service.sync_all_users_from_db(db)
    except Exception as e:
        logger.warning(f"Panel sync failed after activating users: {e}")
    return {"detail": "Users successfully activated"}


@router.post(
    "/admin/usage/reset/{username}",
    response_model=Admin,
    responses={403: responses._403},
)
def reset_admin_usage(
    dbadmin: Admin = Depends(get_admin_by_username),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Resets usage of admin including external traffic."""
    # Сброс стандартного трафика Xpert
    result = crud.reset_admin_usage(db, dbadmin)
    
    # Сброс внешнего трафика через Xpert
    try:
        from config import XPERT_TRAFFIC_TRACKING_ENABLED
        if XPERT_TRAFFIC_TRACKING_ENABLED:
            from app.xpert.traffic_service import traffic_service
            external_result = traffic_service.reset_admin_external_traffic(dbadmin.username)
            logger.info(f"External traffic reset for {dbadmin.username}: {external_result}")
    except Exception as e:
        logger.error(f"Failed to reset external traffic: {e}")
    
    return result


@router.get(
    "/admin/usage/{username}",
    response_model=int,
    responses={403: responses._403},
)
def get_admin_usage(
    dbadmin: Admin = Depends(get_admin_by_username),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Retrieve the usage of given admin including external traffic."""
    # Базовое использование Xpert
    xpert_usage = dbadmin.users_usage or 0
    
    # Внешний трафик через Xpert
    external_usage = 0
    try:
        from config import XPERT_TRAFFIC_TRACKING_ENABLED
        if XPERT_TRAFFIC_TRACKING_ENABLED:
            from app.xpert.traffic_service import traffic_service
            external_stats = traffic_service.get_admin_traffic_usage(dbadmin.username)
            # Конвертируем ГБ в байты (стандарт Xpert)
            external_usage = int(external_stats.get("external_traffic_gb", 0) * 1024**3)
            logger.info(f"External traffic for {dbadmin.username}: {external_stats}")
    except Exception as e:
        logger.error(f"Failed to get external traffic: {e}")
    
    # Общее использование = Xpert + внешний трафик
    total_usage = xpert_usage + external_usage
    
    return total_usage


@router.get(
    "/admin/usage/{username}/detailed",
    responses={403: responses._403},
)
def get_admin_usage_detailed(
    dbadmin: Admin = Depends(get_admin_by_username),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Retrieve detailed usage including external traffic breakdown."""
    # Базовое использование Xpert
    xpert_usage = dbadmin.users_usage or 0
    
    # Внешний трафик через Xpert
    external_stats = {}
    limit_check = {}
    try:
        from config import XPERT_TRAFFIC_TRACKING_ENABLED
        if XPERT_TRAFFIC_TRACKING_ENABLED:
            from app.xpert.traffic_service import traffic_service
            external_stats = traffic_service.get_admin_traffic_usage(dbadmin.username)
            
            # Проверка лимита трафика
            if dbadmin.traffic_limit:
                limit_check = traffic_service.check_admin_traffic_limit(
                    dbadmin.username, dbadmin.traffic_limit
                )
    except Exception as e:
        logger.error(f"Failed to get external traffic: {e}")
    
    return {
        "username": dbadmin.username,
        "xpert_usage_bytes": xpert_usage,
        "xpert_usage_gb": round(xpert_usage / (1024**3), 3) if xpert_usage else 0,
        "external_traffic": external_stats,
        "total_usage_bytes": xpert_usage + int(external_stats.get("external_traffic_gb", 0) * 1024**3),
        "traffic_limit_bytes": dbadmin.traffic_limit,
        "traffic_limit_gb": round(dbadmin.traffic_limit / (1024**3), 3) if dbadmin.traffic_limit else None,
        "limit_check": limit_check.get("within_limit", True) if limit_check else None,
        "percentage_used": limit_check.get("percentage_used", 0) if limit_check else None
    }


@router.post(
    "/admin/external-traffic/reset/{username}",
    response_model=dict,
    responses={403: responses._403},
)
def reset_external_traffic_only(
    dbadmin: Admin = Depends(get_admin_by_username),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Reset only external traffic (Xpert) for admin."""
    try:
        from config import XPERT_TRAFFIC_TRACKING_ENABLED
        if not XPERT_TRAFFIC_TRACKING_ENABLED:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="External traffic tracking is disabled"
            )
        
        from app.xpert.traffic_service import traffic_service
        result = traffic_service.reset_admin_external_traffic(dbadmin.username)
        logger.info(f"External traffic reset for {dbadmin.username}: {result}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reset external traffic: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get(
    "/admin/external-traffic/stats/{username}",
    response_model=dict,
    responses={403: responses._403},
)
def get_external_traffic_stats(
    dbadmin: Admin = Depends(get_admin_by_username),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.check_sudo_admin),
    days: int = 30
):
    """Get external traffic statistics for admin."""
    try:
        from config import XPERT_TRAFFIC_TRACKING_ENABLED
        if not XPERT_TRAFFIC_TRACKING_ENABLED:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="External traffic tracking is disabled"
            )
        
        from app.xpert.traffic_service import traffic_service
        stats = traffic_service.get_admin_traffic_usage(dbadmin.username, days)
        
        # Проверка лимита
        limit_check = None
        if dbadmin.traffic_limit:
            limit_check = traffic_service.check_admin_traffic_limit(
                dbadmin.username, dbadmin.traffic_limit
            )
        
        return {
            **stats,
            "traffic_limit_bytes": dbadmin.traffic_limit,
            "traffic_limit_gb": round(dbadmin.traffic_limit / (1024**3), 3) if dbadmin.traffic_limit else None,
            "limit_check": limit_check
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get external traffic stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
