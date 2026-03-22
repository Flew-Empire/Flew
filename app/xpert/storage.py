import json
import os
import logging
from typing import List, Optional
from datetime import datetime

from app.xpert.models import SubscriptionSource, AggregatedConfig

logger = logging.getLogger(__name__)

DATA_DIR = os.environ.get("XPERT_DATA_DIR", "/var/lib/xpert")


class XpertStorage:
    """Файловое хранилище для Xpert"""
    
    def __init__(self):
        self.data_dir = DATA_DIR
        self.sources_file = os.path.join(self.data_dir, "sources.json")
        self.configs_file = os.path.join(self.data_dir, "configs.json")
        self._ensure_data_dir()
    
    def _ensure_data_dir(self):
        """Создание директории для данных"""
        try:
            os.makedirs(self.data_dir, exist_ok=True)
        except Exception as e:
            logger.warning(f"Could not create data dir {self.data_dir}: {e}")
            self.data_dir = "/tmp/xpert"
            self.sources_file = os.path.join(self.data_dir, "sources.json")
            self.configs_file = os.path.join(self.data_dir, "configs.json")
            os.makedirs(self.data_dir, exist_ok=True)
    
    def _load_json(self, filepath: str) -> list:
        """Загрузка JSON файла"""
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load {filepath}: {e}")
        return []
    
    def _save_json(self, filepath: str, data: list):
        """Сохранение JSON файла"""
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Failed to save {filepath}: {e}")
    
    # Sources
    def get_sources(self) -> List[SubscriptionSource]:
        """Получение всех источников"""
        data = self._load_json(self.sources_file)
        return [SubscriptionSource.from_dict(d) for d in data]
    
    def get_enabled_sources(self) -> List[SubscriptionSource]:
        """Получение активных источников"""
        return [s for s in self.get_sources() if s.enabled]
    
    def add_source(self, name: str, url: str, priority: int = 1) -> SubscriptionSource:
        """Добавление источника"""
        sources = self.get_sources()
        new_id = max([s.id for s in sources], default=0) + 1
        source = SubscriptionSource(
            id=new_id,
            name=name,
            url=url,
            priority=priority,
            enabled=True,
            created_at=datetime.utcnow().isoformat()
        )
        sources.append(source)
        self._save_json(self.sources_file, [s.to_dict() for s in sources])
        logger.info(f"Added source: {name}")
        return source
    
    def update_source(self, source: SubscriptionSource):
        """Обновление источника"""
        sources = self.get_sources()
        for i, s in enumerate(sources):
            if s.id == source.id:
                sources[i] = source
                break
        self._save_json(self.sources_file, [s.to_dict() for s in sources])
    
    def delete_source(self, source_id: int) -> bool:
        """Удаление источника"""
        sources = self.get_sources()
        new_sources = [s for s in sources if s.id != source_id]
        if len(new_sources) < len(sources):
            self._save_json(self.sources_file, [s.to_dict() for s in new_sources])
            # Also remove configs that belong to this source, so Active Configurations
            # does not keep orphan rows after source deletion.
            configs = self.get_configs()
            filtered_configs = [c for c in configs if c.source_id != source_id]
            self.save_configs(filtered_configs)
            return True
        return False
    
    def toggle_source(self, source_id: int) -> Optional[SubscriptionSource]:
        """Включение/выключение источника"""
        sources = self.get_sources()
        for source in sources:
            if source.id == source_id:
                source.enabled = not source.enabled
                self._save_json(self.sources_file, [s.to_dict() for s in sources])
                return source
        return None
    
    # Configs
    def get_configs(self) -> List[AggregatedConfig]:
        """Получение всех конфигов"""
        data = self._load_json(self.configs_file)
        return [AggregatedConfig.from_dict(d) for d in data]
    
    def get_active_configs(self) -> List[AggregatedConfig]:
        """Получение активных конфигов"""
        configs = self.get_configs()
        active = [c for c in configs if (c.is_active or c.is_permanent)]
        return sorted(active, key=lambda c: c.ping_ms)

    def get_config_by_id(self, config_id: int) -> Optional[AggregatedConfig]:
        configs = self.get_configs()
        return next((c for c in configs if c.id == config_id), None)

    def update_config_status(
        self,
        config_id: int,
        is_active: Optional[bool] = None,
        is_permanent: Optional[bool] = None,
    ) -> Optional[AggregatedConfig]:
        configs = self.get_configs()
        updated = None
        for cfg in configs:
            if cfg.id != config_id:
                continue
            if is_active is not None:
                cfg.is_active = is_active
            if is_permanent is not None:
                cfg.is_permanent = is_permanent
                if is_permanent:
                    cfg.is_active = True
            updated = cfg
            break
        if updated:
            self._save_json(self.configs_file, [c.to_dict() for c in configs])
        return updated
    
    def save_configs(self, configs: List[AggregatedConfig]):
        """Сохранение всех конфигов"""
        self._save_json(self.configs_file, [c.to_dict() for c in configs])
    
    def clear_configs(self):
        """Очистка конфигов"""
        self._save_json(self.configs_file, [])
    
    def get_stats(self) -> dict:
        """Получение статистики"""
        sources = self.get_sources()
        configs = self.get_configs()
        active_configs = [c for c in configs if (c.is_active or c.is_permanent)]
        
        return {
            "total_sources": len(sources),
            "enabled_sources": len([s for s in sources if s.enabled]),
            "total_configs": len(configs),
            "active_configs": len(active_configs),
            "avg_ping": sum(c.ping_ms for c in active_configs) / len(active_configs) if active_configs else 0
        }


storage = XpertStorage()
