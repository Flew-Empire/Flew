from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from typing import List, Optional
import requests
import json
from datetime import datetime, timedelta
import threading
import redis

from app.xpert.service import xpert_service
from app.xpert.xpert_core_integration import xpert_core_integration
from app.xpert.ping_stats import ping_stats_service
from app.xpert.direct_config_service import direct_config_service
from app.xpert.panel_sync_service import panel_sync_service
from app.xpert.checker import checker
from app.xpert.hwid_lock_service import (
    set_required_hwid_for_subscription_url,
    set_hwid_limit_for_subscription_url,
    clear_hwid_lock_for_username,
    get_required_hwid_for_username,
    get_hwid_limit_for_username,
    set_required_hwid_for_username,
)
from app.xpert.happ_crypto_auto_service import clear_happ_crypto_link_for_username
from app.xpert.ip_limit_service import (
    DEFAULT_UNIQUE_IP_LIMIT,
    WINDOW_SECONDS_DEFAULT,
    get_unique_ip_limit_for_username,
    set_unique_ip_limit_for_username,
)
from app.xpert.v2box_hwid_service import (
    clear_v2box_for_username,
    get_required_v2box_device_id_for_username,
    set_v2box_settings_for_username,
)
from app.xpert.device_limit_service import (
    DEFAULT_ALLOWED_DEVICES,
    MAX_ALLOWED_DEVICES_SUDO,
    enforce_first_device_policy_for_all_users,
    get_device_settings_for_username,
    list_devices_for_username,
    reset_devices_for_username,
    seed_device_data_from_legacy_sources,
    set_device_settings_for_username,
    set_device_status_for_username,
)
from app.xpert.admin_user_traffic_limit_service import (
    get_admin_user_traffic_limit_bytes,
    set_admin_user_traffic_limit_bytes,
)
from app.models.admin import Admin
from app.db import Session, GetDB, crud, get_db
import config
from app import logger, xray
from app.utils.features import feature_enabled

router = APIRouter(prefix="/xpert", tags=["Xpanel"])

_redis_client = None
_panel_sync_manual_lock = threading.Lock()


def _require_feature(name: str) -> None:
    if not feature_enabled(name):
        raise HTTPException(status_code=404, detail="Not Found")


def _require_xpanel() -> None:
    _require_feature("xpanel")


def _require_admin_manager() -> None:
    _require_feature("admin_manager")


def _require_device_limit() -> None:
    _require_feature("device_limit")


def _require_v2box() -> None:
    _require_feature("v2box_id")


def _require_ip_limits() -> None:
    _require_feature("ip_limits")


def _require_happ_crypto() -> None:
    _require_feature("happ_crypto")


def _require_admin_limits() -> None:
    _require_feature("admin_limits")


def _get_redis_client():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        url = (getattr(config, "XPERT_REDIS_URL", "") or "").strip()
        if not url:
            return None
        _redis_client = redis.from_url(url, decode_responses=True, socket_timeout=0.3)
        _redis_client.ping()
        return _redis_client
    except Exception:
        _redis_client = None
        return None


def _cache_get_json(key: str):
    client = _get_redis_client()
    if not client:
        return None
    try:
        raw = client.get(key)
        if not raw:
            return None
        return json.loads(raw)
    except Exception:
        return None


def _cache_set_json(key: str, value, ttl_seconds: int):
    client = _get_redis_client()
    if not client:
        return
    try:
        client.setex(key, max(1, int(ttl_seconds)), json.dumps(value, ensure_ascii=False))
    except Exception:
        return


class SourceCreate(BaseModel):
    name: str
    url: str
    priority: int = 1


class SourceResponse(BaseModel):
    id: int
    name: str
    url: str
    enabled: bool
    priority: int
    config_count: int
    success_rate: float


class PingReport(BaseModel):
    server: str
    port: int
    protocol: str
    ping_ms: float
    success: bool


class StatsResponse(BaseModel):
    total_sources: int
    enabled_sources: int
    total_configs: int
    active_configs: int
    avg_ping: float
    target_ips: List[str]
    domain: str


class DirectConfigCreate(BaseModel):
    raw: str
    remarks: Optional[str] = None
    added_by: Optional[str] = "admin"


class DirectConfigUpdate(BaseModel):
    raw: Optional[str] = None
    remarks: Optional[str] = None
    added_by: Optional[str] = None


class DirectConfigMove(BaseModel):
    direction: str


class DirectConfigBatchMove(BaseModel):
    config_ids: List[int]
    direction: str


class DirectConfigReorder(BaseModel):
    source_id: int
    target_id: int


class DirectConfigPermanentUpdate(BaseModel):
    is_permanent: bool


class TargetIPsUpdate(BaseModel):
    target_ips: List[str]


class PanelSyncTargetInput(BaseModel):
    id: Optional[int] = None
    url: str = ""
    username: str = ""
    password: str = ""
    enabled: bool = False


class PanelSyncTargetsUpdate(BaseModel):
    targets: Optional[List[PanelSyncTargetInput]] = None


class CryptoLinkRequest(BaseModel):
    url: str
    hwid: Optional[str] = None
    hwid_limit: Optional[int] = None


class HWIDResetRequest(BaseModel):
    username: str


class HappHWIDLimitRequest(BaseModel):
    username: str
    device_id: Optional[str] = None


class UniqueIPLimitRequest(BaseModel):
    username: str
    limit: Optional[int] = None


class DeviceLimitRequest(BaseModel):
    username: str
    limit: Optional[int] = None
    unlimited: Optional[bool] = False


class DeviceStatusRequest(BaseModel):
    fingerprint: str


class DeviceMassEnforceRequest(BaseModel):
    seed_legacy: bool = True


class V2BoxHWIDLimitRequest(BaseModel):
    username: str
    device_id: Optional[str] = None


class V2BoxHWIDResetRequest(BaseModel):
    username: str


class AdminUserTrafficLimitRequest(BaseModel):
    admin_username: str
    limit_bytes: Optional[int] = None


class AdminActionLogItem(BaseModel):
    id: int
    created_at: str
    admin_username: str
    action: str
    target_type: Optional[str] = None
    target_username: Optional[str] = None
    meta: Optional[dict] = None


class AdminSummaryItem(BaseModel):
    username: str
    is_sudo: bool
    total_users: int
    actions_24h: int


class AdminManagerActionsResponse(BaseModel):
    total: int
    items: List[AdminActionLogItem]


class AdminLifetimeUserItem(BaseModel):
    username: str
    count: int
    last_at: str


class AdminLifetimeStatsResponse(BaseModel):
    created_count: int
    extended_count: int
    deleted_count: int
    created_users: List[AdminLifetimeUserItem]
    extended_users: List[AdminLifetimeUserItem]
    deleted_users: List[AdminLifetimeUserItem]


class DirectConfigResponse(BaseModel):
    id: int
    raw: str
    protocol: str
    server: str
    port: int
    remarks: str
    ping_ms: float
    jitter_ms: float
    packet_loss: float
    is_active: bool
    bypass_whitelist: bool
    auto_sync_to_core: bool
    added_at: str
    added_by: str


def _effective_admin_is_sudo(db: Session, admin: Admin) -> bool:
    dbadmin = crud.get_admin(db, getattr(admin, "username", ""))
    if dbadmin is not None:
        return bool(getattr(dbadmin, "is_sudo", False))
    return bool(getattr(admin, "is_sudo", False))


@router.get("/whitelists", dependencies=[Depends(_require_xpanel)])
async def get_whitelists():
    """Получить все белые списки IP"""
    try:
        from app.xpert.cluster_service import whitelist_service
        whitelists = whitelist_service.get_all_whitelists()
        return {
            "whitelists": [
                {
                    "id": w.id,
                    "name": w.name,
                    "description": w.description,
                    "hosts_count": len(w.allowed_hosts),
                    "active_hosts": sum(1 for host in w.allowed_hosts if host.is_active),
                    "created_at": w.created_at,
                    "updated_at": w.updated_at,
                    "is_active": w.is_active
                }
                for w in whitelists
            ],
            "stats": whitelist_service.get_whitelist_stats()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/whitelists", dependencies=[Depends(_require_xpanel)])
async def create_whitelist(data: dict):
    """Создать новый белый список IP"""
    try:
        from app.xpert.cluster_service import whitelist_service
        
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        
        if not name:
            raise HTTPException(status_code=400, detail="Whitelist name is required")
        
        whitelist_id = whitelist_service.create_whitelist(name, description)
        return {"whitelist_id": whitelist_id, "message": "IP whitelist created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/whitelists/{whitelist_id}/hosts", dependencies=[Depends(_require_xpanel)])
async def add_allowed_host(whitelist_id: str, data: dict):
    """Добавить разрешенный хост (IP или домен) в белый список"""
    try:
        from app.xpert.cluster_service import whitelist_service
        
        host = data.get('host', '').strip()
        description = data.get('description', '').strip()
        country = data.get('country', '').strip()
        
        if not host:
            raise HTTPException(status_code=400, detail="Host (IP or domain) is required")
        
        success = whitelist_service.add_allowed_host(
            whitelist_id, host, description, country
        )
        
        if success:
            return {"message": "Allowed host added successfully"}
        else:
            raise HTTPException(status_code=404, detail="Whitelist not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/whitelists/{whitelist_id}/hosts", dependencies=[Depends(_require_xpanel)])
async def get_whitelist_hosts(whitelist_id: str):
    """Получить хосты (IP и домены) белого списка"""
    try:
        from app.xpert.cluster_service import whitelist_service
        
        whitelists = whitelist_service.get_all_whitelists()
        whitelist = next((w for w in whitelists if w.id == whitelist_id), None)
        
        if not whitelist:
            raise HTTPException(status_code=404, detail="Whitelist not found")
        
        return {
            "whitelist_id": whitelist_id,
            "whitelist_name": whitelist.name,
            "hosts": [
                {
                    "host": host.host,
                    "description": host.description,
                    "country": host.country,
                    "is_active": host.is_active,
                    "added_at": host.added_at
                }
                for host in whitelist.allowed_hosts
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/whitelists/{whitelist_id}/hosts/{host}/status", dependencies=[Depends(_require_xpanel)])
async def update_host_status(whitelist_id: str, host: str, data: dict):
    """Обновить статус хоста"""
    try:
        from app.xpert.cluster_service import whitelist_service
        
        is_active = data.get('is_active', True)
        
        success = whitelist_service.update_host_status(host, is_active)
        
        if success:
            return {"message": "Host status updated successfully"}
        else:
            raise HTTPException(status_code=404, detail="Host not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/whitelists/{whitelist_id}", dependencies=[Depends(_require_xpanel)])
async def delete_whitelist(whitelist_id: str):
    """Удалить белый список"""
    try:
        from app.xpert.cluster_service import whitelist_service
        
        success = whitelist_service.delete_whitelist(whitelist_id)
        
        if success:
            return {"message": "Whitelist deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Whitelist not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/whitelists/{whitelist_id}/hosts/{host}", dependencies=[Depends(_require_xpanel)])
async def delete_host_from_whitelist(whitelist_id: str, host: str):
    """Удалить хост из белого списка"""
    try:
        from app.xpert.cluster_service import whitelist_service
        
        success = whitelist_service.remove_host_from_whitelist(whitelist_id, host)
        
        if success:
            return {"message": "Host removed successfully"}
        else:
            raise HTTPException(status_code=404, detail="Whitelist or host not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/allowed-hosts", dependencies=[Depends(_require_xpanel)])
async def get_allowed_hosts():
    """Получить все разрешенные хосты (IP и домены)"""
    try:
        from app.xpert.cluster_service import whitelist_service
        allowed_hosts = whitelist_service.get_all_allowed_hosts()
        
        return {
            "hosts": list(allowed_hosts),
            "total": len(allowed_hosts)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/filter-servers", dependencies=[Depends(_require_xpanel)])
async def filter_servers_by_host(data: dict):
    """Отфильтровать сервера по белому списку хостов"""
    try:
        from app.xpert.ip_filter import host_filter
        
        server_configs = data.get('servers', [])
        
        if not server_configs:
            raise HTTPException(status_code=400, detail="No servers provided")
        
        # Фильтрация серверов
        filtered_servers = host_filter.filter_servers(server_configs)
        
        return {
            "total_servers": len(server_configs),
            "allowed_servers": len(filtered_servers),
            "servers": filtered_servers,
            "stats": host_filter.get_filter_stats()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@router.get("/stats", dependencies=[Depends(_require_xpanel)])
async def get_stats():
    """Получение статистики Xpanel"""
    return xpert_service.get_stats()


@router.get("/target-ips", dependencies=[Depends(_require_xpanel)])
async def get_target_ips(admin: Admin = Depends(Admin.get_current)):
    """Получение списка target IPs для проверок."""
    return {"target_ips": xpert_service.get_target_ips()}


@router.put("/target-ips", dependencies=[Depends(_require_xpanel)])
async def update_target_ips(data: TargetIPsUpdate, admin: Admin = Depends(Admin.get_current)):
    """Обновление списка target IPs для проверок."""
    try:
        updated = xpert_service.set_target_ips(data.target_ips)
        return {"message": "Target IPs updated", "target_ips": updated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/panel-sync/targets", dependencies=[Depends(_require_xpanel)])
async def get_panel_sync_targets(admin: Admin = Depends(Admin.check_sudo_admin)):
    """Получение настроек панелей для клонирования пользователей."""
    return {"targets": panel_sync_service.get_targets()}


@router.put("/panel-sync/targets", dependencies=[Depends(_require_xpanel)])
async def save_panel_sync_targets(
    payload: PanelSyncTargetsUpdate,
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Сохранение настроек панелей для клонирования пользователей."""
    targets = panel_sync_service.save_targets(
        [target.model_dump() for target in (payload.targets or [])]
    )
    return {"targets": targets}


@router.post("/panel-sync/test", dependencies=[Depends(_require_xpanel)])
async def test_panel_sync_targets(admin: Admin = Depends(Admin.check_sudo_admin)):
    """Проверка соединения с целевыми панелями."""
    return {"targets": panel_sync_service.test_targets()}


@router.post("/panel-sync/sync-all-users", dependencies=[Depends(_require_xpanel)])
async def sync_all_users_to_targets(
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Ручная синхронизация всех пользователей в целевые панели."""
    if not _panel_sync_manual_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Sync already running")
    try:
        def _run_sync() -> dict:
            with GetDB() as local_db:
                return panel_sync_service.sync_all_users_from_db(local_db)

        summary = await run_in_threadpool(_run_sync)
    finally:
        _panel_sync_manual_lock.release()
    return {
        "total_users": summary.get("total_users", 0),
        "created": summary.get("created", 0),
        "updated": summary.get("updated", 0),
        "errors": summary.get("errors", 0),
        "sample_results": (summary.get("results") or [])[:20],
        "orphan_cleanup": summary.get("orphan_cleanup"),
    }


@router.post("/panel-sync/targets/{target_id}/purge-users", dependencies=[Depends(_require_xpanel)])
async def purge_panel_sync_target_users(
    target_id: int,
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Удаляет клонов пользователей с выбранной панели и очищает mapping."""
    try:
        result = panel_sync_service.purge_target_users(target_id)
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/sources", dependencies=[Depends(_require_xpanel)])
async def get_sources():
    """Получение списка источников подписок"""
    sources = xpert_service.get_sources()
    return [
        {
            "id": s.id,
            "name": s.name,
            "url": s.url,
            "enabled": s.enabled,
            "priority": s.priority,
            "config_count": s.config_count,
            "success_rate": s.success_rate,
            "last_fetched": s.last_fetched
        }
        for s in sources
    ]


@router.post("/sources", dependencies=[Depends(_require_xpanel)])
async def add_source(source: SourceCreate):
    """Добавление источника подписки"""
    try:
        s = xpert_service.add_source(source.name, source.url, source.priority)
        return {
            "id": s.id,
            "name": s.name,
            "url": s.url,
            "enabled": s.enabled,
            "priority": s.priority,
            "config_count": s.config_count,
            "success_rate": s.success_rate
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/sources/{source_id}", dependencies=[Depends(_require_xpanel)])
async def delete_source(source_id: int):
    """Удаление источника подписки"""
    if xpert_service.delete_source(source_id):
        return {"success": True}
    raise HTTPException(status_code=404, detail="Source not found")


@router.post("/sources/{source_id}/toggle", dependencies=[Depends(_require_xpanel)])
async def toggle_source(source_id: int):
    """Включение/выключение источника"""
    source = xpert_service.toggle_source(source_id)
    if source:
        return {"success": True, "enabled": source.enabled}
    raise HTTPException(status_code=404, detail="Source not found")


@router.post("/update", dependencies=[Depends(_require_xpanel)])
async def force_update():
    """Принудительное обновление подписок"""
    try:
        # Увеличиваем таймаут для долгих операций
        import asyncio
        result = await asyncio.wait_for(xpert_service.update_subscription(), timeout=300)  # 5 минут
        return {"success": True, **result}
    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail="Update timeout - operation took too long")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/configs", dependencies=[Depends(_require_xpanel)])
async def get_configs():
    """Получение списка конфигураций"""
    configs = xpert_service.get_all_configs()
    return [
        {
            "id": c.id,
            "protocol": c.protocol,
            "server": c.server,
            "port": c.port,
            "remarks": c.remarks,
            "ping_ms": c.ping_ms,
            "packet_loss": c.packet_loss,
            "is_active": c.is_active
        }
        for c in configs
    ]


@router.post("/test-url", dependencies=[Depends(_require_xpanel)])
async def test_subscription_url(url_data: dict):
    """Тестирование URL подписки перед добавлением"""
    url = url_data.get("url", "")
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    try:
        configs = await checker.fetch_subscription(url)
        return {
            "success": True,
            "url": url,
            "config_count": len(configs),
            "sample_configs": configs[:3]  # Показываем первые 3 конфига для примера
        }
    except Exception as e:
        return {
            "success": False,
            "url": url,
            "error": str(e),
            "config_count": 0
        }


@router.post("/sync-core", dependencies=[Depends(_require_xpanel)])
async def sync_to_core():
    """Принудительная синхронизация с Xpert Core"""
    try:
        result = xpert_core_integration.sync_active_configs_to_core()
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ping-report", dependencies=[Depends(_require_xpanel)])
async def report_ping(ping_data: PingReport, user_id: int = 1):
    """Запись результата пинга от пользователя"""
    try:
        ping_stats_service.record_ping(
            server=ping_data.server,
            port=ping_data.port,
            protocol=ping_data.protocol,
            user_id=user_id,
            ping_ms=ping_data.ping_ms,
            success=ping_data.success
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/server-health/{server}/{port}/{protocol}", dependencies=[Depends(_require_xpanel)])
async def get_server_health(server: str, port: int, protocol: str):
    """Получение статистики здоровья сервера"""
    try:
        health = ping_stats_service.get_server_health(server, port, protocol)
        return health
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ping-stats", dependencies=[Depends(_require_xpanel)])
async def get_ping_stats():
    """Получение сводной статистики пингов"""
    try:
        return ping_stats_service.get_stats_summary()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cleanup-stats", dependencies=[Depends(_require_xpanel)])
async def cleanup_ping_stats(days: int = 7):
    """Очистка старой статистики"""
    try:
        ping_stats_service.cleanup_old_stats(days)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top-configs", dependencies=[Depends(_require_xpanel)])
async def get_top_configs(limit: int = 10):
    """Получение топ-N конфигов с их score"""
    try:
        configs = xpert_service.get_active_configs()
        
        # Получаем топ конфиги с score
        try:
            from app.xpert.ping_stats import ping_stats_service
            import config as app_config
            
            # Фильтруем здоровые
            healthy_configs = ping_stats_service.get_healthy_configs(configs)
            
            # Получаем топ с score
            top_limit = min(limit, app_config.XPERT_TOP_SERVERS_LIMIT)
            top_configs = ping_stats_service.get_top_configs(healthy_configs, top_limit)
            
            # Добавляем score для отображения
            result = []
            for config in top_configs:
                health = ping_stats_service.get_server_health(config.server, config.port, config.protocol)
                score = 0
                
                if health['healthy'] is None:
                    score = ping_stats_service._calculate_original_score(config)
                elif health['healthy']:
                    score = ping_stats_service._calculate_stats_score(health, config)
                
                result.append({
                    "id": config.id,
                    "protocol": config.protocol,
                    "server": config.server,
                    "port": config.port,
                    "remarks": config.remarks,
                    "ping_ms": config.ping_ms,
                    "packet_loss": config.packet_loss,
                    "is_active": config.is_active,
                    "score": round(score, 2),
                    "health": health
                })
            
            return {"configs": result, "total": len(result)}
            
        except Exception as e:
            # Если статистика недоступна, возвращаем базовые конфиги
            return {"configs": configs[:limit], "total": len(configs[:limit])}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/queue-configs", dependencies=[Depends(_require_xpanel)])
async def get_queue_configs():
    """Получение конфигов в очереди (не попавших в топ)"""
    try:
        configs = xpert_service.get_active_configs()
        
        # Получаем топ конфиги
        try:
            from app.xpert.ping_stats import ping_stats_service
            import config as app_config
            
            # Фильтруем здоровые
            healthy_configs = ping_stats_service.get_healthy_configs(configs)
            
            # Получаем топ
            top_limit = app_config.XPERT_TOP_SERVERS_LIMIT
            top_configs = ping_stats_service.get_top_configs(healthy_configs, top_limit)
            
            # Очередь = все здоровые минус топ
            top_servers = {(c.server, c.port, c.protocol) for c in top_configs}
            queue_configs = [
                c for c in healthy_configs 
                if (c.server, c.port, c.protocol) not in top_servers
            ]
            
            return {"configs": queue_configs, "total": len(queue_configs)}
            
        except Exception as e:
            # Если статистика недоступна, возвращаем пустую очередь
            return {"configs": [], "total": 0}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sub", dependencies=[Depends(_require_xpanel)])
async def get_subscription(format: str = "universal", user_token: str = None):
    """Получение агрегированной подписки с отслеживанием трафика"""
    content = xpert_service.generate_subscription(format)
    
    # Extract user token from request if not provided
    if not user_token:
        from fastapi import Request
        # This will be available from the request context
        pass
    
    # Get current traffic stats for headers
    traffic_stats = {}
    if config.XPERT_TRAFFIC_TRACKING_ENABLED and user_token:
        try:
            from app.xpert.traffic_service import traffic_service
            stats = traffic_service.get_user_traffic_stats(user_token, 30)
            traffic_stats = {
                "upload": int(stats.get("total_gb_used", 0) * 1024**3 / 2),  # Rough estimate
                "download": int(stats.get("total_gb_used", 0) * 1024**3 / 2),
                "total": int(stats.get("total_gb_used", 0) * 1024**3),
                "expire": 0
            }
        except Exception:
            pass
    
    headers = {
        "Content-Type": "text/plain; charset=utf-8",
        "Profile-Update-Interval": "1",
        "Subscription-Userinfo": f"upload={traffic_stats.get('upload', 0)}; download={traffic_stats.get('download', 0)}; total={traffic_stats.get('total', 0)}; expire={traffic_stats.get('expire', 0)}",
        "Profile-Title": "Xpanel",
        "Traffic-Webhook": f"{config.XPERT_DOMAIN}/api/xpert/traffic-webhook",
        "User-Token": user_token or "anonymous"
    }
    
    return PlainTextResponse(content=content, headers=headers)


@router.get("/direct-configs/sub", dependencies=[Depends(_require_xpanel)])
async def get_direct_configs_subscription(format: str = "universal", user_token: str = None):
    """Подписка только из Direct Configurations (сырой raw без преобразований Xpert Core)"""
    try:
        direct_configs = direct_config_service.get_active_configs()
        content = "\n".join([c.raw for c in direct_configs])

        if format == "base64":
            import base64
            content = base64.b64encode(content.encode()).decode()

        # Get current traffic stats for headers
        traffic_stats = {}
        if config.XPERT_TRAFFIC_TRACKING_ENABLED and user_token:
            try:
                from app.xpert.traffic_service import traffic_service
                stats = traffic_service.get_user_traffic_stats(user_token, 30)
                traffic_stats = {
                    "upload": int(stats.get("total_gb_used", 0) * 1024**3 / 2),  # Rough estimate
                    "download": int(stats.get("total_gb_used", 0) * 1024**3 / 2),
                    "total": int(stats.get("total_gb_used", 0) * 1024**3),
                    "expire": 0
                }
            except Exception:
                pass

        headers = {
            "Content-Type": "text/plain; charset=utf-8",
            "Profile-Update-Interval": "1",
            "Subscription-Userinfo": f"upload={traffic_stats.get('upload', 0)}; download={traffic_stats.get('download', 0)}; total={traffic_stats.get('total', 0)}; expire={traffic_stats.get('expire', 0)}",
            "Profile-Title": "Xpert Direct",
            "Traffic-Webhook": f"{config.XPERT_DOMAIN}/api/xpert/traffic-webhook",
            "User-Token": user_token or "anonymous"
        }

        return PlainTextResponse(content=content, headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Direct Configurations API
@router.get("/direct-configs", dependencies=[Depends(_require_xpanel)])
async def get_direct_configs():
    """Получение всех прямых конфигураций"""
    try:
        # Обновляем ping/status для direct configs (с throttling в сервисе)
        direct_config_service.refresh_all_pings()
        configs = direct_config_service.get_all_configs()
        return {
            "configs": [
                {
                    "id": c.id,
                    "raw": c.raw,
                    "protocol": c.protocol,
                    "server": c.server,
                    "port": c.port,
                    "remarks": c.remarks,
                    "ping_ms": c.ping_ms,
                    "jitter_ms": c.jitter_ms,
                    "packet_loss": c.packet_loss,
                    "is_active": c.is_active,
                    "is_permanent": c.is_permanent,
                    "bypass_whitelist": c.bypass_whitelist,
                    "auto_sync_to_core": c.auto_sync_to_core,
                    "added_at": c.added_at,
                    "added_by": c.added_by
                }
                for c in configs
            ],
            "total": len(configs)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/direct-configs/ping-refresh", dependencies=[Depends(_require_xpanel)])
async def refresh_direct_configs_ping(admin: Admin = Depends(Admin.get_current)):
    """Ручное обновление ping/status для Direct Configurations."""
    try:
        direct_config_service.refresh_all_pings(force=True)
        return {"message": "Direct configs ping refreshed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/direct-configs", dependencies=[Depends(_require_xpanel)])
async def add_direct_config(config_data: DirectConfigCreate, admin: Admin = Depends(Admin.get_current)):
    """Добавление одиночной конфигурации в обход белого списка"""
    try:
        config = direct_config_service.add_config(
            raw=config_data.raw,
            remarks=config_data.remarks,
            added_by=config_data.added_by
        )
        
        # Автоматическая синхронизация с Xpert Core если включена
        if config.auto_sync_to_core:
            try:
                xpert_core_integration.sync_direct_config_to_core(config)
            except Exception as e:
                # Не прерываем операцию, но логируем ошибку
                import logging
                logging.warning(f"Failed to sync direct config to Xpert Core: {e}")
        
        return {
            "id": config.id,
            "message": "Direct config added successfully",
            "config": {
                "id": config.id,
                "protocol": config.protocol,
                "server": config.server,
                "port": config.port,
                "remarks": config.remarks,
                "bypass_whitelist": config.bypass_whitelist,
                "auto_sync_to_core": config.auto_sync_to_core
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/direct-configs/batch", dependencies=[Depends(_require_xpanel)])
async def add_direct_configs_batch(configs_data: dict, admin: Admin = Depends(Admin.get_current)):
    """Массовое добавление конфигураций"""
    try:
        raw_configs = configs_data.get('configs', [])
        added_by = configs_data.get('added_by', 'admin')
        
        if not raw_configs:
            raise HTTPException(status_code=400, detail="No configs provided")
        
        results = []
        errors = []

        error_summary = {}
        
        for i, raw_config in enumerate(raw_configs):
            try:
                config = direct_config_service.add_config(
                    raw=raw_config,
                    remarks=f"Batch config #{i+1}",
                    added_by=added_by
                )
                
                # Автоматическая синхронизация с Xpert Core
                if config.auto_sync_to_core:
                    try:
                        xpert_core_integration.sync_direct_config_to_core(config)
                    except Exception as e:
                        import logging
                        logging.warning(f"Failed to sync batch config {config.id} to Xpert Core: {e}")
                
                results.append({
                    "id": config.id,
                    "server": config.server,
                    "port": config.port,
                    "protocol": config.protocol
                })
                
            except Exception as e:
                err_str = str(e)
                if err_str:
                    error_summary[err_str] = error_summary.get(err_str, 0) + 1
                errors.append({
                    "config_index": i,
                    "error": err_str,
                    "raw_prefix": raw_config[:80]
                })
        
        return {
            "total_provided": len(raw_configs),
            "successful_added": len(results),
            "failed": len(errors),
            "results": results,
            "errors": errors,
            "error_summary": error_summary
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/direct-configs/{config_id}", dependencies=[Depends(_require_xpanel)])
async def update_direct_config(config_id: int, config_data: DirectConfigUpdate, admin: Admin = Depends(Admin.get_current)):
    """Редактирование прямой конфигурации"""
    try:
        config = direct_config_service.update_config(
            config_id=config_id,
            raw=config_data.raw,
            remarks=config_data.remarks,
            added_by=config_data.added_by,
        )
        if not config:
            raise HTTPException(status_code=404, detail="Direct config not found")
        return {
            "message": "Direct config updated successfully",
            "config": {
                "id": config.id,
                "raw": config.raw,
                "protocol": config.protocol,
                "server": config.server,
                "port": config.port,
                "remarks": config.remarks,
                "ping_ms": config.ping_ms,
                "jitter_ms": config.jitter_ms,
                "packet_loss": config.packet_loss,
                "is_active": config.is_active,
                "is_permanent": config.is_permanent,
                "bypass_whitelist": config.bypass_whitelist,
                "auto_sync_to_core": config.auto_sync_to_core,
                "added_at": config.added_at,
                "added_by": config.added_by,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/direct-configs/{config_id}/move", dependencies=[Depends(_require_xpanel)])
async def move_direct_config(config_id: int, data: DirectConfigMove, admin: Admin = Depends(Admin.get_current)):
    """Перемещение конфигурации вверх/вниз"""
    try:
        configs = direct_config_service.move_config(config_id, data.direction)
        if configs is None:
            raise HTTPException(status_code=404, detail="Direct config not found")
        return {"message": "Direct config moved", "total": len(configs)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/direct-configs/move-batch", dependencies=[Depends(_require_xpanel)])
async def move_direct_configs_batch(data: DirectConfigBatchMove, admin: Admin = Depends(Admin.get_current)):
    """Массовое перемещение выбранных конфигураций вверх/вниз"""
    try:
        if not data.config_ids:
            raise HTTPException(status_code=400, detail="No config ids provided")
        configs = direct_config_service.move_configs(data.config_ids, data.direction)
        return {"message": "Direct configs moved", "total": len(configs)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/direct-configs/reorder", dependencies=[Depends(_require_xpanel)])
async def reorder_direct_config(data: DirectConfigReorder, admin: Admin = Depends(Admin.get_current)):
    """Перетаскивание (drag&drop): переставить source_id на позицию target_id одним запросом."""
    try:
        configs = direct_config_service.reorder_config(data.source_id, data.target_id)
        if configs is None:
            raise HTTPException(status_code=404, detail="Direct config not found")
        return {"message": "Direct config reordered", "total": len(configs)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/direct-configs/{config_id}", dependencies=[Depends(_require_xpanel)])
async def delete_direct_config(config_id: int, admin: Admin = Depends(Admin.get_current)):
    """Удаление прямой конфигурации"""
    try:
        success = direct_config_service.delete_config(config_id)
        if success:
            return {"message": "Direct config deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Direct config not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/direct-configs/{config_id}/toggle", dependencies=[Depends(_require_xpanel)])
async def toggle_direct_config(config_id: int, admin: Admin = Depends(Admin.get_current)):
    """Включение/выключение прямой конфигурации"""
    try:
        config = direct_config_service.toggle_config(config_id)
        if config:
            return {"message": "Direct config toggled successfully", "is_active": config.is_active}
        else:
            raise HTTPException(status_code=404, detail="Direct config not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/direct-configs/{config_id}/permanent", dependencies=[Depends(_require_xpanel)])
async def set_direct_config_permanent(
    config_id: int,
    data: DirectConfigPermanentUpdate,
    admin: Admin = Depends(Admin.get_current),
):
    """Установка/снятие признака permanent для прямой конфигурации."""
    try:
        config = direct_config_service.set_permanent(config_id, data.is_permanent)
        if not config:
            raise HTTPException(status_code=404, detail="Direct config not found")
        return {
            "message": "Direct config permanent updated successfully",
            "is_permanent": config.is_permanent,
            "is_active": config.is_active,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/direct-configs/{config_id}/sync-to-core", dependencies=[Depends(_require_xpanel)])
async def sync_direct_config_to_core(config_id: int, admin: Admin = Depends(Admin.get_current)):
    """Принудительная синхронизация конкретной конфигурации с Xpert Core"""
    try:
        config = direct_config_service.get_config_by_id(config_id)
        if not config:
            raise HTTPException(status_code=404, detail="Direct config not found")
        
        result = xpert_core_integration.sync_direct_config_to_core(config)
        return {"message": "Config synced to Xpert Core successfully", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/core-sync/debug", dependencies=[Depends(_require_xpanel)])
async def core_sync_debug(admin: Admin = Depends(Admin.get_current)):
    try:
        from app import xray

        inbound_tags = []
        if getattr(xray, "config", None):
            inbound_tags = list(xray.config.inbounds_by_tag.keys())

        host_counts = {}
        try:
            for tag in inbound_tags:
                host_counts[tag] = len(xray.hosts.get(tag, []))
        except Exception:
            host_counts = {}

        return {
            "xray_enabled": bool(getattr(xray, "config", None)),
            "fallback_inbound_tag": config.XRAY_FALLBACKS_INBOUND_TAG,
            "inbound_tags": inbound_tags,
            "host_counts": host_counts,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/direct-configs/validate", dependencies=[Depends(_require_xpanel)])
async def validate_direct_config(config_data: dict, admin: Admin = Depends(Admin.get_current)):
    """Валидация конфигурации перед добавлением"""
    try:
        raw_config = config_data.get('raw', '')
        if not raw_config:
            raise HTTPException(status_code=400, detail="Raw config is required")
        
        # Парсинг и валидация конфига
        import logging
        logging.info(f"Validating config: {raw_config[:100]}...")
        
        result = checker.process_config(raw_config)
        logging.info(f"Validation result: {result}")
        
        if result:
            return {
                "valid": True,
                "protocol": result["protocol"],
                "server": result["server"],
                "port": result["port"],
                "remarks": result["remarks"],
                "ping_ms": result["ping_ms"],
                "is_active": result["is_active"]
            }
        else:
            return {
                "valid": False,
                "error": "Invalid configuration format - could not parse server/port"
            }
            
    except Exception as e:
        import logging
        logging.error(f"Validation error: {str(e)}")
        return {
            "valid": False,
            "error": str(e)
        }


@router.post("/traffic-webhook", dependencies=[Depends(_require_xpanel)])
async def traffic_webhook(request: Request):
    """Принимает данные о трафике от клиентов или внешних систем"""
    try:
        if not config.XPERT_TRAFFIC_TRACKING_ENABLED:
            raise HTTPException(status_code=503, detail="Traffic tracking is disabled")
        
        data = await request.json()
        
        user_token = data.get('user_token')
        server = data.get('server')
        port = data.get('port')
        protocol = data.get('protocol')
        bytes_uploaded = data.get('bytes_uploaded', 0)
        bytes_downloaded = data.get('bytes_downloaded', 0)
        
        if not all([user_token, server, port, protocol]):
            raise HTTPException(status_code=400, detail="Missing required fields: user_token, server, port, protocol")
        
        from app.xpert.traffic_service import traffic_service
        traffic_service.record_traffic_usage(
            user_token=user_token,
            config_server=server,
            config_port=port,
            protocol=protocol,
            bytes_uploaded=bytes_uploaded,
            bytes_downloaded=bytes_downloaded
        )
        
        logger.info(f"Traffic webhook received: {user_token} -> {server}:{port} "
                   f"↑{bytes_uploaded} ↓{bytes_downloaded}")
        
        return {"status": "success", "message": "Traffic recorded successfully"}
        
    except Exception as e:
        logger.error(f"Traffic webhook error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traffic-stats/global", dependencies=[Depends(_require_xpanel)])
async def get_global_traffic_stats(days: int = 30):
    """Глобальная статистика трафика"""
    try:
        if not config.XPERT_TRAFFIC_TRACKING_ENABLED:
            raise HTTPException(status_code=503, detail="Traffic tracking is disabled")
        
        from app.xpert.traffic_service import traffic_service
        stats = traffic_service.get_global_stats(days)
        return stats
        
    except Exception as e:
        logger.error(f"Failed to get global traffic stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traffic-stats/server/{server}/{port}", dependencies=[Depends(_require_xpanel)])
async def get_server_traffic_stats(server: str, port: int, days: int = 30):
    """Статистика по конкретному серверу"""
    try:
        if not config.XPERT_TRAFFIC_TRACKING_ENABLED:
            raise HTTPException(status_code=503, detail="Traffic tracking is disabled")
        
        from app.xpert.traffic_service import traffic_service
        stats = traffic_service.get_server_stats(server, port, days)
        return stats
        
    except Exception as e:
        logger.error(f"Failed to get server traffic stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traffic-stats/database/info", dependencies=[Depends(_require_xpanel)])
async def get_database_info():
    """Информация о базе данных статистики"""
    try:
        if not config.XPERT_TRAFFIC_TRACKING_ENABLED:
            raise HTTPException(status_code=503, detail="Traffic tracking is disabled")
        
        from app.xpert.traffic_service import traffic_service
        info = traffic_service.get_database_info()
        return info
        
    except Exception as e:
        logger.error(f"Failed to get database info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/traffic-stats/cleanup", dependencies=[Depends(_require_xpanel)])
async def cleanup_traffic_stats(days: int = None):
    """Очистка старой статистики"""
    try:
        if not config.XPERT_TRAFFIC_TRACKING_ENABLED:
            raise HTTPException(status_code=503, detail="Traffic tracking is disabled")
        
        from app.xpert.traffic_service import traffic_service
        result = traffic_service.cleanup_old_stats(days)
        return result
        
    except Exception as e:
        logger.error(f"Failed to cleanup traffic stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traffic-stats/{user_token}", dependencies=[Depends(_require_xpanel)])
async def get_user_traffic_stats(user_token: str, days: int = 30):
    """Получить статистику трафика пользователя"""
    try:
        if not config.XPERT_TRAFFIC_TRACKING_ENABLED:
            raise HTTPException(status_code=503, detail="Traffic tracking is disabled")
        
        from app.xpert.traffic_service import traffic_service
        stats = traffic_service.get_user_traffic_stats(user_token, days)
        return stats
        
    except Exception as e:
        logger.error(f"Failed to get user traffic stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traffic-stats/global", dependencies=[Depends(_require_xpanel)])
@router.get("/core-traffic-stats", dependencies=[Depends(_require_xpanel)])
async def core_traffic_stats(days: int = 30):
    """Статистика для интеграции с Xpert Core UI"""
    try:
        if not config.XPERT_TRAFFIC_TRACKING_ENABLED:
            return {
                "users_traffic": {
                    "total_users": 0,
                    "total_servers": 0,
                    "total_gb_used": 0,
                    "total_connections": 0,
                    "external_servers": False,
                    "integration_type": "xpanel_disabled"
                }
            }
        
        from app.xpert.traffic_service import traffic_service
        global_stats = traffic_service.get_global_stats(days)
        
        # Формат ответа совместимый с Xpert Core
        return {
            "users_traffic": {
                **global_stats,
                "external_servers": True,  # Флаг что это внешние сервера
                "integration_type": "xpanel",
                "data_source": "traffic_monitoring_system"
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get core traffic stats: {e}")
        return {
            "users_traffic": {
                "total_users": 0,
                "total_servers": 0,
                "total_gb_used": 0,
                "total_connections": 0,
                "external_servers": False,
                "integration_type": "xpanel_error",
                "error": str(e)
            }
        }

@router.post("/crypto-link", dependencies=[Depends(_require_happ_crypto)])
async def create_crypto_link(
    data: CryptoLinkRequest,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    try:
        payload = {"url": data.url.strip()}

        # Happ lock mode: in client UI this disables edit/share/QR/JSON actions.
        try:
            from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
            parts = urlsplit(payload["url"])
            q = dict(parse_qsl(parts.query, keep_blank_values=True))
            q["hide-settings"] = "true"
            payload["url"] = urlunsplit(
                (parts.scheme, parts.netloc, parts.path, urlencode(q, doseq=True), parts.fragment)
            )
        except Exception:
            pass

        hwid_value = (data.hwid or "").strip()
        hwid_limit = data.hwid_limit

        if hwid_limit is not None and not (1 <= int(hwid_limit) <= 5):
            raise HTTPException(status_code=400, detail="HWID limit must be in range 1..5")

        # Mark HWID-mode links so main panel raw /sub remains unaffected.
        if hwid_value or (hwid_limit is not None):
            try:
                parts = urlsplit(payload["url"])
                q = dict(parse_qsl(parts.query, keep_blank_values=True))
                q["xpert_hwid"] = "1"
                payload["url"] = urlunsplit(
                    (parts.scheme, parts.netloc, parts.path, urlencode(q, doseq=True), parts.fragment)
                )
            except Exception:
                pass

        # For HWID options we must be able to parse and validate THIS panel /sub token.
        username_from_url = None
        if hwid_value or (hwid_limit is not None) or (not admin.is_sudo):
            try:
                from app.xpert.hwid_lock_service import extract_subscription_token
                from app.utils.jwt import get_subscription_payload

                token = extract_subscription_token(payload["url"])
                sub = get_subscription_payload(token) if token else None
                username_from_url = sub.get("username") if sub else None
            except Exception:
                username_from_url = None

        # sudo=n: can encrypt ONLY own Xpert Core /sub link from this panel (with or without HWID options)
        if not admin.is_sudo:
            if not username_from_url:
                raise HTTPException(status_code=403, detail="Only this panel Xpert Core /sub links are allowed")

            dbuser = crud.get_user(db, username_from_url)
            if not dbuser or not getattr(dbuser, "admin", None) or dbuser.admin.username != admin.username:
                raise HTTPException(status_code=403, detail="You are not allowed")

            # sudo=n: HWID device limit is fixed to 1.
            if hwid_limit is not None and int(hwid_limit) != 1:
                raise HTTPException(status_code=403, detail="For non-sudo admins HWID device limit can only be 1")

        # Apply HWID options (sudo=y or allowed sudo=n only)
        if hwid_value:
            username = set_required_hwid_for_subscription_url(payload["url"], hwid_value)
            if not username:
                raise HTTPException(status_code=400, detail="HWID mode requires a valid Xpert Core /sub URL")
            payload["hwid"] = hwid_value

        if hwid_limit is not None:
            username = set_hwid_limit_for_subscription_url(payload["url"], int(hwid_limit), hwid_value)
            if not username:
                raise HTTPException(status_code=400, detail="HWID limit mode requires a valid Xpert Core /sub URL")

        # Audit log (do not store full URL/token).
        try:
            from urllib.parse import urlparse
            parsed = urlparse(payload["url"])
            crud.create_admin_action_log(
                db=db,
                admin=(crud.get_admin(db, admin.username) or admin),
                action="crypto.encrypt",
                target_type="subscription",
                target_username=username_from_url,
                meta={
                    "host": parsed.netloc,
                    "path": parsed.path[:64],
                    "hwid": bool(hwid_value),
                    "hwid_limit": int(hwid_limit) if hwid_limit is not None else None,
                },
            )
        except Exception:
            pass

        resp = requests.post("https://crypto.happ.su/api-v2.php", json=payload, timeout=15)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                j = resp.json()
                if isinstance(j, str):
                    return {"link": j}
                if isinstance(j, dict):
                    for key in ("url", "link", "result", "data", "encrypted", "encrypted_link"):
                        if key in j and isinstance(j[key], str):
                            return {"link": j[key]}
                    return j
            except Exception:
                pass

        text = resp.text.strip()
        return {"link": text}
    except HTTPException:
        raise
    except Exception:
        logger.exception("crypto-link failed")
        raise HTTPException(status_code=502, detail="Crypto link generation failed")


@router.post("/hwid/reset", dependencies=[Depends(_require_happ_crypto)])
async def reset_hwid_binding(
    data: HWIDResetRequest,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    """
    Clears stored HWID lock/limit for a user.
    доступно всем админам (sudo=y и sudo=n).
    """
    username = (data.username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    cleared = clear_hwid_lock_for_username(username)
    # Drop cached locked-link so plain /sub is restored after HWID reset.
    clear_happ_crypto_link_for_username(username)
    try:
        crud.create_admin_action_log(
            db=db,
            admin=(crud.get_admin(db, admin.username) or admin),
            action="hwid.reset",
            target_type="user",
            target_username=username,
            meta={"cleared": bool(cleared)},
        )
    except Exception:
        pass
    return {"cleared": bool(cleared)}


@router.get("/hwid/{username}", dependencies=[Depends(_require_happ_crypto)])
async def get_happ_hwid_limit(
    username: str,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    username = (username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    dbuser = crud.get_user(db, username)
    if not dbuser:
        raise HTTPException(status_code=404, detail="User not found")
    if not admin.is_sudo:
        if not getattr(dbuser, "admin", None) or dbuser.admin.username != admin.username:
            raise HTTPException(status_code=403, detail="You are not allowed")

    return {
        "username": username,
        "device_id": get_required_hwid_for_username(username),
        "limit": get_hwid_limit_for_username(username),
        "max_limit": 5,
    }


@router.post("/hwid", dependencies=[Depends(_require_happ_crypto)])
async def set_happ_hwid_limit(
    data: HappHWIDLimitRequest,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    username = (data.username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    dbuser = crud.get_user(db, username)
    if not dbuser:
        raise HTTPException(status_code=404, detail="User not found")
    if not admin.is_sudo:
        if not getattr(dbuser, "admin", None) or dbuser.admin.username != admin.username:
            raise HTTPException(status_code=403, detail="You are not allowed")

    device_id_value = (data.device_id or "").strip()
    if device_id_value:
        saved = set_required_hwid_for_username(username, device_id_value)
        required_hwid = saved.get("required_hwid")
        max_unique_hwid = saved.get("max_unique_hwid")
    else:
        clear_hwid_lock_for_username(username)
        clear_happ_crypto_link_for_username(username)
        required_hwid = None
        max_unique_hwid = None

    try:
        crud.create_admin_action_log(
            db=db,
            admin=(crud.get_admin(db, admin.username) or admin),
            action="user.happ_hwid_set",
            target_type="user",
            target_username=username,
            meta={"device_id": bool(required_hwid), "max_unique_hwid": max_unique_hwid},
        )
    except Exception:
        pass

    return {
        "username": username,
        "device_id": required_hwid,
        "limit": max_unique_hwid,
        "max_limit": 5,
    }


@router.get("/ip-limit/{username}", dependencies=[Depends(_require_ip_limits)])
async def get_unique_ip_limit(
    username: str,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    """
    Returns unique IP limit (per 2 hours window) for a user.
    доступно админам по своим пользователям, sudo=y по всем.
    """
    username = (username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    dbuser = crud.get_user(db, username)
    if not dbuser:
        raise HTTPException(status_code=404, detail="User not found")
    admin_is_sudo = _effective_admin_is_sudo(db, admin)
    if not admin_is_sudo:
        if not getattr(dbuser, "admin", None) or dbuser.admin.username != admin.username:
            raise HTTPException(status_code=403, detail="You are not allowed")

    limit = get_unique_ip_limit_for_username(username)
    disabled = limit <= 0
    max_limit = 5 if admin_is_sudo else 3
    return {
        "username": username,
        "limit": None if disabled else int(limit),
        "disabled": bool(disabled),
        "window_seconds": int(WINDOW_SECONDS_DEFAULT),
        "default_limit": int(DEFAULT_UNIQUE_IP_LIMIT),
        "max_limit": int(max_limit),
    }


@router.get("/ip-limit-cap", dependencies=[Depends(_require_ip_limits)])
async def get_unique_ip_limit_cap(
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    admin_is_sudo = _effective_admin_is_sudo(db, admin)
    return {"max_limit": 5 if admin_is_sudo else 3}


@router.post("/ip-limit", dependencies=[Depends(_require_ip_limits)])
async def set_unique_ip_limit(
    data: UniqueIPLimitRequest,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    """
    Sets per-user unique IP limit. limit=None or limit<=0 disables enforcement.
    доступно админам по своим пользователям, sudo=y по всем.
    """
    username = (data.username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    dbuser = crud.get_user(db, username)
    if not dbuser:
        raise HTTPException(status_code=404, detail="User not found")
    admin_is_sudo = _effective_admin_is_sudo(db, admin)
    if not admin_is_sudo:
        if not getattr(dbuser, "admin", None) or dbuser.admin.username != admin.username:
            raise HTTPException(status_code=403, detail="You are not allowed")

    limit = data.limit
    max_limit = 5 if admin_is_sudo else 3
    if limit is not None:
        try:
            limit = int(limit)
        except Exception:
            raise HTTPException(status_code=400, detail="limit must be an integer")
        if limit <= 0:
            limit = None
        elif limit > max_limit:
            raise HTTPException(
                status_code=400,
                detail=f"limit must be <= {max_limit}",
            )

    set_unique_ip_limit_for_username(username, limit)
    effective_limit = get_unique_ip_limit_for_username(username)
    disabled = effective_limit <= 0
    try:
        crud.create_admin_action_log(
            db=db,
            admin=(crud.get_admin(db, admin.username) or admin),
            action="user.ip_limit_set",
            target_type="user",
            target_username=username,
            meta={"limit": None if disabled else int(effective_limit), "disabled": bool(disabled)},
        )
    except Exception:
        pass
    return {
        "username": username,
        "limit": None if disabled else int(effective_limit),
        "disabled": bool(disabled),
        "window_seconds": int(WINDOW_SECONDS_DEFAULT),
        "default_limit": int(DEFAULT_UNIQUE_IP_LIMIT),
        "max_limit": int(max_limit),
    }


@router.get("/device-limit-cap", dependencies=[Depends(_require_device_limit)])
async def get_device_limit_cap(
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    admin_is_sudo = _effective_admin_is_sudo(db, admin)
    return {
        "max_limit": int(MAX_ALLOWED_DEVICES_SUDO if admin_is_sudo else DEFAULT_ALLOWED_DEVICES),
        "allow_unlimited": bool(admin_is_sudo),
    }


@router.get("/device-limit/{username}", dependencies=[Depends(_require_device_limit)])
async def get_device_limit(
    username: str,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    username = (username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    dbuser = crud.get_user(db, username)
    if not dbuser:
        raise HTTPException(status_code=404, detail="User not found")

    admin_is_sudo = _effective_admin_is_sudo(db, admin)
    if not admin_is_sudo:
        if not getattr(dbuser, "admin", None) or dbuser.admin.username != admin.username:
            raise HTTPException(status_code=403, detail="You are not allowed")

    settings = get_device_settings_for_username(username)
    return {
        "username": username,
        "limit": int(settings.get("limit") or DEFAULT_ALLOWED_DEVICES),
        "unlimited": bool(settings.get("unlimited")),
        "default_limit": int(DEFAULT_ALLOWED_DEVICES),
        "max_limit": int(MAX_ALLOWED_DEVICES_SUDO if admin_is_sudo else DEFAULT_ALLOWED_DEVICES),
        "allow_unlimited": bool(admin_is_sudo),
    }


@router.post("/device-limit", dependencies=[Depends(_require_device_limit)])
async def set_device_limit(
    data: DeviceLimitRequest,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    username = (data.username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    dbuser = crud.get_user(db, username)
    if not dbuser:
        raise HTTPException(status_code=404, detail="User not found")

    admin_is_sudo = _effective_admin_is_sudo(db, admin)
    if not admin_is_sudo:
        if not getattr(dbuser, "admin", None) or dbuser.admin.username != admin.username:
            raise HTTPException(status_code=403, detail="You are not allowed")

    # sudo=n: fixed one allowed device, no unlimited mode.
    if not admin_is_sudo:
        limit = DEFAULT_ALLOWED_DEVICES
        unlimited = False
    else:
        unlimited = bool(data.unlimited)
        if unlimited:
            limit = int(data.limit or get_device_settings_for_username(username).get("limit") or DEFAULT_ALLOWED_DEVICES)
            if limit < 1:
                limit = DEFAULT_ALLOWED_DEVICES
        else:
            try:
                limit = int(data.limit or DEFAULT_ALLOWED_DEVICES)
            except Exception:
                raise HTTPException(status_code=400, detail="limit must be an integer")
            if limit < 1:
                raise HTTPException(status_code=400, detail="limit must be >= 1")
            if limit > MAX_ALLOWED_DEVICES_SUDO:
                raise HTTPException(
                    status_code=400,
                    detail=f"limit must be <= {MAX_ALLOWED_DEVICES_SUDO}",
                )

    saved = set_device_settings_for_username(username, limit=limit, unlimited=unlimited)
    try:
        crud.create_admin_action_log(
            db=db,
            admin=(crud.get_admin(db, admin.username) or admin),
            action="user.device_limit_set",
            target_type="user",
            target_username=username,
            meta={"limit": int(saved.get("limit") or DEFAULT_ALLOWED_DEVICES), "unlimited": bool(saved.get("unlimited"))},
        )
    except Exception:
        pass

    return {
        "username": username,
        "limit": int(saved.get("limit") or DEFAULT_ALLOWED_DEVICES),
        "unlimited": bool(saved.get("unlimited")),
        "default_limit": int(DEFAULT_ALLOWED_DEVICES),
        "max_limit": int(MAX_ALLOWED_DEVICES_SUDO if admin_is_sudo else DEFAULT_ALLOWED_DEVICES),
        "allow_unlimited": bool(admin_is_sudo),
    }


@router.get("/devices/{username}", dependencies=[Depends(_require_device_limit)])
async def get_user_devices(
    username: str,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    username = (username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    dbuser = crud.get_user(db, username)
    if not dbuser:
        raise HTTPException(status_code=404, detail="User not found")

    admin_is_sudo = _effective_admin_is_sudo(db, admin)
    if not admin_is_sudo:
        if not getattr(dbuser, "admin", None) or dbuser.admin.username != admin.username:
            raise HTTPException(status_code=403, detail="You are not allowed")

    devices = list_devices_for_username(username)
    return {"username": username, "devices": devices, "count": len(devices)}


@router.post("/devices/{username}/reset", dependencies=[Depends(_require_device_limit)])
async def reset_user_devices(
    username: str,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    username = (username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    dbuser = crud.get_user(db, username)
    if not dbuser:
        raise HTTPException(status_code=404, detail="User not found")

    admin_is_sudo = _effective_admin_is_sudo(db, admin)
    if not admin_is_sudo:
        if not getattr(dbuser, "admin", None) or dbuser.admin.username != admin.username:
            raise HTTPException(status_code=403, detail="You are not allowed")

    result = reset_devices_for_username(username)
    try:
        crud.create_admin_action_log(
            db=db,
            admin=(crud.get_admin(db, admin.username) or admin),
            action="user.device_reset",
            target_type="user",
            target_username=username,
            meta={"cleared": int(result.get("cleared") or 0)},
        )
    except Exception:
        pass

    return {"username": username, "cleared": int(result.get("cleared") or 0)}


@router.post("/devices/{username}/ban", dependencies=[Depends(_require_device_limit)])
async def ban_user_device(
    username: str,
    data: DeviceStatusRequest,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    username = (username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    dbuser = crud.get_user(db, username)
    if not dbuser:
        raise HTTPException(status_code=404, detail="User not found")

    admin_is_sudo = _effective_admin_is_sudo(db, admin)
    if not admin_is_sudo:
        if not getattr(dbuser, "admin", None) or dbuser.admin.username != admin.username:
            raise HTTPException(status_code=403, detail="You are not allowed")

    # Any sudo admin may force-ban even the first device.
    force_ban = bool(admin_is_sudo)
    rec = set_device_status_for_username(username, data.fingerprint, "banned", force=force_ban)
    if not rec:
        raise HTTPException(status_code=404, detail="Device not found")

    try:
        crud.create_admin_action_log(
            db=db,
            admin=(crud.get_admin(db, admin.username) or admin),
            action="user.device_ban",
            target_type="user",
            target_username=username,
            meta={"fingerprint": (data.fingerprint or "").strip()},
        )
    except Exception:
        pass

    return {"username": username, "device": rec}


@router.post("/devices/{username}/unban", dependencies=[Depends(_require_device_limit)])
async def unban_user_device(
    username: str,
    data: DeviceStatusRequest,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    username = (username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    dbuser = crud.get_user(db, username)
    if not dbuser:
        raise HTTPException(status_code=404, detail="User not found")

    admin_is_sudo = _effective_admin_is_sudo(db, admin)
    if not admin_is_sudo:
        if not getattr(dbuser, "admin", None) or dbuser.admin.username != admin.username:
            raise HTTPException(status_code=403, detail="You are not allowed")

    try:
        rec = set_device_status_for_username(username, data.fingerprint, "allowed")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not rec:
        raise HTTPException(status_code=404, detail="Device not found")

    try:
        crud.create_admin_action_log(
            db=db,
            admin=(crud.get_admin(db, admin.username) or admin),
            action="user.device_unban",
            target_type="user",
            target_username=username,
            meta={"fingerprint": (data.fingerprint or "").strip()},
        )
    except Exception:
        pass

    return {"username": username, "device": rec}


@router.post("/devices/enforce-first", dependencies=[Depends(_require_device_limit)])
async def enforce_first_device_policy(
    data: Optional[DeviceMassEnforceRequest] = None,
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    seeded = {"imported_devices": 0, "touched_users": 0}
    if bool(getattr(data, "seed_legacy", True) if data is not None else True):
        seeded = seed_device_data_from_legacy_sources()
    summary = enforce_first_device_policy_for_all_users(default_limit=DEFAULT_ALLOWED_DEVICES)
    return {"seed": seeded, "summary": summary}


@router.get("/v2box-hwid/{username}", dependencies=[Depends(_require_v2box)])
async def get_v2box_hwid_limit(
    username: str,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    username = (username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    dbuser = crud.get_user(db, username)
    if not dbuser:
        raise HTTPException(status_code=404, detail="User not found")
    if not admin.is_sudo:
        if not getattr(dbuser, "admin", None) or dbuser.admin.username != admin.username:
            raise HTTPException(status_code=403, detail="You are not allowed")

    return {
        "username": username,
        "limit": None,
        "device_id": get_required_v2box_device_id_for_username(username),
        "max_limit": None,
    }


@router.post("/v2box-hwid", dependencies=[Depends(_require_v2box)])
async def set_v2box_hwid_limit(
    data: V2BoxHWIDLimitRequest,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    username = (data.username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    dbuser = crud.get_user(db, username)
    if not dbuser:
        raise HTTPException(status_code=404, detail="User not found")

    if not admin.is_sudo:
        if not getattr(dbuser, "admin", None) or dbuser.admin.username != admin.username:
            raise HTTPException(status_code=403, detail="You are not allowed")

    device_id_value = (data.device_id or "").strip() or None

    saved = set_v2box_settings_for_username(username, None, device_id_value)
    try:
        crud.create_admin_action_log(
            db=db,
            admin=(crud.get_admin(db, admin.username) or admin),
            action="user.v2box_hwid_limit_set",
            target_type="user",
            target_username=username,
            meta={"device_id": bool(saved.get("required_device_id"))},
        )
    except Exception:
        pass

    return {
        "username": username,
        "limit": saved.get("limit"),
        "device_id": saved.get("required_device_id"),
        "max_limit": None,
    }


@router.post("/v2box-hwid/reset", dependencies=[Depends(_require_v2box)])
async def reset_v2box_hwid(
    data: V2BoxHWIDResetRequest,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    username = (data.username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    dbuser = crud.get_user(db, username)
    if not dbuser:
        raise HTTPException(status_code=404, detail="User not found")

    if not admin.is_sudo:
        if not getattr(dbuser, "admin", None) or dbuser.admin.username != admin.username:
            raise HTTPException(status_code=403, detail="You are not allowed")

    cleared = clear_v2box_for_username(username)
    try:
        crud.create_admin_action_log(
            db=db,
            admin=(crud.get_admin(db, admin.username) or admin),
            action="user.v2box_hwid_reset",
            target_type="user",
            target_username=username,
            meta={"cleared": bool(cleared)},
        )
    except Exception:
        pass

    return {"username": username, "cleared": bool(cleared)}


@router.get("/admin-user-traffic-limit/{admin_username}", dependencies=[Depends(_require_admin_limits)])
async def get_admin_user_traffic_limit(
    admin_username: str,
    admin: Admin = Depends(Admin.check_sudo_admin),
    db: Session = Depends(get_db),
):
    dbadmin = crud.get_admin(db, (admin_username or "").strip())
    if not dbadmin:
        raise HTTPException(status_code=404, detail="Admin not found")
    if dbadmin.is_sudo:
        raise HTTPException(status_code=400, detail="Target admin must be non-sudo")

    limit_bytes = get_admin_user_traffic_limit_bytes(dbadmin.username)
    return {
        "admin_username": dbadmin.username,
        "limit_bytes": limit_bytes,
        "limit_gb": round(limit_bytes / (1024 ** 3), 3) if limit_bytes is not None else None,
    }


@router.post("/admin-user-traffic-limit", dependencies=[Depends(_require_admin_limits)])
async def set_admin_user_traffic_limit(
    data: AdminUserTrafficLimitRequest,
    admin: Admin = Depends(Admin.check_sudo_admin),
    db: Session = Depends(get_db),
):
    target_name = (data.admin_username or "").strip()
    if not target_name:
        raise HTTPException(status_code=400, detail="admin_username is required")

    dbadmin = crud.get_admin(db, target_name)
    if not dbadmin:
        raise HTTPException(status_code=404, detail="Admin not found")
    if dbadmin.is_sudo:
        raise HTTPException(status_code=400, detail="Target admin must be non-sudo")

    limit_bytes = data.limit_bytes
    if limit_bytes is not None:
        try:
            limit_bytes = int(limit_bytes)
        except Exception:
            raise HTTPException(status_code=400, detail="limit_bytes must be integer")
        if limit_bytes < 0:
            raise HTTPException(status_code=400, detail="limit_bytes must be >= 0")
        if limit_bytes == 0:
            limit_bytes = None

    saved = set_admin_user_traffic_limit_bytes(dbadmin.username, limit_bytes)

    updated_users = 0
    if saved is not None:
        users = crud.get_users(db=db, admin=dbadmin)
        for u in users:
            current = u.data_limit
            if current is None or current == 0 or current > saved:
                u.data_limit = saved
                updated_users += 1
                try:
                    xray.operations.update_user(dbuser=u)
                except Exception:
                    pass
        if updated_users > 0:
            db.commit()

    try:
        # Show this event in selected admin stats (target admin), and keep actor in meta.
        crud.create_admin_action_log(
            db=db,
            admin=dbadmin,
            action="admin.user_traffic_limit_set",
            target_type="admin",
            target_username=dbadmin.username,
            meta={
                "limit_bytes": saved,
                "limit_gb": round(saved / (1024 ** 3), 3) if saved is not None else None,
                "updated_users": updated_users,
                "set_by": admin.username,
            },
        )
    except Exception:
        pass

    return {
        "admin_username": dbadmin.username,
        "limit_bytes": saved,
        "limit_gb": round(saved / (1024 ** 3), 3) if saved is not None else None,
        "updated_users": updated_users,
    }


@router.get("/admin-manager/admins", response_model=List[AdminSummaryItem], dependencies=[Depends(_require_admin_manager)])
async def admin_manager_admins(
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    if not admin.is_sudo:
        raise HTTPException(status_code=403, detail="You're not allowed")

    cache_key = "xpert:admin_manager:admins:v1"
    cached = _cache_get_json(cache_key)
    if isinstance(cached, list):
        return cached

    since = datetime.utcnow() - timedelta(hours=24)
    out: List[AdminSummaryItem] = []
    for dbadmin in crud.get_admins(db=db):
        counts = crud.get_admin_action_counts(db, dbadmin.username, since=since)
        actions_24h = int(sum(c for _, c in counts))
        total_users = int(crud.get_users_count(db=db, admin=dbadmin))
        out.append(
            AdminSummaryItem(
                username=dbadmin.username,
                is_sudo=bool(dbadmin.is_sudo),
                total_users=total_users,
                actions_24h=actions_24h,
            )
        )
    payload = [item.model_dump() for item in out]
    _cache_set_json(cache_key, payload, 5)
    return payload


@router.get("/admin-manager/actions/{admin_username}", response_model=AdminManagerActionsResponse, dependencies=[Depends(_require_admin_manager)])
async def admin_manager_actions(
    admin_username: str,
    limit: int = 100,
    offset: int = 0,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    if not admin.is_sudo:
        raise HTTPException(status_code=403, detail="You're not allowed")

    if limit < 1:
        limit = 1
    if limit > 500:
        limit = 500
    if offset < 0:
        offset = 0

    cache_key = f"xpert:admin_manager:actions:v2:{admin_username}:{offset}:{limit}"
    cached = _cache_get_json(cache_key)
    if isinstance(cached, dict) and "items" in cached and "total" in cached:
        return cached

    total = crud.count_admin_action_logs(db, admin_username=admin_username)
    rows = crud.get_admin_action_logs(db, admin_username=admin_username, offset=offset, limit=limit)
    items = []
    for r in rows:
        meta_obj = r.meta
        if isinstance(meta_obj, str):
            try:
                parsed = json.loads(meta_obj)
                if isinstance(parsed, str):
                    parsed = json.loads(parsed)
                meta_obj = parsed if isinstance(parsed, dict) else None
            except Exception:
                meta_obj = None

        items.append(
            AdminActionLogItem(
                id=r.id,
                created_at=r.created_at.isoformat() if r.created_at else "",
                admin_username=r.admin_username,
                action=r.action,
                target_type=r.target_type,
                target_username=r.target_username,
                meta=meta_obj if isinstance(meta_obj, dict) else None,
            )
        )
    payload = AdminManagerActionsResponse(total=total, items=items).model_dump()
    _cache_set_json(cache_key, payload, 3)
    return payload


@router.get("/admin-manager/lifetime/{admin_username}", response_model=AdminLifetimeStatsResponse, dependencies=[Depends(_require_admin_manager)])
async def admin_manager_lifetime_stats(
    admin_username: str,
    admin: Admin = Depends(Admin.get_current),
    db: Session = Depends(get_db),
):
    if not admin.is_sudo:
        raise HTTPException(status_code=403, detail="You're not allowed")

    cache_key = f"xpert:admin_manager:lifetime:v1:{admin_username}"
    cached = _cache_get_json(cache_key)
    if isinstance(cached, dict) and "created_count" in cached and "extended_count" in cached and "deleted_count" in cached:
        return cached

    rows = crud.get_admin_action_logs(db, admin_username=admin_username, offset=0, limit=100000)

    def _meta_obj(raw):
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, str):
                    parsed = json.loads(parsed)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                return {}
        return {}

    created_count = 0
    extended_count = 0
    deleted_count = 0

    created_users: dict = {}
    extended_users: dict = {}
    deleted_users: dict = {}

    def _touch(bucket: dict, username: str, created_at: Optional[datetime]) -> None:
        u = (username or "").strip()
        if not u:
            return
        item = bucket.get(u)
        ts = created_at.isoformat() if created_at else ""
        if not item:
            bucket[u] = {"username": u, "count": 1, "last_at": ts}
            return
        item["count"] = int(item.get("count", 0)) + 1
        prev = item.get("last_at") or ""
        if ts and (not prev or ts > prev):
            item["last_at"] = ts

    for r in rows:
        target = (r.target_username or "").strip()
        action = (r.action or "").strip()
        meta = _meta_obj(r.meta)

        if action == "user.create":
            created_count += 1
            _touch(created_users, target, r.created_at)
            continue

        if action == "user.delete":
            deleted_count += 1
            _touch(deleted_users, target, r.created_at)
            continue

        if action == "user.modify":
            changes = meta.get("changes") if isinstance(meta, dict) else {}
            if isinstance(changes, dict) and (("expire" in changes) or ("data_limit" in changes)):
                extended_count += 1
                _touch(extended_users, target, r.created_at)

    def _to_list(bucket: dict) -> List[dict]:
        return sorted(
            list(bucket.values()),
            key=lambda x: ((x.get("last_at") or ""), int(x.get("count") or 0)),
            reverse=True,
        )

    payload = AdminLifetimeStatsResponse(
        created_count=created_count,
        extended_count=extended_count,
        deleted_count=deleted_count,
        created_users=[AdminLifetimeUserItem(**x) for x in _to_list(created_users)],
        extended_users=[AdminLifetimeUserItem(**x) for x in _to_list(extended_users)],
        deleted_users=[AdminLifetimeUserItem(**x) for x in _to_list(deleted_users)],
    ).model_dump()
    _cache_set_json(cache_key, payload, 10)
    return payload
