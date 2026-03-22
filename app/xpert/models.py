from dataclasses import dataclass, field, asdict, fields
from datetime import datetime
from typing import List, Optional


@dataclass
class UserPingStats:
    """Статистика пингов от пользователей"""
    server: str = ""
    port: int = 0
    protocol: str = ""
    user_id: int = 0
    ping_ms: float = 999.0
    success_count: int = 0
    fail_count: int = 0
    last_ping: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    
    @property
    def success_rate(self) -> float:
        total = self.success_count + self.fail_count
        if total == 0:
            return 0.0
        return (self.success_count / total) * 100
    
    @property
    def avg_ping(self) -> float:
        return self.ping_ms
    
    def is_healthy(self, min_success_rate: float = 70.0, max_ping: float = 1000.0) -> bool:
        """Проверка здоровья сервера на основе статистики"""
        return (
            self.success_rate >= min_success_rate and
            self.avg_ping <= max_ping and
            self.success_count > 0
        )
    
    def to_dict(self):
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: dict):
        return cls(**data)


@dataclass
class SubscriptionSource:
    id: int = 0
    name: str = ""
    url: str = ""
    enabled: bool = True
    priority: int = 1
    last_fetched: Optional[str] = None
    config_count: int = 0
    success_rate: float = 0.0
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    
    def to_dict(self):
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: dict):
        return cls(**data)


@dataclass
class AggregatedConfig:
    id: int = 0
    raw: str = ""
    protocol: str = ""
    server: str = ""
    port: int = 0
    remarks: str = ""
    source_id: int = 0
    ping_ms: float = 999.0
    jitter_ms: float = 0.0
    packet_loss: float = 0.0
    is_active: bool = False
    is_permanent: bool = False
    last_check: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    
    def to_dict(self):
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: dict):
        return cls(**data)


@dataclass
class DirectConfig:
    """Одиночная конфигурация, добавляемая напрямую в обход белого списка"""
    id: int = 0
    raw: str = ""
    protocol: str = ""
    server: str = ""
    port: int = 0
    remarks: str = ""
    ping_ms: float = 999.0
    jitter_ms: float = 0.0
    packet_loss: float = 0.0
    is_active: bool = True
    is_permanent: bool = False
    bypass_whitelist: bool = True  # Всегда обходить белый список
    auto_sync_to_core: bool = True  # Автоматически синхронизировать с Xpert Core
    added_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    added_by: str = "admin"  # Кто добавил конфигурацию
    
    def to_dict(self):
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: dict):
        payload = dict(data or {})
        if "auto_sync_to_core" not in payload and "auto_sync_to_marzban" in payload:
            payload["auto_sync_to_core"] = payload.get("auto_sync_to_marzban")
        allowed = {f.name for f in fields(cls)}
        cleaned = {k: v for k, v in payload.items() if k in allowed}
        return cls(**cleaned)
