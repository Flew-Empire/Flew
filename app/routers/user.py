import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Union

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError

from app import logger, xray
from app.db import Session, crud, get_db
from app.dependencies import get_expired_users_list, get_validated_user, validate_dates
from app.models.admin import Admin
from app.models.user import (
    UserCreate,
    UserModify,
    UserResponse,
    UsersResponse,
    UserStatus,
    UsersUsagesResponse,
    UserUsagesResponse,
)
from app.models.proxy import ProxySettings, ProxyTypes
from app.utils import report, responses
from app.xpert.admin_user_traffic_limit_service import get_admin_user_traffic_limit_bytes
from app.xpert.panel_sync_service import panel_sync_service, build_user_clone_payload

router = APIRouter(tags=["User"], prefix="/api", responses={401: responses._401})

def _enforce_admin_limits(db: Session, target_admin, add_users: int = 0) -> None:
    if target_admin is None or target_admin.is_sudo:
        return
    if target_admin.users_limit is not None:
        current_count = crud.get_users_count(db=db, admin=target_admin)
        if current_count + add_users > target_admin.users_limit:
            raise HTTPException(status_code=403, detail="Admin user limit reached")
    if target_admin.traffic_limit is not None and target_admin.users_usage is not None:
        if target_admin.users_usage >= target_admin.traffic_limit:
            raise HTTPException(status_code=403, detail="Admin traffic limit reached")



def _apply_admin_user_traffic_cap(user_obj, admin_username: Optional[str]) -> None:
    cap = get_admin_user_traffic_limit_bytes((admin_username or "").strip())
    if cap is None:
        return
    current = getattr(user_obj, "data_limit", None)
    if current is None or current == 0 or current > cap:
        setattr(user_obj, "data_limit", cap)


def _collect_clone_sync_failures(sync_result: dict) -> List[str]:
    failures: List[str] = []
    for item in (sync_result or {}).get("results", []):
        status = str(item.get("status") or "").strip().lower()
        if status in {"created", "updated"}:
            continue
        target_id = item.get("target_id")
        message = str(item.get("message") or item.get("code") or status or "unknown")
        failures.append(f"target={target_id} status={status or 'unknown'} msg={message[:120]}")
    return failures


def _sync_user_clone(payload: dict) -> None:
    username = str(payload.get("username") or "").strip()
    try:
        first = panel_sync_service.sync_user_to_enabled_targets(payload)
        failures = _collect_clone_sync_failures(first)
        if not failures:
            return

        logger.warning(
            "Panel sync immediate create had failures for user %s: %s",
            username or payload.get("username"),
            " | ".join(failures),
        )

        # Short retry prevents 30-minute wait for scheduled reconcile on transient errors.
        time.sleep(2)
        second = panel_sync_service.sync_user_to_enabled_targets(payload)
        retry_failures = _collect_clone_sync_failures(second)
        if retry_failures:
            logger.error(
                "Panel sync retry failed for user %s: %s",
                username or payload.get("username"),
                " | ".join(retry_failures),
            )
        else:
            logger.info("Panel sync retry succeeded for user %s", username or payload.get("username"))
    except Exception:
        logger.exception("Panel sync failed for user %s", username or payload.get("username"))


def _sync_user_delete(username: str) -> None:
    try:
        panel_sync_service.delete_user_from_enabled_targets(username)
    except Exception:
        logger.exception("Panel delete sync failed for user %s", username)


def _sync_user_reset(username: str) -> None:
    try:
        panel_sync_service.reset_user_in_enabled_targets(username)
    except Exception:
        logger.exception("Panel reset sync failed for user %s", username)


def _sync_user_revoke(username: str) -> None:
    try:
        panel_sync_service.revoke_user_in_enabled_targets(username)
    except Exception:
        logger.exception("Panel revoke sync failed for user %s", username)


def _sync_many_users_reset(usernames: List[str]) -> None:
    for username in usernames:
        try:
            panel_sync_service.reset_user_in_enabled_targets(username)
        except Exception:
            logger.exception("Panel bulk reset sync failed for user %s", username)



@router.post("/user", response_model=UserResponse, responses={400: responses._400, 409: responses._409})
def add_user(
    new_user: UserCreate,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.get_current),
):
    """
    Add a new user

    - **username**: 3 to 32 characters, can include a-z, 0-9, and underscores.
    - **status**: User's status, defaults to `active`. Special rules if `on_hold`.
    - **expire**: UTC timestamp for account expiration. Use `0` for unlimited.
    - **data_limit**: Max data usage in bytes (e.g., `1073741824` for 1GB). `0` means unlimited.
    - **data_limit_reset_strategy**: Defines how/if data limit resets. `no_reset` means it never resets.
    - **proxies**: Dictionary of protocol settings (e.g., `vmess`, `vless`).
    - **inbounds**: Dictionary of protocol tags to specify inbound connections.
    - **note**: Optional text field for additional user information or notes.
    - **on_hold_timeout**: UTC timestamp when `on_hold` status should start or end.
    - **on_hold_expire_duration**: Duration (in seconds) for how long the user should stay in `on_hold` status.
    - **next_plan**: Next user plan (resets after use).
    """

    # TODO expire should be datetime instead of timestamp

    for proxy_type in new_user.proxies:
        if not xray.config.inbounds_by_protocol.get(proxy_type):
            raise HTTPException(
                status_code=400,
                detail=f"Protocol {proxy_type} is disabled on your server",
            )

    dbadmin = crud.get_admin(db, admin.username)
    _enforce_admin_limits(db, dbadmin, add_users=1)
    _apply_admin_user_traffic_cap(new_user, dbadmin.username if dbadmin else None)

    # Force all active protocols/inbounds for every newly created user.
    active_protocols = [
        ProxyTypes(proto)
        for proto, items in xray.config.inbounds_by_protocol.items()
        if items
    ]
    for proxy_type in active_protocols:
        if proxy_type not in new_user.proxies:
            new_user.proxies[proxy_type] = ProxySettings.from_dict(proxy_type, {})
        if not new_user.inbounds.get(proxy_type):
            new_user.inbounds[proxy_type] = [
                inbound["tag"] for inbound in xray.config.inbounds_by_protocol.get(proxy_type, [])
            ]

    try:
        dbuser = crud.create_user(
            db, new_user, admin=crud.get_admin(db, admin.username)
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="User already exists")

    bg.add_task(xray.operations.add_user, dbuser=dbuser.username)
    user = UserResponse.model_validate(dbuser)
    report.user_created(user=user, user_id=dbuser.id, by=admin, user_admin=dbuser.admin)
    try:
        crud.create_admin_action_log(
            db=db,
            admin=dbadmin,
            action="user.create",
            target_type="user",
            target_username=user.username,
            meta={"status": str(user.status), "expire": user.expire, "data_limit": user.data_limit},
        )
        if user.data_limit is not None and int(user.data_limit) > 0:
            crud.create_admin_action_log(
                db=db,
                admin=dbadmin,
                action="user.traffic_limit_set",
                target_type="user",
                target_username=user.username,
                meta={"old": None, "new": int(user.data_limit)},
            )
    except Exception:
        pass

    try:
        clone_payload = build_user_clone_payload(user.model_dump(mode="json"))
        if clone_payload.get("username"):
            bg.add_task(_sync_user_clone, clone_payload)
    except Exception:
        logger.exception('Failed preparing panel sync payload for "%s"', user.username)

    logger.info(f'New user "{dbuser.username}" added')
    return user


@router.get("/user/{username}", response_model=UserResponse, responses={403: responses._403, 404: responses._404})
def get_user(dbuser: UserResponse = Depends(get_validated_user)):
    """Get user information"""
    return dbuser


@router.put("/user/{username}", response_model=UserResponse, responses={400: responses._400, 403: responses._403, 404: responses._404})
def modify_user(
    modified_user: UserModify,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    dbuser: UsersResponse = Depends(get_validated_user),
    admin: Admin = Depends(Admin.get_current),
):
    """
    Modify an existing user

    - **username**: Cannot be changed. Used to identify the user.
    - **status**: User's new status. Can be 'active', 'disabled', 'on_hold', 'limited', or 'expired'.
    - **expire**: UTC timestamp for new account expiration. Set to `0` for unlimited, `null` for no change.
    - **data_limit**: New max data usage in bytes (e.g., `1073741824` for 1GB). Set to `0` for unlimited, `null` for no change.
    - **data_limit_reset_strategy**: New strategy for data limit reset. Options include 'daily', 'weekly', 'monthly', or 'no_reset'.
    - **proxies**: Dictionary of new protocol settings (e.g., `vmess`, `vless`). Empty dictionary means no change.
    - **inbounds**: Dictionary of new protocol tags to specify inbound connections. Empty dictionary means no change.
    - **note**: New optional text for additional user information or notes. `null` means no change.
    - **on_hold_timeout**: New UTC timestamp for when `on_hold` status should start or end. Only applicable if status is changed to 'on_hold'.
    - **on_hold_expire_duration**: New duration (in seconds) for how long the user should stay in `on_hold` status. Only applicable if status is changed to 'on_hold'.
    - **next_plan**: Next user plan (resets after use).

    Note: Fields set to `null` or omitted will not be modified.
    """

    for proxy_type in modified_user.proxies:
        if not xray.config.inbounds_by_protocol.get(proxy_type):
            raise HTTPException(
                status_code=400,
                detail=f"Protocol {proxy_type} is disabled on your server",
            )

    if modified_user.status in [UserStatus.active, UserStatus.on_hold]:
        if dbuser.admin and dbuser.admin.username == admin.username:
            dbadmin = crud.get_admin(db, admin.username)
            _enforce_admin_limits(db, dbadmin)

    _apply_admin_user_traffic_cap(modified_user, dbuser.admin.username if dbuser.admin else None)

    old_status = dbuser.status
    old_expire = dbuser.expire
    old_data_limit = dbuser.data_limit
    old_note = dbuser.note
    dbuser = crud.update_user(db, dbuser, modified_user)
    user = UserResponse.model_validate(dbuser)

    if user.status in [UserStatus.active, UserStatus.on_hold]:
        bg.add_task(xray.operations.update_user, dbuser=dbuser.username)
    else:
        bg.add_task(xray.operations.remove_user, dbuser=dbuser)

    bg.add_task(report.user_updated, user=user, user_admin=dbuser.admin, by=admin)

    logger.info(f'User "{user.username}" modified')

    if user.status != old_status:
        bg.add_task(
            report.status_change,
            username=user.username,
            status=user.status,
            user=user,
            user_admin=dbuser.admin,
            by=admin,
        )
        logger.info(
            f'User "{dbuser.username}" status changed from {old_status} to {user.status}'
        )

    try:
        changes = {}
        if old_status != user.status:
            changes["status"] = {"from": str(old_status), "to": str(user.status)}
        if old_expire != user.expire:
            changes["expire"] = {"from": old_expire, "to": user.expire}
        if old_data_limit != user.data_limit:
            changes["data_limit"] = {"from": old_data_limit, "to": user.data_limit}
        if old_note != user.note:
            changes["note"] = {"from": bool(old_note), "to": bool(user.note)}
        actor = crud.get_admin(db, admin.username)
        crud.create_admin_action_log(
            db=db,
            admin=actor,
            action="user.modify",
            target_type="user",
            target_username=user.username,
            meta={"changes": changes} if changes else None,
        )
        if old_status != user.status and user.status == UserStatus.disabled:
            crud.create_admin_action_log(
                db=db,
                admin=actor,
                action="user.disabled",
                target_type="user",
                target_username=user.username,
                meta={"from": str(old_status), "to": str(user.status)},
            )
        if old_data_limit != user.data_limit:
            crud.create_admin_action_log(
                db=db,
                admin=actor,
                action="user.traffic_limit_set",
                target_type="user",
                target_username=user.username,
                meta={"old": old_data_limit, "new": user.data_limit},
            )
    except Exception:
        pass

    try:
        clone_payload = build_user_clone_payload(user.model_dump(mode="json"))
        if clone_payload.get("username"):
            bg.add_task(_sync_user_clone, clone_payload)
    except Exception:
        logger.exception('Failed preparing panel sync modify payload for "%s"', user.username)

    return user


@router.delete("/user/{username}", responses={403: responses._403, 404: responses._404})
def remove_user(
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    dbuser: UserResponse = Depends(get_validated_user),
    admin: Admin = Depends(Admin.get_current),
):
    """Remove a user"""
    username = dbuser.username
    crud.remove_user(db, dbuser)
    bg.add_task(xray.operations.remove_user, dbuser=dbuser)

    bg.add_task(
        report.user_deleted,
        username=dbuser.username,
        user_admin=(Admin.model_validate(dbuser.admin) if dbuser.admin is not None else None),
        by=admin,
    )

    try:
        crud.create_admin_action_log(
            db=db,
            admin=(crud.get_admin(db, admin.username) or admin),
            action="user.delete",
            target_type="user",
            target_username=username,
            meta=None,
        )
    except Exception:
        pass

    bg.add_task(_sync_user_delete, username)
    logger.info(f'User "{dbuser.username}" deleted')
    return {"detail": "User successfully deleted"}


@router.post("/user/{username}/reset", response_model=UserResponse, responses={403: responses._403, 404: responses._404})
def reset_user_data_usage(
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    dbuser: UserResponse = Depends(get_validated_user),
    admin: Admin = Depends(Admin.get_current),
):
    """Reset user data usage"""
    before_used = getattr(dbuser, "used_traffic", None)
    dbuser = crud.reset_user_data_usage(db=db, dbuser=dbuser)
    if dbuser.status in [UserStatus.active, UserStatus.on_hold]:
        bg.add_task(xray.operations.add_user, dbuser=dbuser.username)

    user = UserResponse.model_validate(dbuser)
    bg.add_task(
        report.user_data_usage_reset, user=user, user_admin=dbuser.admin, by=admin
    )

    try:
        crud.create_admin_action_log(
            db=db,
            admin=(crud.get_admin(db, admin.username) or admin),
            action="user.reset_usage",
            target_type="user",
            target_username=user.username,
            meta={"used_traffic_before": before_used},
        )
    except Exception:
        pass

    bg.add_task(_sync_user_reset, user.username)
    logger.info(f'User "{dbuser.username}"\'s usage was reset')
    return dbuser


@router.post("/user/{username}/revoke_sub", response_model=UserResponse, responses={403: responses._403, 404: responses._404})
def revoke_user_subscription(
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    dbuser: UserResponse = Depends(get_validated_user),
    admin: Admin = Depends(Admin.get_current),
):
    """Revoke users subscription (Subscription link and proxies)"""
    dbuser = crud.revoke_user_sub(db=db, dbuser=dbuser)

    if dbuser.status in [UserStatus.active, UserStatus.on_hold]:
        bg.add_task(xray.operations.update_user, dbuser=dbuser.username)
    user = UserResponse.model_validate(dbuser)
    bg.add_task(
        report.user_subscription_revoked, user=user, user_admin=dbuser.admin, by=admin
    )

    logger.info(f'User "{dbuser.username}" subscription revoked')

    try:
        crud.create_admin_action_log(
            db=db,
            admin=(crud.get_admin(db, admin.username) or admin),
            action="user.revoke_sub",
            target_type="user",
            target_username=user.username,
            meta=None,
        )
    except Exception:
        pass

    bg.add_task(_sync_user_revoke, user.username)
    return user


@router.get("/users", response_model=UsersResponse, responses={400: responses._400, 403: responses._403, 404: responses._404})
def get_users(
    offset: int = None,
    limit: int = None,
    username: List[str] = Query(None),
    search: Union[str, None] = None,
    owner: Union[List[str], None] = Query(None, alias="admin"),
    status: UserStatus = None,
    sort: str = None,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.get_current),
):
    """Get all users"""
    if sort is not None:
        opts = sort.strip(",").split(",")
        sort = []
        for opt in opts:
            try:
                sort.append(crud.UsersSortingOptions[opt])
            except KeyError:
                raise HTTPException(
                    status_code=400, detail=f'"{opt}" is not a valid sort option'
                )

    unassigned_only = False
    admin_filter = None
    admins_filter = owner if admin.is_sudo else [admin.username]

    if admin.is_sudo and owner and "__sudo_self__" in owner:
        unassigned_only = True
        admins_filter = None

    users, count = crud.get_users(
        db=db,
        offset=offset,
        limit=limit,
        search=search,
        usernames=username,
        status=status,
        sort=sort,
        admin=admin_filter,
        admins=admins_filter,
        unassigned_only=unassigned_only,
        return_with_count=True,
    )

    return {"users": users, "total": count}


@router.post("/users/reset", responses={403: responses._403, 404: responses._404})
def reset_users_data_usage(
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Reset all users data usage"""
    dbadmin = crud.get_admin(db, admin.username)
    users_to_reset = crud.get_users(db=db, admin=dbadmin)
    used_before_by_user = {
        str(getattr(u, "username", "")): int(getattr(u, "used_traffic", 0) or 0)
        for u in users_to_reset
        if str(getattr(u, "username", "")).strip()
    }
    crud.reset_all_users_data_usage(db=db, admin=dbadmin)
    startup_config = xray.config.include_db_users()
    xray.core.restart(startup_config)
    for node_id, node in list(xray.nodes.items()):
        if node.connected:
            xray.operations.restart_node(node_id, startup_config)
    try:
        actor = crud.get_admin(db, admin.username) or admin
        for username, before_used in used_before_by_user.items():
            if before_used <= 0:
                continue
            crud.create_admin_action_log(
                db=db,
                admin=actor,
                action="user.reset_usage",
                target_type="user",
                target_username=username,
                meta={"used_traffic_before": before_used},
            )
    except Exception:
        pass
    bg.add_task(_sync_many_users_reset, [u.username for u in users_to_reset])
    return {"detail": "Users successfully reset."}


@router.get("/user/{username}/usage", response_model=UserUsagesResponse, responses={403: responses._403, 404: responses._404})
def get_user_usage(
    dbuser: UserResponse = Depends(get_validated_user),
    start: str = "",
    end: str = "",
    db: Session = Depends(get_db),
):
    """Get users usage"""
    start, end = validate_dates(start, end)

    usages = crud.get_user_usages(db, dbuser, start, end)

    return {"usages": usages, "username": dbuser.username}


@router.post("/user/{username}/active-next", response_model=UserResponse, responses={403: responses._403, 404: responses._404})
def active_next_plan(
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    dbuser: UserResponse = Depends(get_validated_user),
):
    """Reset user by next plan"""
    dbuser = crud.reset_user_by_next(db=db, dbuser=dbuser)

    if (dbuser is None or dbuser.next_plan is None):
        raise HTTPException(
            status_code=404,
            detail=f"User doesn't have next plan",
        )

    if dbuser.status in [UserStatus.active, UserStatus.on_hold]:
        bg.add_task(xray.operations.add_user, dbuser=dbuser.username)

    user = UserResponse.model_validate(dbuser)
    bg.add_task(
        report.user_data_reset_by_next, user=user, user_admin=dbuser.admin,
    )

    try:
        clone_payload = build_user_clone_payload(user.model_dump(mode="json"))
        if clone_payload.get("username"):
            bg.add_task(_sync_user_clone, clone_payload)
    except Exception:
        logger.exception('Failed preparing panel sync next-plan payload for "%s"', user.username)

    logger.info(f'User "{dbuser.username}"\'s usage was reset by next plan')
    return dbuser


@router.get("/users/usage", response_model=UsersUsagesResponse)
def get_users_usage(
    start: str = "",
    end: str = "",
    db: Session = Depends(get_db),
    owner: Union[List[str], None] = Query(None, alias="admin"),
    admin: Admin = Depends(Admin.get_current),
):
    """Get all users usage"""
    start, end = validate_dates(start, end)

    admins_filter = owner if admin.is_sudo else [admin.username]
    unassigned_only = False
    if admin.is_sudo and owner and "__sudo_self__" in owner:
        admins_filter = None
        unassigned_only = True

    usages = crud.get_all_users_usages(
        db=db,
        start=start,
        end=end,
        admin=admins_filter,
        unassigned_only=unassigned_only,
    )

    return {"usages": usages}


@router.put("/user/{username}/set-owner", response_model=UserResponse)
def set_owner(
    admin_username: str,
    dbuser: UserResponse = Depends(get_validated_user),
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Set a new owner (admin) for a user."""
    new_admin = crud.get_admin(db, username=admin_username)
    if not new_admin:
        raise HTTPException(status_code=404, detail="Admin not found")

    add_users = 0
    if not dbuser.admin or dbuser.admin.id != new_admin.id:
        add_users = 1
    _enforce_admin_limits(db, new_admin, add_users=add_users)

    dbuser = crud.set_owner(db, dbuser, new_admin)
    user = UserResponse.model_validate(dbuser)

    logger.info(f'{user.username}"owner successfully set to{admin.username}')

    return user


@router.get("/users/expired", response_model=List[str])
def get_expired_users(
    expired_after: Optional[datetime] = Query(None, example="2024-01-01T00:00:00"),
    expired_before: Optional[datetime] = Query(None, example="2024-01-31T23:59:59"),
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.get_current),
):
    """
    Get users who have expired within the specified date range.

    - **expired_after** UTC datetime (optional)
    - **expired_before** UTC datetime (optional)
    - At least one of expired_after or expired_before must be provided for filtering
    - If both are omitted, returns all expired users
    """

    expired_after, expired_before = validate_dates(expired_after, expired_before)

    expired_users = get_expired_users_list(db, admin, expired_after, expired_before)
    return [u.username for u in expired_users]


@router.delete("/users/expired", response_model=List[str])
def delete_expired_users(
    bg: BackgroundTasks,
    expired_after: Optional[datetime] = Query(None, example="2024-01-01T00:00:00"),
    expired_before: Optional[datetime] = Query(None, example="2024-01-31T23:59:59"),
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.get_current),
):
    """
    Delete users who have expired within the specified date range.

    - **expired_after** UTC datetime (optional)
    - **expired_before** UTC datetime (optional)
    - At least one of expired_after or expired_before must be provided
    """
    expired_after, expired_before = validate_dates(expired_after, expired_before)

    expired_users = get_expired_users_list(db, admin, expired_after, expired_before)
    removed_users = [u.username for u in expired_users]

    if not removed_users:
        raise HTTPException(
            status_code=404, detail="No expired users found in the specified date range"
        )

    crud.remove_users(db, expired_users)

    for removed_user in removed_users:
        logger.info(f'User "{removed_user}" deleted')
        bg.add_task(
            report.user_deleted,
            username=removed_user,
            user_admin=next(
                (u.admin for u in expired_users if u.username == removed_user), None
            ),
            by=admin,
        )
        bg.add_task(_sync_user_delete, removed_user)

    return removed_users
