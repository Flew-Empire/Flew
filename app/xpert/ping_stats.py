"""
Сервис сбора и анализа статистики пингов от пользователей
"""

import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from collections import defaultdict

from app.xpert.models import UserPingStats, AggregatedConfig
from app.xpert.storage import storage
import config as app_config

logger = logging.getLogger(__name__)


class PingStatsService:
    """Сервис управления статистикой пингов"""
    
    def __init__(self):
        self.stats_file = "xpert_ping_stats.json"
        self.stats_data = self._load_stats()
    
    def _load_stats(self) -> Dict:
        """Загрузка статистики из файла"""
        try:
            with open(self.stats_file, 'r') as f:
                data = json.load(f)
                return {
                    'user_stats': [UserPingStats.from_dict(item) for item in data.get('user_stats', [])],
                    'last_cleanup': data.get('last_cleanup', datetime.utcnow().isoformat())
                }
        except (FileNotFoundError, json.JSONDecodeError):
            return {'user_stats': [], 'last_cleanup': datetime.utcnow().isoformat()}
    
    def _save_stats(self):
        """Сохранение статистики в файл"""
        try:
            data = {
                'user_stats': [stat.to_dict() for stat in self.stats_data['user_stats']],
                'last_cleanup': self.stats_data['last_cleanup']
            }
            with open(self.stats_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save ping stats: {e}")
    
    def record_ping(self, server: str, port: int, protocol: str, user_id: int, 
                   ping_ms: float, success: bool):
        """Запись результата пинга от пользователя"""
        try:
            # Ищем существующую статистику
            existing_stat = None
            for stat in self.stats_data['user_stats']:
                if (stat.server == server and 
                    stat.port == port and 
                    stat.protocol == protocol and 
                    stat.user_id == user_id):
                    existing_stat = stat
                    break
            
            if existing_stat:
                # Обновляем существующую статистику
                existing_stat.ping_ms = ping_ms
                existing_stat.last_ping = datetime.utcnow().isoformat()
                if success:
                    existing_stat.success_count += 1
                else:
                    existing_stat.fail_count += 1
            else:
                # Создаем новую запись
                new_stat = UserPingStats(
                    server=server,
                    port=port,
                    protocol=protocol,
                    user_id=user_id,
                    ping_ms=ping_ms,
                    success_count=1 if success else 0,
                    fail_count=0 if success else 1
                )
                self.stats_data['user_stats'].append(new_stat)
            
            self._save_stats()
            logger.debug(f"Recorded ping: {server}:{port} - {ping_ms}ms - {'success' if success else 'fail'}")
            
        except Exception as e:
            logger.error(f"Failed to record ping: {e}")
    
    def get_server_health(self, server: str, port: int, protocol: str, 
                         min_users: int = 3) -> Dict:
        """Получение статистики здоровья сервера"""
        server_stats = [
            stat for stat in self.stats_data['user_stats']
            if (stat.server == server and 
                stat.port == port and 
                stat.protocol == protocol)
        ]
        
        if len(server_stats) < min_users:
            return {
                'healthy': None,  # Недостаточно данных
                'avg_ping': 999.0,
                'success_rate': 0.0,
                'total_pings': len(server_stats),
                'unique_users': len(set(stat.user_id for stat in server_stats))
            }
        
        # Агрегируем статистику
        total_success = sum(stat.success_count for stat in server_stats)
        total_fail = sum(stat.fail_count for stat in server_stats)
        total_pings = total_success + total_fail
        
        if total_pings == 0:
            return {
                'healthy': False,
                'avg_ping': 999.0,
                'success_rate': 0.0,
                'total_pings': 0,
                'unique_users': len(set(stat.user_id for stat in server_stats))
            }
        
        success_rate = (total_success / total_pings) * 100
        avg_ping = sum(stat.ping_ms for stat in server_stats) / len(server_stats)
        
        # Проверяем здоровье
        healthy = (
            success_rate >= 70.0 and  # Минимум 70% успехов
            avg_ping <= 1000.0 and     # Максимум 1000мс пинг
            len(set(stat.user_id for stat in server_stats)) >= min_users
        )
        
        return {
            'healthy': healthy,
            'avg_ping': avg_ping,
            'success_rate': success_rate,
            'total_pings': total_pings,
            'unique_users': len(set(stat.user_id for stat in server_stats))
        }
    
    def get_top_configs(self, configs: List[AggregatedConfig], limit: int = 10) -> List[AggregatedConfig]:
        """Получение топ-N конфигов на основе статистики"""
        import config as app_config
        
        # Если динамическая фильтрация отключена, возвращаем первые N
        if not app_config.XPERT_USE_DYNAMIC_FILTERING:
            return configs[:limit]
        
        # Оцениваем каждый конфиг
        scored_configs = []
        min_users = app_config.XPERT_MIN_USERS_FOR_STATS
        
        for config in configs:
            health = self.get_server_health(config.server, config.port, config.protocol, min_users)
            
            if health['healthy'] is None:
                # Нет статистики - используем оригинальные метрики
                if config.is_active:
                    score = self._calculate_original_score(config)
                else:
                    score = -1  # Неактивные не попадают в топ
            else:
                # Есть статистика - используем реальные метрики
                if health['healthy']:
                    score = self._calculate_stats_score(health, config)
                else:
                    score = -1  # Нездоровые не попадают в топ
            
            if score > 0:
                scored_configs.append((config, score))
        
        # Сортируем по убыванию score и берем топ-N
        scored_configs.sort(key=lambda x: x[1], reverse=True)
        top_configs = [config for config, score in scored_configs[:limit]]
        
        return top_configs
    
    def _calculate_original_score(self, config: AggregatedConfig) -> float:
        """Расчет score на основе оригинальных метрик"""
        # Меньше пинг = выше score
        ping_score = max(0, 1000 - config.ping_ms) / 1000 * 50
        
        # Меньше потеря пакетов = выше score  
        loss_score = max(0, 100 - config.packet_loss) / 100 * 30
        
        # Активность = бонус
        active_score = 20 if config.is_active else 0
        
        return ping_score + loss_score + active_score
    
    def _calculate_stats_score(self, health: Dict, config: AggregatedConfig) -> float:
        """Расчет score на основе статистики пользователей"""
        # Success rate (70%+ = хорошо)
        success_score = health['success_rate'] / 100 * 40
        
        # Ping (меньше = лучше)
        ping_score = max(0, 1000 - health['avg_ping']) / 1000 * 35
        
        # Количество пользователей (больше = надежнее)
        users_score = min(25, health['unique_users'])  # До 25 баллов
        
        return success_score + ping_score + users_score
    
    def get_healthy_configs(self, configs: List[AggregatedConfig]) -> List[AggregatedConfig]:
        """Фильтрация конфигов на основе реальной статистики пингов"""
        import config as app_config
        
        # Если динамическая фильтрация отключена, возвращаем все конфиги
        if not app_config.XPERT_USE_DYNAMIC_FILTERING:
            return configs
        
        healthy_configs = []
        min_users = app_config.XPERT_MIN_USERS_FOR_STATS
        
        for config in configs:
            health = self.get_server_health(config.server, config.port, config.protocol, min_users)
            
            # Если нет статистики, используем оригинальную проверку
            if health['healthy'] is None:
                if config.is_active:  # Используем оригинальную проверку пинга
                    healthy_configs.append(config)
            else:
                # Используем реальную статистику пользователей
                if health['healthy']:
                    healthy_configs.append(config)
                    logger.debug(f"Config {config.server}:{config.port} is healthy (user stats)")
                else:
                    logger.debug(f"Config {config.server}:{config.port} is unhealthy (user stats)")
        
        return healthy_configs
    
    def cleanup_old_stats(self, days: int = 7):
        """Очистка старой статистики"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            original_count = len(self.stats_data['user_stats'])
            
            self.stats_data['user_stats'] = [
                stat for stat in self.stats_data['user_stats']
                if datetime.fromisoformat(stat.created_at) > cutoff_date
            ]
            
            self.stats_data['last_cleanup'] = datetime.utcnow().isoformat()
            self._save_stats()
            
            cleaned_count = original_count - len(self.stats_data['user_stats'])
            if cleaned_count > 0:
                logger.info(f"Cleaned up {cleaned_count} old ping stats (older than {days} days)")
                
        except Exception as e:
            logger.error(f"Failed to cleanup old stats: {e}")
    
    def get_stats_summary(self) -> Dict:
        """Получение сводной статистики"""
        total_stats = len(self.stats_data['user_stats'])
        unique_servers = len(set(
            (stat.server, stat.port, stat.protocol) 
            for stat in self.stats_data['user_stats']
        ))
        unique_users = len(set(stat.user_id for stat in self.stats_data['user_stats']))
        
        return {
            'total_ping_records': total_stats,
            'unique_servers': unique_servers,
            'unique_users': unique_users,
            'last_cleanup': self.stats_data['last_cleanup']
        }


# Глобальный экземпляр сервиса
ping_stats_service = PingStatsService()
