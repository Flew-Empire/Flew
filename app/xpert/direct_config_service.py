"""
Сервис для управления прямыми конфигурациями
Обход белого списка и прямая синхронизация с Xpert Core
"""

import logging
import json
import os
import base64
import random
import re
import time
import threading
from typing import List, Optional, Dict
from urllib.parse import quote, urlparse, urlunparse
from datetime import datetime

from app.xpert.models import DirectConfig
from app.xpert.checker import checker

logger = logging.getLogger(__name__)


class DirectConfigService:
    """Сервис для управления прямыми конфигурациями"""
    
    def __init__(self):
        self.storage_file = "data/direct_configs.json"
        self.configs: List[DirectConfig] = []
        self.next_id = 1
        self._lock = threading.RLock()
        self._last_ping_refresh_ts = 0.0
        # Refresh pings in background every 30 minutes. Manual refresh can still force.
        self._ping_refresh_interval_sec = 30 * 60
        self._auto_ping_interval_sec = 30 * 60
        self._stop_event = threading.Event()
        self._load_configs()
        self._apply_auto_names(save=True)
        self._start_auto_ping()

    def _start_auto_ping(self) -> None:
        t = threading.Thread(target=self._auto_ping_loop, name="direct-configs-auto-ping", daemon=True)
        t.start()

    def _auto_ping_loop(self) -> None:
        # Small delay on startup to avoid fighting with initial load.
        self._stop_event.wait(30)
        while not self._stop_event.is_set():
            try:
                self.refresh_all_pings(force=True)
            except Exception as e:
                logger.warning(f"Auto ping refresh failed: {e}")
            self._stop_event.wait(self._auto_ping_interval_sec)
    
    def _load_configs(self):
        """Загрузка конфигураций из файла"""
        try:
            os.makedirs(os.path.dirname(self.storage_file), exist_ok=True)
            
            if os.path.exists(self.storage_file):
                with open(self.storage_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                with self._lock:
                    self.configs = [DirectConfig.from_dict(config_data) for config_data in data.get('configs', [])]
                    self.next_id = data.get('next_id', 1)
                
                logger.info(f"Loaded {len(self.configs)} direct configs")
            else:
                with self._lock:
                    self.configs = []
                    self.next_id = 1
                
        except Exception as e:
            logger.error(f"Failed to load direct configs: {e}")
            with self._lock:
                self.configs = []
                self.next_id = 1
    
    def _save_configs(self):
        """Сохранение конфигураций в файл"""
        try:
            os.makedirs(os.path.dirname(self.storage_file), exist_ok=True)
            
            with self._lock:
                data = {
                    'configs': [config.to_dict() for config in self.configs],
                    'next_id': self.next_id
                }
            
            with open(self.storage_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                
            logger.info(f"Saved {len(self.configs)} direct configs")
            
        except Exception as e:
            logger.error(f"Failed to save direct configs: {e}")
    
    _flag_codes = [
        "AE", "AZ", "BY", "BE", "BR", "CA", "CH", "CN", "CZ", "DE",
        "ES", "FI", "FR", "GB", "GE", "HK", "IN", "IR", "IT", "JP",
        "KR", "KZ", "NL", "NO", "PL", "RU", "SE", "SG", "TM", "TR",
        "UA", "US", "UZ",
    ]

    def _flag_from_code(self, code: str) -> str:
        code = code.upper()
        if len(code) != 2:
            return ""
        return chr(0x1F1E6 + (ord(code[0]) - ord("A"))) + chr(0x1F1E6 + (ord(code[1]) - ord("A")))



    def _format_auto_name(self, index: int, flag: str) -> str:
        return f"{flag} SR-{index:03d}"

    def _extract_flag(self, text: str) -> Optional[str]:
        if not text:
            return None
        match = re.search(r'[\U0001F1E6-\U0001F1FF]{2}', text)
        return match.group(0) if match else None

    def _get_existing_flag(self, config: DirectConfig) -> Optional[str]:
        flag = self._extract_flag(config.remarks or "")
        if flag:
            return flag
        try:
            _, _, _, remarks = checker.parse_config(config.raw)
            flag = self._extract_flag(remarks)
            if flag:
                return flag
        except Exception:
            pass
        return None

    def _update_raw_name(self, raw: str, protocol: str, name: str) -> str:
        try:
            if protocol == "vmess":
                import json as _json
                encoded = raw.replace("vmess://", "")
                padding = 4 - len(encoded) % 4
                if padding != 4:
                    encoded += "=" * padding
                decoded = base64.b64decode(encoded).decode("utf-8")
                data = _json.loads(decoded)
                data["ps"] = name
                new_encoded = base64.b64encode(_json.dumps(data, separators=(",", ":")).encode()).decode()
                new_encoded = new_encoded.rstrip("=")
                return "vmess://" + new_encoded

            parsed = urlparse(raw)
            if not parsed.scheme:
                return raw
            new_fragment = quote(name, safe="")
            return urlunparse(parsed._replace(fragment=new_fragment))
        except Exception:
            return raw

    def _apply_auto_names(self, save: bool = True):
        with self._lock:
            changed = False
            for idx, config in enumerate(self.configs, start=1):
                flag = self._get_existing_flag(config)
                if not flag:
                    flag = self._flag_from_code(random.choice(self._flag_codes))
                name = self._format_auto_name(idx, flag)
                if config.remarks != name:
                    config.remarks = name
                    changed = True
                new_raw = self._update_raw_name(config.raw, config.protocol, name)
                if new_raw != config.raw:
                    config.raw = new_raw
                    changed = True
        if changed and save:
            self._save_configs()


    def add_config(self, raw: str, remarks: Optional[str] = None, added_by: str = "admin") -> DirectConfig:
        """Добавление новой прямой конфигурации"""
        try:
            # Парсинг и валидация конфига
            result = checker.process_config(raw)
            
            if not result:
                raise ValueError("Invalid configuration format")
            
            # Создание объекта конфигурации
            config = DirectConfig(
                id=self.next_id,
                raw=raw,
                protocol=result["protocol"],
                server=result["server"],
                port=result["port"],
                remarks=remarks or result["remarks"],
                ping_ms=result["ping_ms"],
                jitter_ms=result["jitter_ms"],
                packet_loss=result["packet_loss"],
                is_active=result["is_active"],
                is_permanent=False,
                bypass_whitelist=True,  # Всегда обходить белый список
                auto_sync_to_core=True,  # Автоматически синхронизировать
                added_at=datetime.utcnow().isoformat(),
                added_by=added_by
            )
            
            with self._lock:
                self.configs.append(config)
                self.next_id += 1
            self._save_configs()
            self._apply_auto_names(save=True)
            
            logger.info(f"Added direct config: {config.protocol}://{config.server}:{config.port}")
            return config
            
        except Exception as e:
            logger.error(f"Failed to add direct config: {e}")
            raise
    
    def get_all_configs(self) -> List[DirectConfig]:
        """Получение всех прямых конфигураций"""
        with self._lock:
            return self.configs.copy()
    
    def get_active_configs(self) -> List[DirectConfig]:
        """Получение активных прямых конфигураций"""
        with self._lock:
            return [config for config in self.configs if (config.is_active or config.is_permanent)]
    
    def get_config_by_id(self, config_id: int) -> Optional[DirectConfig]:
        """Получение конфигурации по ID"""
        with self._lock:
            return next((config for config in self.configs if config.id == config_id), None)
    
    def toggle_config(self, config_id: int) -> Optional[DirectConfig]:
        """Переключение статуса конфигурации"""
        with self._lock:
            config = next((c for c in self.configs if c.id == config_id), None)
            if config:
                config.is_active = not config.is_active
                if not config.is_active and config.is_permanent:
                    config.is_permanent = False
                self._save_configs()
                logger.info(f"Toggled direct config {config_id}: {config.is_active}")
            return config

    def set_permanent(self, config_id: int, is_permanent: bool) -> Optional[DirectConfig]:
        """Установка/снятие признака постоянной конфигурации"""
        with self._lock:
            config = next((c for c in self.configs if c.id == config_id), None)
            if config:
                config.is_permanent = bool(is_permanent)
                if config.is_permanent:
                    config.is_active = True
                self._save_configs()
                logger.info(f"Set permanent direct config {config_id}: {config.is_permanent}")
            return config
    
    def delete_config(self, config_id: int) -> bool:
        """Удаление конфигурации"""
        with self._lock:
            config = next((c for c in self.configs if c.id == config_id), None)
            if config:
                self.configs.remove(config)
                self._save_configs()
                self._apply_auto_names(save=True)
                logger.info(f"Deleted direct config {config_id}")
                return True
            return False
    
    def update_config(self, config_id: int, raw: Optional[str] = None, remarks: Optional[str] = None, added_by: Optional[str] = None) -> Optional[DirectConfig]:
        """Обновление прямой конфигурации"""
        with self._lock:
            config = next((c for c in self.configs if c.id == config_id), None)
            if not config:
                return None

            if raw is not None:
                raw = raw.strip()
                if not raw:
                    raise ValueError("Raw config cannot be empty")
                result = checker.process_config(raw)
                if not result:
                    raise ValueError("Invalid configuration format")

                config.raw = raw
                config.protocol = result["protocol"]
                config.server = result["server"]
                config.port = result["port"]
                config.ping_ms = result["ping_ms"]
                config.jitter_ms = result["jitter_ms"]
                config.packet_loss = result["packet_loss"]
                config.is_active = result["is_active"]
                if config.is_permanent:
                    config.is_active = True
                if remarks is None:
                    config.remarks = result["remarks"]

            if remarks is not None:
                config.remarks = remarks

            if added_by is not None:
                config.added_by = added_by

            self._save_configs()
            self._apply_auto_names(save=True)
            logger.info(f"Updated direct config {config_id}")
            return config

    def move_config(self, config_id: int, direction: str) -> Optional[List[DirectConfig]]:
        """Перемещение конфигурации вверх/вниз в списке"""
        with self._lock:
            index = next((i for i, c in enumerate(self.configs) if c.id == config_id), None)
            if index is None:
                return None

            if direction == "up":
                if index == 0:
                    return self.configs
                self.configs[index - 1], self.configs[index] = self.configs[index], self.configs[index - 1]
            elif direction == "down":
                if index >= len(self.configs) - 1:
                    return self.configs
                self.configs[index + 1], self.configs[index] = self.configs[index], self.configs[index + 1]
            else:
                raise ValueError("Invalid direction. Use up or down.")

            self._save_configs()
            self._apply_auto_names(save=True)
            logger.info(f"Moved direct config {config_id} {direction}")
            return self.configs

    def reorder_config(self, source_id: int, target_id: int) -> Optional[List[DirectConfig]]:
        """Перемещает элемент source_id на позицию target_id (drag&drop)."""
        if source_id == target_id:
            return self.get_all_configs()

        with self._lock:
            src_index = next((i for i, c in enumerate(self.configs) if c.id == source_id), None)
            dst_index = next((i for i, c in enumerate(self.configs) if c.id == target_id), None)
            if src_index is None or dst_index is None:
                return None
            item = self.configs.pop(src_index)
            # if moving down, after pop the dst index shifts left by 1
            if src_index < dst_index:
                dst_index -= 1
            self.configs.insert(dst_index, item)
            self._save_configs()
            self._apply_auto_names(save=True)
            logger.info(f"Reordered direct config {source_id} -> before {target_id}")
            return self.configs

    def move_configs(self, config_ids: List[int], direction: str) -> List[DirectConfig]:
        """Массовое перемещение выбранных конфигов на 1 позицию как блоки."""
        if not config_ids:
            return self.configs

        selected = set(config_ids)

        with self._lock:
            if direction == "up":
                for i in range(1, len(self.configs)):
                    if self.configs[i].id in selected and self.configs[i - 1].id not in selected:
                        self.configs[i - 1], self.configs[i] = self.configs[i], self.configs[i - 1]
            elif direction == "down":
                for i in range(len(self.configs) - 2, -1, -1):
                    if self.configs[i].id in selected and self.configs[i + 1].id not in selected:
                        self.configs[i], self.configs[i + 1] = self.configs[i + 1], self.configs[i]
            else:
                raise ValueError("Invalid direction. Use up or down.")

            self._save_configs()
            self._apply_auto_names(save=True)
            logger.info(f"Moved {len(config_ids)} direct configs {direction}")
            return self.configs


    def update_config_ping(self, config_id: int, ping_ms: float, packet_loss: float = 0.0):
        """Обновление пинга и потерь для конфигурации"""
        with self._lock:
            config = next((c for c in self.configs if c.id == config_id), None)
            if config:
                config.ping_ms = ping_ms
                config.packet_loss = packet_loss
                self._save_configs()

    def refresh_all_pings(self, force: bool = False) -> None:
        """Переизмеряет ping/status для direct configs с ограничением частоты."""
        now = time.time()
        if not force and (now - self._last_ping_refresh_ts) < self._ping_refresh_interval_sec:
            return

        disabled_ids: List[int] = []
        changed = False
        with self._lock:
            for config in self.configs:
                try:
                    prev_active = bool(config.is_active)
                    ok, ping_ms = checker.probe_endpoint_sync(
                        config.raw, config.protocol, config.server, config.port, timeout=2.5
                    )
                    new_ping = float(ping_ms if ok else 999.0)
                    new_loss = 0.0 if ok else 100.0
                    new_active = bool(ok)

                    if prev_active and not new_active:
                        disabled_ids.append(config.id)

                    if (
                        config.ping_ms != new_ping
                        or config.packet_loss != new_loss
                        or config.is_active != new_active
                    ):
                        config.ping_ms = new_ping
                        config.packet_loss = new_loss
                        config.is_active = new_active
                        changed = True
                except Exception as e:
                    logger.debug(f"Ping refresh failed for config {config.id}: {e}")

            # Ensure all inactive configs (including ping=999) are grouped at the bottom.
            # This guarantees "disabled configs go to the end" even if they were disabled earlier.
            active_list = [c for c in self.configs if bool(c.is_active or c.is_permanent)]
            inactive_list = [c for c in self.configs if not bool(c.is_active or c.is_permanent)]
            new_list = active_list + inactive_list
            if [c.id for c in new_list] != [c.id for c in self.configs]:
                self.configs = new_list
                changed = True

        self._last_ping_refresh_ts = now
        if changed:
            self._save_configs()
    
    def get_configs_for_subscription(self) -> List[DirectConfig]:
        """Получение конфигураций для подписки (только активные)"""
        with self._lock:
            return [config for config in self.configs if (config.is_active or config.is_permanent)]
    
    def get_stats(self) -> Dict:
        """Получение статистики прямых конфигураций"""
        with self._lock:
            total = len(self.configs)
            active = len([c for c in self.configs if (c.is_active or c.is_permanent)])

            # Статистика по протоколам
            protocols: Dict[str, int] = {}
            for config in self.configs:
                protocol = config.protocol.upper()
                protocols[protocol] = protocols.get(protocol, 0) + 1

            bypass_count = len([c for c in self.configs if c.bypass_whitelist])
            sync_count = len([c for c in self.configs if c.auto_sync_to_core])

        return {
            "total_configs": total,
            "active_configs": active,
            "inactive_configs": total - active,
            "protocols": protocols,
            "bypass_whitelist_count": bypass_count,
            "auto_sync_count": sync_count
        }


# Глобальный экземпляр сервиса
direct_config_service = DirectConfigService()
