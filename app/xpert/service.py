import asyncio
import base64
import logging
import json
import os
from datetime import datetime
from typing import List, Optional

from app.xpert.models import SubscriptionSource, AggregatedConfig
from app.xpert.storage import storage
from app.xpert.checker import checker
from app.xpert.xpert_core_integration import xpert_core_integration
from app.xpert.direct_config_service import direct_config_service
import config as app_config

logger = logging.getLogger(__name__)


class XpertService:
    """Сервис агрегации подписок"""

    def __init__(self):
        self.runtime_file = "data/xpert_runtime.json"
        self._load_runtime_settings()

    def _load_runtime_settings(self):
        """Загружает runtime-настройки Xpert."""
        try:
            if not os.path.exists(self.runtime_file):
                return
            with open(self.runtime_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            target_ips = data.get("target_ips")
            if isinstance(target_ips, list):
                normalized = [str(ip).strip() for ip in target_ips if str(ip).strip()]
                if normalized:
                    app_config.XPERT_TARGET_CHECK_IPS = normalized
                    checker.target_ips = normalized
        except Exception as e:
            logger.warning(f"Failed to load runtime settings: {e}")

    def _save_runtime_settings(self):
        try:
            os.makedirs(os.path.dirname(self.runtime_file), exist_ok=True)
            payload = {
                "target_ips": list(app_config.XPERT_TARGET_CHECK_IPS),
                "updated_at": datetime.utcnow().isoformat(),
            }
            with open(self.runtime_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save runtime settings: {e}")

    def get_target_ips(self) -> List[str]:
        return list(app_config.XPERT_TARGET_CHECK_IPS)

    def set_target_ips(self, target_ips: List[str]) -> List[str]:
        normalized = []
        for item in target_ips:
            val = str(item).strip()
            if val:
                normalized.append(val)
        # remove duplicates preserving order
        unique = list(dict.fromkeys(normalized))
        if not unique:
            raise ValueError("Target IP list cannot be empty")
        app_config.XPERT_TARGET_CHECK_IPS = unique
        checker.target_ips = unique
        if hasattr(checker, "_target_probe_cache"):
            checker._target_probe_cache = {"ts": 0.0, "ok": False, "avg_ping": 999.0, "success_count": 0}
        self._save_runtime_settings()
        return unique
    
    def add_source(self, name: str, url: str, priority: int = 1) -> SubscriptionSource:
        """Добавление источника подписки"""
        return storage.add_source(name, url, priority)
    
    def get_sources(self) -> List[SubscriptionSource]:
        """Получение всех источников"""
        return storage.get_sources()
    
    def get_enabled_sources(self) -> List[SubscriptionSource]:
        """Получение активных источников"""
        return storage.get_enabled_sources()
    
    def toggle_source(self, source_id: int) -> Optional[SubscriptionSource]:
        """Включение/выключение источника"""
        return storage.toggle_source(source_id)
    
    def delete_source(self, source_id: int) -> bool:
        """Удаление источника"""
        deleted = storage.delete_source(source_id)
        if not deleted:
            return False
        # Re-sync with remaining enabled sources so Active Configurations and
        # generated subscriptions are immediately consistent.
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self.update_subscription())
            else:
                loop.run_until_complete(self.update_subscription())
        except RuntimeError:
            asyncio.run(self.update_subscription())
        except Exception as e:
            logger.warning(f"Failed to refresh after deleting source {source_id}: {e}")
        return True
    
    def get_active_configs(self) -> List[AggregatedConfig]:
        """Получение активных конфигураций"""
        return storage.get_active_configs()
    
    def get_all_configs(self) -> List[AggregatedConfig]:
        """Получение всех конфигураций"""
        return storage.get_configs()
    
    async def update_subscription(self) -> dict:
        """Обновление всех подписок"""
        sources = self.get_enabled_sources()
        
        if not sources:
            logger.warning("No enabled sources found")
            # If there are no enabled sources, clear aggregated source configs.
            # Direct Configurations are stored separately and are not touched.
            storage.clear_configs()
            return {"active_configs": 0, "total_configs": 0}
        
        all_configs = []
        total_configs = 0
        active_configs = 0
        config_id = 1
        existing_configs = {c.raw: c for c in storage.get_configs()}
        
        for source in sources:
            try:
                logger.info(f"Fetching configs from: {source.name} ({source.url})")
                raw_configs = await checker.fetch_subscription(source.url)
                logger.info(f"Fetched {len(raw_configs)} raw configs from {source.name}")
                
                source.last_fetched = datetime.utcnow().isoformat()
                source.config_count = len(raw_configs)
                
                source_active = 0
                for raw in raw_configs:
                    result = checker.process_config(raw)
                    if result:
                        previous = existing_configs.get(result["raw"])
                        is_active = previous.is_active if previous else result["is_active"]
                        is_permanent = previous.is_permanent if previous else False
                        if is_permanent:
                            is_active = True
                        config_obj = AggregatedConfig(
                            id=config_id,
                            raw=result["raw"],
                            protocol=result["protocol"],
                            server=result["server"],
                            port=result["port"],
                            remarks=result["remarks"],
                            source_id=source.id,
                            ping_ms=result["ping_ms"],
                            jitter_ms=result["jitter_ms"],
                            packet_loss=result["packet_loss"],
                            is_active=is_active,
                            is_permanent=is_permanent,
                            last_check=datetime.utcnow().isoformat()
                        )
                        all_configs.append(config_obj)
                        config_id += 1
                        total_configs += 1
                        if is_active:
                            active_configs += 1
                            source_active += 1
                
                source.success_rate = 100.0  # Все конфиги активные
                storage.update_source(source)
                
                logger.info(f"Source {source.name}: {source_active}/{len(raw_configs)} configs added")
                
            except Exception as e:
                logger.error(f"Failed to process source {source.name}: {e}")
                import traceback
                logger.error(traceback.format_exc())
                source.success_rate = 0
                storage.update_source(source)
        
        storage.save_configs(all_configs)
        logger.info(f"Subscription update complete: {active_configs}/{total_configs} active configs")
        
        # Синхронизация с Xpert Core
        try:
            sync_result = xpert_core_integration.sync_active_configs_to_core()
            logger.info(f"Xpert Core sync result: {sync_result}")
            # NOTE: do not cleanup hosts globally here.
            # Cleanup removed user-created and non-Xpert hosts unexpectedly.
        except Exception as e:
            logger.error(f"Xpert Core integration failed: {e}")
        
        return {"active_configs": active_configs, "total_configs": total_configs}
    
    def generate_subscription(self, format: str = "universal") -> str:
        """Генерация подписки в указанном формате с учетом прямых конфигураций"""
        # Получаем обычные активные конфиги
        regular_configs = self.get_active_configs()
        
        # Получаем прямые конфигурации (которые обходят белый список)
        direct_configs = direct_config_service.get_active_configs()
        
        # Объединяем все конфиги
        all_configs = regular_configs + direct_configs
        
        logger.info(f"Generating subscription: {len(regular_configs)} regular + {len(direct_configs)} direct configs")
        
        if format == "base64":
            content = "\n".join([c.raw for c in all_configs])
            return base64.b64encode(content.encode()).decode()
        else:
            return "\n".join([c.raw for c in all_configs])
    
    def get_stats(self) -> dict:
        """Получение статистики"""
        stats = storage.get_stats()
        direct_configs = direct_config_service.get_all_configs()
        direct_active = direct_config_service.get_active_configs()

        # Include direct configs in global totals shown by Xpert Statistics.
        stats["total_direct_configs"] = len(direct_configs)
        stats["active_direct_configs"] = len(direct_active)
        stats["total_configs"] = stats.get("total_configs", 0) + len(direct_configs)
        stats["active_configs"] = stats.get("active_configs", 0) + len(direct_active)

        active_regular = stats.get("active_configs", 0) - len(direct_active)
        weighted_ping_sum = stats.get("avg_ping", 0) * max(active_regular, 0) + sum(c.ping_ms for c in direct_active)
        total_active = stats.get("active_configs", 0)
        stats["avg_ping"] = weighted_ping_sum / total_active if total_active > 0 else 0

        stats["target_ips"] = app_config.XPERT_TARGET_CHECK_IPS
        stats["domain"] = app_config.XPERT_DOMAIN
        return stats


xpert_service = XpertService()
