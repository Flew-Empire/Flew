from datetime import datetime
from typing import Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict

from app.db import Session, crud, get_db
from app.models.admin import Admin
from app.utils import responses
from app.utils.features import feature_enabled
from config import ADMIN_CHAT_LOCKED_SUDOERS, ADMIN_CHAT_MAIN_ADMIN

router = APIRouter(
    tags=["Admin Chat"],
    prefix="/api/admin-chat",
    responses={401: responses._401},
)


class AdminChatContact(BaseModel):
    username: str
    is_sudo: bool
    unread_count: int = 0
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None


class AdminChatMessageResponse(BaseModel):
    id: int
    sender_username: str
    recipient_username: str
    body: str
    created_at: datetime
    read_at: Optional[datetime] = None
    is_outgoing: bool

    model_config = ConfigDict(from_attributes=True)


class AdminChatSendPayload(BaseModel):
    body: str


class AdminChatPeer(BaseModel):
    username: str
    is_sudo: bool


class AdminChatPermissionsResponse(BaseModel):
    username: str
    locked_reason: Optional[str] = None
    assignable_admins: List[AdminChatPeer] = []
    allowed_usernames: List[str] = []


class AdminChatPermissionsUpdate(BaseModel):
    allowed_usernames: List[str] = []


def _ensure_chat_feature_enabled() -> None:
    if not feature_enabled("admin_chat"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _normalize_username(username: str) -> str:
    return str(username or "").strip()


def _is_main_admin(username: str) -> bool:
    return _normalize_username(username).lower() == ADMIN_CHAT_MAIN_ADMIN


def _is_locked_sudo(username: str) -> bool:
    return _normalize_username(username).lower() in set(ADMIN_CHAT_LOCKED_SUDOERS)


def _build_admin_lookup(db: Session, current_admin: Admin) -> Dict[str, dict]:
    lookup = {
        item.username: {
            "username": item.username,
            "is_sudo": bool(item.is_sudo),
            "is_disabled": bool(getattr(item, "is_disabled", False)),
        }
        for item in crud.get_admins(db)
    }

    current_username = _normalize_username(current_admin.username)
    if current_username and current_username not in lookup:
        lookup[current_username] = {
            "username": current_username,
            "is_sudo": bool(current_admin.is_sudo),
            "is_disabled": False,
        }
    return lookup


def _resolve_peer(lookup: Dict[str, dict], username: str) -> dict:
    peer_username = _normalize_username(username)
    peer = lookup.get(peer_username)
    if not peer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")
    if bool(peer.get("is_disabled")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin is disabled")
    return peer


def _can_chat_with(
    current_admin: dict,
    peer_admin: dict,
    explicit_permissions: Set[str],
) -> bool:
    current_username = _normalize_username(current_admin.get("username"))
    peer_username = _normalize_username(peer_admin.get("username"))

    if not current_username or not peer_username or current_username == peer_username:
        return False

    if _is_main_admin(current_username) or _is_main_admin(peer_username):
        return True

    if _is_locked_sudo(current_username) or _is_locked_sudo(peer_username):
        return False

    current_is_sudo = bool(current_admin.get("is_sudo"))
    peer_is_sudo = bool(peer_admin.get("is_sudo"))

    if current_is_sudo or peer_is_sudo:
        return True

    return peer_username in explicit_permissions


def _get_assignable_admins(lookup: Dict[str, dict], selected_admin: dict) -> List[AdminChatPeer]:
    if _is_main_admin(selected_admin["username"]):
        return []
    if _is_locked_sudo(selected_admin["username"]):
        return []
    if bool(selected_admin.get("is_sudo")):
        return []

    peers = []
    for item in sorted(lookup.values(), key=lambda value: value["username"].lower()):
        peer_username = item["username"]
        if peer_username == selected_admin["username"]:
            continue
        if bool(item.get("is_disabled")):
            continue
        if _is_main_admin(peer_username) or _is_locked_sudo(peer_username):
            continue
        if bool(item.get("is_sudo")):
            continue
        peers.append(
            AdminChatPeer(username=peer_username, is_sudo=bool(item.get("is_sudo")))
        )
    return peers


def _permissions_locked_reason(selected_admin: dict) -> Optional[str]:
    username = selected_admin["username"]
    if _is_main_admin(username):
        return "Main admin always has access to everyone."
    if _is_locked_sudo(username):
        return f"This sudo admin is locked to chat only with {ADMIN_CHAT_MAIN_ADMIN}."
    if bool(selected_admin.get("is_sudo")):
        return "Regular sudo admins do not need manual chat permissions."
    return None


@router.get("/contacts", response_model=List[AdminChatContact])
def get_admin_chat_contacts(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.get_current),
):
    _ensure_chat_feature_enabled()
    lookup = _build_admin_lookup(db, current_admin)
    current_username = _normalize_username(current_admin.username)
    current_snapshot = _resolve_peer(lookup, current_username)
    explicit_permissions = set(crud.list_admin_chat_permissions_for_admin(db, current_username))

    contacts: List[AdminChatContact] = []
    for peer in lookup.values():
        if peer["username"] == current_username or bool(peer.get("is_disabled")):
            continue
        if not _can_chat_with(current_snapshot, peer, explicit_permissions):
            continue

        last_message = crud.get_admin_chat_last_message(db, current_username, peer["username"])
        unread_count = crud.count_admin_chat_unread_messages(db, current_username, peer["username"])
        contacts.append(
            AdminChatContact(
                username=peer["username"],
                is_sudo=bool(peer.get("is_sudo")),
                unread_count=unread_count,
                last_message=(last_message.body[:120] if last_message else None),
                last_message_at=(last_message.created_at if last_message else None),
            )
        )

    contacts.sort(
        key=lambda item: (
            item.last_message_at or datetime.min,
            item.unread_count,
            item.username.lower(),
        ),
        reverse=True,
    )
    return contacts


@router.get("/messages/{peer_username}", response_model=List[AdminChatMessageResponse])
def get_admin_chat_messages(
    peer_username: str,
    limit: Optional[int] = 200,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.get_current),
):
    _ensure_chat_feature_enabled()
    lookup = _build_admin_lookup(db, current_admin)
    current_username = _normalize_username(current_admin.username)
    current_snapshot = _resolve_peer(lookup, current_username)
    peer = _resolve_peer(lookup, peer_username)
    explicit_permissions = set(crud.list_admin_chat_permissions_for_admin(db, current_username))

    if not _can_chat_with(current_snapshot, peer, explicit_permissions):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You're not allowed")

    crud.mark_admin_chat_messages_read(db, current_username, peer["username"])
    items = crud.get_admin_chat_messages(db, current_username, peer["username"], limit=limit or 200)
    return [
        AdminChatMessageResponse(
            id=item.id,
            sender_username=item.sender_username,
            recipient_username=item.recipient_username,
            body=item.body,
            created_at=item.created_at,
            read_at=item.read_at,
            is_outgoing=item.sender_username == current_username,
        )
        for item in items
    ]


@router.post("/messages/{peer_username}", response_model=AdminChatMessageResponse)
def send_admin_chat_message(
    peer_username: str,
    payload: AdminChatSendPayload,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.get_current),
):
    _ensure_chat_feature_enabled()
    body = str(payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body is required")
    if len(body) > 4000:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message is too long")

    lookup = _build_admin_lookup(db, current_admin)
    current_username = _normalize_username(current_admin.username)
    current_snapshot = _resolve_peer(lookup, current_username)
    peer = _resolve_peer(lookup, peer_username)
    explicit_permissions = set(crud.list_admin_chat_permissions_for_admin(db, current_username))

    if not _can_chat_with(current_snapshot, peer, explicit_permissions):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You're not allowed")

    item = crud.create_admin_chat_message(db, current_username, peer["username"], body)
    return AdminChatMessageResponse(
        id=item.id,
        sender_username=item.sender_username,
        recipient_username=item.recipient_username,
        body=item.body,
        created_at=item.created_at,
        read_at=item.read_at,
        is_outgoing=True,
    )


@router.get(
    "/permissions/{username}",
    response_model=AdminChatPermissionsResponse,
    responses={403: responses._403},
)
def get_admin_chat_permissions(
    username: str,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.check_sudo_admin),
):
    _ensure_chat_feature_enabled()
    lookup = _build_admin_lookup(db, current_admin)
    selected_admin = _resolve_peer(lookup, username)
    assignable_admins = _get_assignable_admins(lookup, selected_admin)
    allowed_usernames = set(crud.list_admin_chat_permissions_for_admin(db, selected_admin["username"]))
    assignable_usernames = {item.username for item in assignable_admins}

    return AdminChatPermissionsResponse(
        username=selected_admin["username"],
        locked_reason=_permissions_locked_reason(selected_admin),
        assignable_admins=assignable_admins,
        allowed_usernames=sorted(
            allowed_usernames.intersection(assignable_usernames),
            key=lambda value: value.lower(),
        ),
    )


@router.put(
    "/permissions/{username}",
    response_model=AdminChatPermissionsResponse,
    responses={403: responses._403},
)
def update_admin_chat_permissions(
    username: str,
    payload: AdminChatPermissionsUpdate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.check_sudo_admin),
):
    _ensure_chat_feature_enabled()
    lookup = _build_admin_lookup(db, current_admin)
    selected_admin = _resolve_peer(lookup, username)
    locked_reason = _permissions_locked_reason(selected_admin)
    if locked_reason:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=locked_reason)

    assignable_admins = _get_assignable_admins(lookup, selected_admin)
    assignable_usernames = {item.username for item in assignable_admins}
    requested_usernames = {
        _normalize_username(item)
        for item in (payload.allowed_usernames or [])
        if _normalize_username(item)
    }
    invalid = sorted(requested_usernames.difference(assignable_usernames), key=lambda value: value.lower())
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid admins in permission list: {', '.join(invalid)}",
        )

    allowed_usernames = crud.replace_admin_chat_permissions(
        db,
        selected_admin["username"],
        sorted(requested_usernames, key=lambda value: value.lower()),
        created_by_username=current_admin.username,
    )

    return AdminChatPermissionsResponse(
        username=selected_admin["username"],
        locked_reason=None,
        assignable_admins=assignable_admins,
        allowed_usernames=allowed_usernames,
    )
