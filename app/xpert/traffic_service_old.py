"""
Сервис для отслеживания и анализа трафика
Мониторинг использования внешних VPN серверов через Xpert
"""

import sqlite3
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass
import os

from config import XPERT_TRAFFIC_DB_PATH, XPERT_TRAFFIC_RETENTION_DAYS

logger = logging.getLogger(__name__)


@dataclass
class TrafficRecord:
    user_token: str
    config_server: str
    config_port: int
    protocol: str
    bytes_uploaded: int = 0
    bytes_downloaded: int = 0
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()


class TrafficService:
    """Сервис для управления статистикой трафика"""
    
    def __init__(self):
        self.db_path = XPERT_TRAFFIC_DB_PATH or "data/traffic_stats.db"
        self.retention_days = XPERT_TRAFFIC_RETENTION_DAYS or 0
        self._init_db()
    
    def _init_db(self):
        """Инициализация базы данных статистики"""
        try:
            # Создаем директорию если нет
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Создаем таблицу статистики
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS traffic_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_token TEXT NOT NULL,
                    config_server TEXT NOT NULL,
                    config_port INTEGER NOT NULL,
                    protocol TEXT NOT NULL,
                    bytes_uploaded INTEGER DEFAULT 0,
                    bytes_downloaded INTEGER DEFAULT 0,
                    date_collected DATE NOT NULL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_token, config_server, config_port, date_collected)
                )
            """)
            
            # Создаем индексы для быстрого поиска
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_token ON traffic_usage(user_token)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_server_port ON traffic_usage(config_server, config_port)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON traffic_usage(timestamp)")
            
            conn.commit()
            conn.close()
            
            logger.info(f"Traffic database initialized: {self.db_path}")
            
        except Exception as e:
            logger.error(f"Failed to initialize traffic database: {e}")
            raise
    
    def record_traffic_usage(self, user_token: str, config_server: str, 
                          config_port: int, protocol: str, 
                          bytes_uploaded: int = 0, bytes_downloaded: int = 0):
        """Записывает использование трафика"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # UPSERT - обновляем или вставляем запись за текущий день
            cursor.execute("""
                INSERT OR REPLACE INTO traffic_usage 
                (user_token, config_server, config_port, protocol, bytes_uploaded, bytes_downloaded, date_collected, timestamp)
                VALUES (?, ?, ?, ?, 
                    COALESCE((SELECT bytes_uploaded FROM traffic_usage 
                              WHERE user_token=? AND config_server=? AND config_port=? 
                              AND date_collected=DATE('now')), 0) + ?,
                    COALESCE((SELECT bytes_downloaded FROM traffic_usage 
                              WHERE user_token=? AND config_server=? AND config_port=? 
                              AND date_collected=DATE('now')), 0) + ?,
                    DATE('now'),
                    CURRENT_TIMESTAMP)
            """, (user_token, config_server, config_port, protocol,
                  user_token, config_server, config_port, bytes_uploaded,
                  user_token, config_server, config_port, bytes_downloaded))
            
            conn.commit()
            conn.close()
            
            logger.debug(f"Traffic recorded: {user_token} -> {config_server}:{config_port} "
                        f"↑{bytes_uploaded} ↓{bytes_downloaded}")
            
        except Exception as e:
            logger.error(f"Failed to record traffic usage: {e}")
            raise
    
    def get_user_traffic_stats(self, user_token: str, days: int = 30) -> Dict:
        """Получает статистику трафика пользователя"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT 
                    config_server,
                    config_port,
                    protocol,
                    SUM(bytes_uploaded) as total_upload,
                    SUM(bytes_downloaded) as total_download,
                    COUNT(*) as connection_count,
                    MAX(timestamp) as last_used
                FROM traffic_usage 
                WHERE user_token = ? AND timestamp >= datetime('now', '-{} days')
                GROUP BY config_server, config_port, protocol
                ORDER BY total_download DESC
            """.format(days), (user_token,))
            
            results = cursor.fetchall()
            conn.close()
            
            total_gb = sum((row[3] + row[4]) for row in results) / (1024**3)
            
            return {
                "user_token": user_token,
                "total_gb_used": round(total_gb, 3),
                "period_days": days,
                "servers": [
                    {
                        "server": row[0],
                        "port": row[1], 
                        "protocol": row[2],
                        "upload_gb": round(row[3] / (1024**3), 3),
                        "download_gb": round(row[4] / (1024**3), 3),
                        "total_gb": round((row[3] + row[4]) / (1024**3), 3),
                        "connections": row[5],
                        "last_used": row[6]
                    }
                    for row in results
                ]
            }
            
        except Exception as e:
            logger.error(f"Failed to get user traffic stats: {e}")
            return {
                "user_token": user_token,
                "total_gb_used": 0,
                "period_days": days,
                "servers": []
            }
    
    def get_global_stats(self, days: int = 30) -> Dict:
        """Глобальная статистика по всем пользователям"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT 
                    COUNT(DISTINCT user_token) as total_users,
                    COUNT(DISTINCT config_server || ':' || config_port) as total_servers,
                    SUM(bytes_uploaded + bytes_downloaded) as total_bytes,
                    COUNT(*) as total_connections,
                    COUNT(DISTINCT protocol) as total_protocols
                FROM traffic_usage 
                WHERE timestamp >= datetime('now', '-{} days')
            """.format(days))
            
            result = cursor.fetchone()
            
            # Получаем топ серверов по трафику
            cursor.execute("""
                SELECT 
                    config_server,
                    config_port,
                    protocol,
                    SUM(bytes_uploaded + bytes_downloaded) as total_bytes
                FROM traffic_usage 
                WHERE timestamp >= datetime('now', '-{} days')
                GROUP BY config_server, config_port, protocol
                ORDER BY total_bytes DESC
                LIMIT 10
            """.format(days))
            
            top_servers = cursor.fetchall()
            conn.close()
            
            return {
                "total_users": result[0],
                "total_servers": result[1], 
                "total_gb_used": round(result[2] / (1024**3), 3),
                "total_connections": result[3],
                "total_protocols": result[4],
                "period_days": days,
                "top_servers": [
                    {
                        "server": row[0],
                        "port": row[1],
                        "protocol": row[2],
                        "total_gb": round(row[3] / (1024**3), 3)
                    }
                    for row in top_servers
                ]
            }
            
        except Exception as e:
            logger.error(f"Failed to get global stats: {e}")
            return {
                "total_users": 0,
                "total_servers": 0,
                "total_gb_used": 0,
                "total_connections": 0,
                "total_protocols": 0,
                "period_days": days,
                "top_servers": []
            }
    
    def get_server_stats(self, server: str, port: int, days: int = 30) -> Dict:
        """Статистика по конкретному серверу"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT 
                    COUNT(DISTINCT user_token) as unique_users,
                    SUM(bytes_uploaded + bytes_downloaded) as total_bytes,
                    COUNT(*) as total_connections,
                    AVG(bytes_uploaded + bytes_downloaded) as avg_bytes_per_connection
                FROM traffic_usage 
                WHERE config_server = ? AND config_port = ? 
                AND timestamp >= datetime('now', '-{} days')
            """.format(days), (server, port))
            
            result = cursor.fetchone()
            
            # Ежедневная статистика
            cursor.execute("""
                SELECT 
                    date_collected as date,
                    SUM(bytes_uploaded + bytes_downloaded) as daily_bytes,
                    COUNT(DISTINCT user_token) as daily_users
                FROM traffic_usage 
                WHERE config_server = ? AND config_port = ? 
                AND timestamp >= datetime('now', '-{} days')
                GROUP BY date_collected
                ORDER BY date DESC
            """.format(days), (server, port))
            
            daily_stats = cursor.fetchall()
            conn.close()
            
            return {
                "server": server,
                "port": port,
                "period_days": days,
                "unique_users": result[0],
                "total_gb_used": round(result[1] / (1024**3), 3),
                "total_connections": result[2],
                "avg_gb_per_connection": round(result[3] / (1024**3), 3),
                "daily_stats": [
                    {
                        "date": row[0],
                        "total_gb": round(row[1] / (1024**3), 3),
                        "unique_users": row[2]
                    }
                    for row in daily_stats
                ]
            }
            
        except Exception as e:
            logger.error(f"Failed to get server stats: {e}")
            return {
                "server": server,
                "port": port,
                "period_days": days,
                "unique_users": 0,
                "total_gb_used": 0,
                "total_connections": 0,
                "avg_gb_per_connection": 0,
                "daily_stats": []
            }
    
    def cleanup_old_stats(self, days: int = None) -> Dict:
        """Очистка старой статистики"""
        try:
            cleanup_days = days or self.retention_days
            if cleanup_days <= 0:
                return {"status": "skipped", "reason": "retention disabled"}
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                DELETE FROM traffic_usage 
                WHERE timestamp < datetime('now', '-{} days')
            """.format(cleanup_days))
            
            deleted_rows = cursor.rowcount
            conn.commit()
            conn.close()
            
            logger.info(f"Cleaned up {deleted_rows} old traffic records (older than {cleanup_days} days)")
            
            return {
                "status": "success",
                "deleted_rows": deleted_rows,
                "cleanup_days": cleanup_days
            }
            
        except Exception as e:
            logger.error(f"Failed to cleanup old stats: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
    
    def get_database_info(self) -> Dict:
        """Информация о базе данных"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Размер таблицы
            cursor.execute("SELECT COUNT(*) FROM traffic_usage")
            total_records = cursor.fetchone()[0]
            
            # Уникальные пользователи
            cursor.execute("SELECT COUNT(DISTINCT user_token) FROM traffic_usage")
            unique_users = cursor.fetchone()[0]
            
            # Уникальные серверы
            cursor.execute("SELECT COUNT(DISTINCT config_server || ':' || config_port) FROM traffic_usage")
            unique_servers = cursor.fetchone()[0]
            
            # Размер файла БД
            db_size = os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0
            
            conn.close()
            
            return {
                "database_path": self.db_path,
                "total_records": total_records,
                "unique_users": unique_users,
                "unique_servers": unique_servers,
                "database_size_mb": round(db_size / (1024*1024), 2),
                "retention_days": self.retention_days
            }
            
        except Exception as e:
            logger.error(f"Failed to get database info: {e}")
            return {
                "database_path": self.db_path,
                "total_records": 0,
                "unique_users": 0,
                "unique_servers": 0,
                "database_size_mb": 0,
                "retention_days": self.retention_days,
                "error": str(e)
            }
    
    def get_admin_traffic_usage(self, admin_username: str, days: int = 30) -> Dict:
        """Получает статистику трафика для админа (интеграция с Xpert Core)"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
                
            cursor.execute("""
                SELECT 
                    SUM(bytes_uploaded + bytes_downloaded) as total_bytes,
                    COUNT(DISTINCT user_token) as unique_users,
                    COUNT(DISTINCT config_server || ':' || config_port) as unique_servers,
                    COUNT(*) as total_connections
                FROM traffic_usage 
                WHERE timestamp >= datetime('now', '-{} days')
            """.format(days))
                
            result = cursor.fetchone()
            conn.close()
            
            total_gb = result[0] / (1024**3) if result[0] else 0
            
            return {
                "admin_username": admin_username,
                "external_traffic_gb": round(total_gb, 3),
                "external_unique_users": result[1],
                "external_unique_servers": result[2],
                "external_connections": result[3],
                "period_days": days
            }
            
        except Exception as e:
            logger.error(f"Failed to get admin traffic usage: {e}")
            return {
                "admin_username": admin_username,
                "external_traffic_gb": 0,
                "external_unique_users": 0,
                "external_unique_servers": 0,
                "external_connections": 0,
                "period_days": days
            }
        
        def reset_admin_external_traffic(self, admin_username: str) -> Dict:
            """Сброс внешнего трафика для админа (интеграция с Xpert Core)"""
            try:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                
                # Получаем статистику перед сбросом
                cursor.execute("""
                    SELECT 
                        SUM(bytes_uploaded + bytes_downloaded) as total_bytes,
                        COUNT(*) as total_connections
                    FROM traffic_usage
                """)
                
                result = cursor.fetchone()
                total_gb = result[0] / (1024**3) if result[0] else 0
                total_connections = result[1]
                
                # Удаляем все записи (сброс)
                cursor.execute("DELETE FROM traffic_usage")
                
                conn.commit()
                conn.close()
                
                logger.info(f"Reset external traffic for admin {admin_username}: "
                           f"{total_gb:.3f} GB, {total_connections} connections deleted")
                
                return {
                    "status": "success",
                    "admin_username": admin_username,
                    "reset_gb": round(total_gb, 3),
                    "reset_connections": total_connections,
                    "message": f"External traffic reset: {total_gb:.3f} GB cleared"
                }
                
            except Exception as e:
                logger.error(f"Failed to reset admin external traffic: {e}")
                return {
                    "status": "error",
                    "admin_username": admin_username,
                    "error": str(e)
                }
        
        def check_admin_traffic_limit(self, admin_username: str, traffic_limit: int) -> Dict:
            """Проверяет лимит трафика для админа"""
            try:
                if traffic_limit <= 0:
                    return {"within_limit": True, "limit": traffic_limit, "used": 0}
                
                # Получаем текущее использование
                stats = self.get_admin_traffic_usage(admin_username, 30)
                used_gb = stats.get("external_traffic_gb", 0)
                
                # Конвертируем лимит из байт в ГБ (если лимит в байтах)
                limit_gb = traffic_limit / (1024**3) if traffic_limit > 1024**3 else traffic_limit
                
                within_limit = used_gb <= limit_gb
                
                return {
                    "within_limit": within_limit,
                    "limit_gb": round(limit_gb, 3),
                    "used_gb": round(used_gb, 3),
                    "remaining_gb": round(max(0, limit_gb - used_gb), 3),
                    "percentage_used": round((used_gb / limit_gb) * 100, 1) if limit_gb > 0 else 0
                }
                
            except Exception as e:
                logger.error(f"Failed to check admin traffic limit: {e}")
                return {
                    "within_limit": True,
                    "limit_gb": traffic_limit,
                    "used_gb": 0,
                    "error": str(e)
                }


# Глобальный экземпляр сервиса
traffic_service = TrafficService()
