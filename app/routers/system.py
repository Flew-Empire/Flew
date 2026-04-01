import json
from copy import deepcopy
from typing import Dict, List, Union

import commentjson
from fastapi import APIRouter, Depends, HTTPException

from app import __version__, xray
from app.db import Session, crud, get_db
from app.models.admin import Admin
from app.models.proxy import ProxyHost, ProxyInbound, ProxyTypes
from app.models.system import SystemStats
from app.models.user import UserStatus
from app.utils import responses
from app.utils.system import cpu_usage, memory_usage, realtime_bandwidth
from app.utils.features import enabled_features
from app.xray import XRayConfig
from config import FLEW_EDITION, XPANEL_ENABLED, XRAY_JSON

router = APIRouter(tags=["System"], prefix="/api", responses={401: responses._401})


def _xray_unavailable() -> bool:
    return xray.config is None


def _load_source_config() -> dict:
    with open(XRAY_JSON, "r") as f:
        return commentjson.loads(f.read())


def _save_source_config(payload: dict) -> None:
    with open(XRAY_JSON, "w") as f:
        f.write(json.dumps(payload, indent=4))


def _validate_inbound_payload(inbound_data: dict) -> tuple[str, str]:
    if not isinstance(inbound_data, dict):
        raise HTTPException(status_code=400, detail="Inbound payload must be an object")

    tag = str(inbound_data.get("tag") or "").strip()
    if not tag:
        raise HTTPException(status_code=400, detail="Inbound tag is required")

    protocol = str(inbound_data.get("protocol") or "").strip().lower()
    if not protocol:
        raise HTTPException(status_code=400, detail="Inbound protocol is required")

    return tag, protocol


def _get_source_inbounds(payload: dict) -> List[dict]:
    inbounds = payload.setdefault("inbounds", [])
    if not isinstance(inbounds, list):
        raise HTTPException(status_code=400, detail="Config inbounds must be a list")
    return inbounds


def _apply_xray_config(payload: dict, db: Session) -> XRayConfig:
    if _xray_unavailable():
        raise HTTPException(
            status_code=503,
            detail="Xray core is not installed on this server",
        )

    try:
        new_config = XRayConfig(payload, api_port=xray.config.api_port)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    _save_source_config(payload)
    xray.config = new_config

    for inbound_tag in xray.config.inbounds_by_tag:
        crud.get_or_create_inbound(db, inbound_tag)

    startup_config = xray.config.include_db_users()
    xray.core.restart(startup_config)
    for node_id, node in list(xray.nodes.items()):
        if node.connected:
            xray.operations.restart_node(node_id, startup_config)

    xray.hosts.update()
    return new_config


@router.get("/system", response_model=SystemStats)
def get_system_stats(
    db: Session = Depends(get_db), admin: Admin = Depends(Admin.get_current)
):
    """Fetch system stats including memory, CPU, and user metrics."""
    mem = memory_usage()
    cpu = cpu_usage()
    system = crud.get_system_usage(db)
    dbadmin: Union[Admin, None] = crud.get_admin(db, admin.username)

    total_user = crud.get_users_count(db, admin=dbadmin if not admin.is_sudo else None)
    users_active = crud.get_users_count(
        db, status=UserStatus.active, admin=dbadmin if not admin.is_sudo else None
    )
    users_disabled = crud.get_users_count(
        db, status=UserStatus.disabled, admin=dbadmin if not admin.is_sudo else None
    )
    users_on_hold = crud.get_users_count(
        db, status=UserStatus.on_hold, admin=dbadmin if not admin.is_sudo else None
    )
    users_expired = crud.get_users_count(
        db, status=UserStatus.expired, admin=dbadmin if not admin.is_sudo else None
    )
    users_limited = crud.get_users_count(
        db, status=UserStatus.limited, admin=dbadmin if not admin.is_sudo else None
    )
    online_users = crud.count_online_users(db, 24)
    realtime_bandwidth_stats = realtime_bandwidth()

    return SystemStats(
        version=__version__,
        edition=FLEW_EDITION,
        features=sorted(enabled_features()),
        xpanel_enabled=bool(XPANEL_ENABLED),
        mem_total=mem.total,
        mem_used=mem.used,
        cpu_cores=cpu.cores,
        cpu_usage=cpu.percent,
        total_user=total_user,
        online_users=online_users,
        users_active=users_active,
        users_disabled=users_disabled,
        users_expired=users_expired,
        users_limited=users_limited,
        users_on_hold=users_on_hold,
        incoming_bandwidth=system.uplink,
        outgoing_bandwidth=system.downlink,
        incoming_bandwidth_speed=realtime_bandwidth_stats.incoming_bytes,
        outgoing_bandwidth_speed=realtime_bandwidth_stats.outgoing_bytes,
    )


@router.get("/inbounds", response_model=Dict[ProxyTypes, List[ProxyInbound]])
def get_inbounds(admin: Admin = Depends(Admin.get_current)):
    """Retrieve inbound configurations grouped by protocol."""
    if _xray_unavailable():
        # Keep dashboard usable in subscription-aggregation-only mode.
        return {}
    supported_protocols = set(ProxyTypes._value2member_map_)
    return {
        ProxyTypes(protocol): inbounds
        for protocol, inbounds in xray.config.inbounds_by_protocol.items()
        if protocol in supported_protocols
    }


@router.get("/inbounds/raw", responses={403: responses._403})
def get_raw_inbounds(admin: Admin = Depends(Admin.check_sudo_admin)):
    """Return raw inbound objects from the source Xray config in their current order."""
    payload = _load_source_config()
    return deepcopy(_get_source_inbounds(payload))


@router.post("/inbounds", responses={403: responses._403})
def create_inbound(
    inbound_data: dict,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Create a new inbound configuration."""
    tag, _protocol = _validate_inbound_payload(inbound_data)

    payload = _load_source_config()
    inbounds = _get_source_inbounds(payload)

    if any(str(inbound.get("tag") or "").strip() == tag for inbound in inbounds):
        raise HTTPException(status_code=409, detail=f"Inbound {tag} already exists")

    inbounds.append(deepcopy(inbound_data))
    _apply_xray_config(payload, db)
    return deepcopy(inbound_data)


@router.put("/inbounds/reorder", responses={403: responses._403})
def reorder_inbounds(
    order_payload: dict,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Persist inbound order from the dashboard."""
    payload = _load_source_config()
    inbounds = _get_source_inbounds(payload)
    tags = order_payload.get("tags")
    if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
        raise HTTPException(status_code=400, detail="tags must be a list of strings")

    current_tags = [str(inbound.get("tag") or "").strip() for inbound in inbounds]
    if (
        len(tags) != len(current_tags)
        or len(set(tags)) != len(tags)
        or set(tags) != set(current_tags)
    ):
        raise HTTPException(
            status_code=400,
            detail="tags must contain each current inbound tag exactly once",
        )

    inbound_map = {
        str(inbound.get("tag") or "").strip(): inbound for inbound in inbounds
    }
    payload["inbounds"] = [deepcopy(inbound_map[tag]) for tag in tags]
    _apply_xray_config(payload, db)
    return {"reordered": True, "tags": tags}


@router.put("/inbounds/{inbound_tag}", responses={403: responses._403})
def update_inbound(
    inbound_tag: str,
    inbound_data: dict,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Replace an existing inbound by tag."""
    tag, _protocol = _validate_inbound_payload(inbound_data)
    if tag != inbound_tag:
        raise HTTPException(
            status_code=400,
            detail="Changing inbound tag is not supported. Create a new inbound instead.",
        )

    payload = _load_source_config()
    inbounds = _get_source_inbounds(payload)
    index = next(
        (
            idx
            for idx, inbound in enumerate(inbounds)
            if str(inbound.get("tag") or "").strip() == inbound_tag
        ),
        None,
    )
    if index is None:
        raise HTTPException(status_code=404, detail=f"Inbound {inbound_tag} not found")

    inbounds[index] = deepcopy(inbound_data)
    _apply_xray_config(payload, db)
    return deepcopy(inbound_data)


@router.delete("/inbounds/{inbound_tag}", responses={403: responses._403})
def delete_inbound(
    inbound_tag: str,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Delete an inbound from the source Xray config."""
    payload = _load_source_config()
    inbounds = _get_source_inbounds(payload)
    index = next(
        (
            idx
            for idx, inbound in enumerate(inbounds)
            if str(inbound.get("tag") or "").strip() == inbound_tag
        ),
        None,
    )
    if index is None:
        raise HTTPException(status_code=404, detail=f"Inbound {inbound_tag} not found")

    removed = deepcopy(inbounds.pop(index))
    _apply_xray_config(payload, db)
    return {"deleted": True, "inbound": removed}


@router.get(
    "/hosts", response_model=Dict[str, List[ProxyHost]], responses={403: responses._403}
)
def get_hosts(
    db: Session = Depends(get_db), admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Get a list of proxy hosts grouped by inbound tag."""
    if _xray_unavailable():
        return {}
    hosts = {tag: crud.get_hosts(db, tag) for tag in xray.config.inbounds_by_tag}
    return hosts


@router.put(
    "/hosts", response_model=Dict[str, List[ProxyHost]], responses={403: responses._403}
)
def modify_hosts(
    modified_hosts: Dict[str, List[ProxyHost]],
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Modify proxy hosts and update the configuration."""
    if _xray_unavailable():
        raise HTTPException(
            status_code=503,
            detail="Xray core is not installed on this server",
        )

    for inbound_tag in modified_hosts:
        if inbound_tag not in xray.config.inbounds_by_tag:
            raise HTTPException(
                status_code=400, detail=f"Inbound {inbound_tag} doesn't exist"
            )

    for inbound_tag, hosts in modified_hosts.items():
        crud.update_hosts(db, inbound_tag, hosts)

    xray.hosts.update()

    return {tag: crud.get_hosts(db, tag) for tag in xray.config.inbounds_by_tag}
