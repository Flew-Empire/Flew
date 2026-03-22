"""
Сервис для отслеживания и анализа трафика
Мониторинг использования внешних VPN серверов через Xpert
"""

import logging
import os
from datetime import date, datetime, timedelta
from typing import Dict

from sqlalchemy import create_engine, desc, func
from sqlalchemy.orm import sessionmaker

from app.db.base import SessionLocal as MainSessionLocal
from app.db.models import TrafficUsage
from config import (
    SQLALCHEMY_DATABASE_URL,
    SQLALCHEMY_POOL_SIZE,
    SQLIALCHEMY_MAX_OVERFLOW,
    XPERT_TRAFFIC_DB_PATH,
    XPERT_TRAFFIC_RETENTION_DAYS,
)

logger = logging.getLogger(__name__)


class TrafficService:
    """Сервис для управления статистикой трафика"""

    def __init__(self):
        self.db_path = XPERT_TRAFFIC_DB_PATH or ""
        self.retention_days = XPERT_TRAFFIC_RETENTION_DAYS or 0
        self.engine, self.Session = self._build_session_factory()
        self._init_db()

    def _build_session_factory(self):
        """Строит сессию: отдельная БД для трафика (если задана) или основная БД панели."""
        raw = (self.db_path or "").strip()

        if not raw:
            return None, MainSessionLocal

        if "://" in raw:
            db_url = raw
        else:
            # Backward compatible: old value like data/traffic_stats.db
            db_url = f"sqlite:///{raw}"

        if db_url.startswith("sqlite"):
            engine = create_engine(db_url, connect_args={"check_same_thread": False})
            return engine, sessionmaker(autocommit=False, autoflush=False, bind=engine)

        # Non-sqlite traffic DB URL (postgres/mysql)
        engine = create_engine(
            db_url,
            pool_size=SQLALCHEMY_POOL_SIZE,
            max_overflow=SQLIALCHEMY_MAX_OVERFLOW,
            pool_recycle=3600,
            pool_timeout=10,
        )
        return engine, sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def _init_db(self):
        """Инициализация таблицы статистики"""
        try:
            if self.engine is None:
                # Using main app DB engine via MainSessionLocal
                from app.db.base import engine as main_engine

                TrafficUsage.__table__.create(bind=main_engine, checkfirst=True)
                logger.info("Traffic table initialized on main DB")
                return

            # For path like data/traffic_stats.db
            if self.db_path and "://" not in self.db_path:
                db_dir = os.path.dirname(self.db_path)
                if db_dir:
                    os.makedirs(db_dir, exist_ok=True)

            TrafficUsage.__table__.create(bind=self.engine, checkfirst=True)
            logger.info(f"Traffic table initialized: {self.db_path or SQLALCHEMY_DATABASE_URL}")
        except Exception as e:
            logger.error(f"Failed to initialize traffic database: {e}")
            raise

    def record_traffic_usage(
        self,
        user_token: str,
        config_server: str,
        config_port: int,
        protocol: str,
        bytes_uploaded: int = 0,
        bytes_downloaded: int = 0,
    ):
        """Записывает использование трафика"""
        try:
            today = date.today()
            now = datetime.utcnow()

            with self.Session() as db:
                row = (
                    db.query(TrafficUsage)
                    .filter(
                        TrafficUsage.user_token == user_token,
                        TrafficUsage.config_server == config_server,
                        TrafficUsage.config_port == int(config_port),
                        TrafficUsage.date_collected == today,
                    )
                    .first()
                )

                if row:
                    row.bytes_uploaded = int(row.bytes_uploaded or 0) + int(bytes_uploaded or 0)
                    row.bytes_downloaded = int(row.bytes_downloaded or 0) + int(bytes_downloaded or 0)
                    row.timestamp = now
                    if protocol:
                        row.protocol = protocol
                else:
                    db.add(
                        TrafficUsage(
                            user_token=user_token,
                            config_server=config_server,
                            config_port=int(config_port),
                            protocol=protocol,
                            bytes_uploaded=int(bytes_uploaded or 0),
                            bytes_downloaded=int(bytes_downloaded or 0),
                            date_collected=today,
                            timestamp=now,
                        )
                    )

                db.commit()

            logger.debug(
                "Traffic recorded: %s -> %s:%s ↑%s ↓%s",
                user_token,
                config_server,
                config_port,
                bytes_uploaded,
                bytes_downloaded,
            )
        except Exception as e:
            logger.error(f"Failed to record traffic usage: {e}")
            raise

    def get_user_traffic_stats(self, user_token: str, days: int = 30) -> Dict:
        """Получает статистику трафика пользователя"""
        try:
            since = datetime.utcnow() - timedelta(days=days)
            with self.Session() as db:
                rows = (
                    db.query(
                        TrafficUsage.config_server,
                        TrafficUsage.config_port,
                        TrafficUsage.protocol,
                        func.sum(TrafficUsage.bytes_uploaded).label("total_upload"),
                        func.sum(TrafficUsage.bytes_downloaded).label("total_download"),
                        func.count(TrafficUsage.id).label("connection_count"),
                        func.max(TrafficUsage.timestamp).label("last_used"),
                    )
                    .filter(
                        TrafficUsage.user_token == user_token,
                        TrafficUsage.timestamp >= since,
                    )
                    .group_by(
                        TrafficUsage.config_server,
                        TrafficUsage.config_port,
                        TrafficUsage.protocol,
                    )
                    .order_by(desc("total_download"))
                    .all()
                )

            total_gb = (
                sum((int(r.total_upload or 0) + int(r.total_download or 0)) for r in rows)
                / (1024**3)
            )

            return {
                "user_token": user_token,
                "total_gb_used": round(total_gb, 3),
                "period_days": days,
                "servers": [
                    {
                        "server": r.config_server,
                        "port": r.config_port,
                        "protocol": r.protocol,
                        "upload_gb": round(int(r.total_upload or 0) / (1024**3), 3),
                        "download_gb": round(int(r.total_download or 0) / (1024**3), 3),
                        "total_gb": round(
                            (int(r.total_upload or 0) + int(r.total_download or 0)) / (1024**3),
                            3,
                        ),
                        "connections": int(r.connection_count or 0),
                        "last_used": r.last_used,
                    }
                    for r in rows
                ],
            }
        except Exception as e:
            logger.error(f"Failed to get user traffic stats: {e}")
            return {
                "user_token": user_token,
                "total_gb_used": 0,
                "period_days": days,
                "servers": [],
            }

    def get_global_stats(self, days: int = 30) -> Dict:
        """Глобальная статистика по всем пользователям"""
        try:
            since = datetime.utcnow() - timedelta(days=days)
            with self.Session() as db:
                total_users = (
                    db.query(func.count(func.distinct(TrafficUsage.user_token)))
                    .filter(TrafficUsage.timestamp >= since)
                    .scalar()
                    or 0
                )

                total_servers = (
                    db.query(TrafficUsage.config_server, TrafficUsage.config_port)
                    .filter(TrafficUsage.timestamp >= since)
                    .distinct()
                    .count()
                )

                total_bytes = (
                    db.query(func.sum(TrafficUsage.bytes_uploaded + TrafficUsage.bytes_downloaded))
                    .filter(TrafficUsage.timestamp >= since)
                    .scalar()
                    or 0
                )

                total_connections = (
                    db.query(func.count(TrafficUsage.id))
                    .filter(TrafficUsage.timestamp >= since)
                    .scalar()
                    or 0
                )

                total_protocols = (
                    db.query(func.count(func.distinct(TrafficUsage.protocol)))
                    .filter(TrafficUsage.timestamp >= since)
                    .scalar()
                    or 0
                )

                top_servers = (
                    db.query(
                        TrafficUsage.config_server,
                        TrafficUsage.config_port,
                        TrafficUsage.protocol,
                        func.sum(TrafficUsage.bytes_uploaded + TrafficUsage.bytes_downloaded).label(
                            "total_bytes"
                        ),
                    )
                    .filter(TrafficUsage.timestamp >= since)
                    .group_by(
                        TrafficUsage.config_server,
                        TrafficUsage.config_port,
                        TrafficUsage.protocol,
                    )
                    .order_by(desc("total_bytes"))
                    .limit(10)
                    .all()
                )

            return {
                "total_users": int(total_users),
                "total_servers": int(total_servers),
                "total_gb_used": round(int(total_bytes) / (1024**3), 3) if total_bytes else 0,
                "total_connections": int(total_connections),
                "total_protocols": int(total_protocols),
                "period_days": days,
                "top_servers": [
                    {
                        "server": r.config_server,
                        "port": r.config_port,
                        "protocol": r.protocol,
                        "total_gb": round(int(r.total_bytes or 0) / (1024**3), 3),
                    }
                    for r in top_servers
                ],
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
                "top_servers": [],
            }

    def get_server_stats(self, server: str, port: int, days: int = 30) -> Dict:
        """Статистика по конкретному серверу"""
        try:
            since = datetime.utcnow() - timedelta(days=days)
            with self.Session() as db:
                agg = (
                    db.query(
                        func.count(func.distinct(TrafficUsage.user_token)).label("unique_users"),
                        func.sum(TrafficUsage.bytes_uploaded + TrafficUsage.bytes_downloaded).label(
                            "total_bytes"
                        ),
                        func.count(TrafficUsage.id).label("total_connections"),
                        func.avg(TrafficUsage.bytes_uploaded + TrafficUsage.bytes_downloaded).label(
                            "avg_bytes"
                        ),
                    )
                    .filter(
                        TrafficUsage.config_server == server,
                        TrafficUsage.config_port == int(port),
                        TrafficUsage.timestamp >= since,
                    )
                    .first()
                )

                daily_stats = (
                    db.query(
                        TrafficUsage.date_collected.label("date"),
                        func.sum(TrafficUsage.bytes_uploaded + TrafficUsage.bytes_downloaded).label(
                            "daily_bytes"
                        ),
                        func.count(func.distinct(TrafficUsage.user_token)).label("daily_users"),
                    )
                    .filter(
                        TrafficUsage.config_server == server,
                        TrafficUsage.config_port == int(port),
                        TrafficUsage.timestamp >= since,
                    )
                    .group_by(TrafficUsage.date_collected)
                    .order_by(desc(TrafficUsage.date_collected))
                    .all()
                )

            return {
                "server": server,
                "port": int(port),
                "period_days": days,
                "unique_users": int(agg.unique_users or 0),
                "total_gb_used": round(int(agg.total_bytes or 0) / (1024**3), 3),
                "total_connections": int(agg.total_connections or 0),
                "avg_gb_per_connection": round(float(agg.avg_bytes or 0) / (1024**3), 3),
                "daily_stats": [
                    {
                        "date": str(r.date),
                        "total_gb": round(int(r.daily_bytes or 0) / (1024**3), 3),
                        "unique_users": int(r.daily_users or 0),
                    }
                    for r in daily_stats
                ],
            }
        except Exception as e:
            logger.error(f"Failed to get server stats: {e}")
            return {
                "server": server,
                "port": int(port),
                "period_days": days,
                "unique_users": 0,
                "total_gb_used": 0,
                "total_connections": 0,
                "avg_gb_per_connection": 0,
                "daily_stats": [],
            }

    def cleanup_old_stats(self, days: int = None) -> Dict:
        """Очистка старой статистики"""
        try:
            cleanup_days = days or self.retention_days
            if cleanup_days <= 0:
                return {"status": "skipped", "reason": "retention disabled"}

            cutoff = datetime.utcnow() - timedelta(days=cleanup_days)

            with self.Session() as db:
                deleted_rows = (
                    db.query(TrafficUsage)
                    .filter(TrafficUsage.timestamp < cutoff)
                    .delete(synchronize_session=False)
                )
                db.commit()

            logger.info(
                "Cleaned up %s old traffic records (older than %s days)",
                deleted_rows,
                cleanup_days,
            )

            return {
                "status": "success",
                "deleted_rows": int(deleted_rows or 0),
                "cleanup_days": cleanup_days,
            }
        except Exception as e:
            logger.error(f"Failed to cleanup old stats: {e}")
            return {"status": "error", "error": str(e)}

    def _database_size_mb(self) -> float:
        """Размер sqlite-файла, если используется файловый sqlite backend."""
        try:
            if not self.engine:
                # Main DB mode (could be sqlite or pg). We report 0 for non-file backends.
                if SQLALCHEMY_DATABASE_URL.startswith("sqlite:///"):
                    path = SQLALCHEMY_DATABASE_URL.replace("sqlite:///", "", 1)
                    if os.path.exists(path):
                        return round(os.path.getsize(path) / (1024 * 1024), 2)
                return 0.0

            url = str(self.engine.url)
            if url.startswith("sqlite:///"):
                path = url.replace("sqlite:///", "", 1)
                if os.path.exists(path):
                    return round(os.path.getsize(path) / (1024 * 1024), 2)
            return 0.0
        except Exception:
            return 0.0

    def get_database_info(self) -> Dict:
        """Информация о базе данных"""
        try:
            with self.Session() as db:
                total_records = db.query(func.count(TrafficUsage.id)).scalar() or 0
                unique_users = db.query(func.count(func.distinct(TrafficUsage.user_token))).scalar() or 0
                unique_servers = (
                    db.query(TrafficUsage.config_server, TrafficUsage.config_port).distinct().count()
                )

            return {
                "database_path": self.db_path or SQLALCHEMY_DATABASE_URL,
                "total_records": int(total_records),
                "unique_users": int(unique_users),
                "unique_servers": int(unique_servers),
                "database_size_mb": self._database_size_mb(),
                "retention_days": self.retention_days,
            }
        except Exception as e:
            logger.error(f"Failed to get database info: {e}")
            return {
                "database_path": self.db_path or SQLALCHEMY_DATABASE_URL,
                "total_records": 0,
                "unique_users": 0,
                "unique_servers": 0,
                "database_size_mb": 0,
                "retention_days": self.retention_days,
                "error": str(e),
            }

    def get_admin_traffic_usage(self, admin_username: str, days: int = 30) -> Dict:
        """Получает статистику трафика для админа (интеграция с Xpert Core)"""
        try:
            since = datetime.utcnow() - timedelta(days=days)
            with self.Session() as db:
                row = (
                    db.query(
                        func.sum(TrafficUsage.bytes_uploaded + TrafficUsage.bytes_downloaded).label(
                            "total_bytes"
                        ),
                        func.count(func.distinct(TrafficUsage.user_token)).label("unique_users"),
                        func.count(TrafficUsage.id).label("total_connections"),
                    )
                    .filter(TrafficUsage.timestamp >= since)
                    .first()
                )
                unique_servers = (
                    db.query(TrafficUsage.config_server, TrafficUsage.config_port)
                    .filter(TrafficUsage.timestamp >= since)
                    .distinct()
                    .count()
                )

            total_gb = float(row.total_bytes or 0) / (1024**3)

            return {
                "admin_username": admin_username,
                "external_traffic_gb": round(total_gb, 3),
                "external_unique_users": int(row.unique_users or 0),
                "external_unique_servers": int(unique_servers or 0),
                "external_connections": int(row.total_connections or 0),
                "period_days": days,
            }
        except Exception as e:
            logger.error(f"Failed to get admin traffic usage: {e}")
            return {
                "admin_username": admin_username,
                "external_traffic_gb": 0,
                "external_unique_users": 0,
                "external_unique_servers": 0,
                "external_connections": 0,
                "period_days": days,
            }

    def reset_admin_external_traffic(self, admin_username: str) -> Dict:
        """Сброс внешнего трафика для админа (интеграция с Xpert Core)"""
        try:
            with self.Session() as db:
                row = (
                    db.query(
                        func.sum(TrafficUsage.bytes_uploaded + TrafficUsage.bytes_downloaded).label(
                            "total_bytes"
                        ),
                        func.count(TrafficUsage.id).label("total_connections"),
                    )
                    .first()
                )

                total_gb = float(row.total_bytes or 0) / (1024**3)
                total_connections = int(row.total_connections or 0)

                db.query(TrafficUsage).delete(synchronize_session=False)
                db.commit()

            logger.info(
                "Reset external traffic for admin %s: %.3f GB, %s connections deleted",
                admin_username,
                total_gb,
                total_connections,
            )

            return {
                "status": "success",
                "admin_username": admin_username,
                "reset_gb": round(total_gb, 3),
                "reset_connections": total_connections,
                "message": f"External traffic reset: {total_gb:.3f} GB cleared",
            }
        except Exception as e:
            logger.error(f"Failed to reset admin external traffic: {e}")
            return {"status": "error", "admin_username": admin_username, "error": str(e)}

    def check_admin_traffic_limit(self, admin_username: str, traffic_limit: int) -> Dict:
        """Проверяет лимит трафика для админа"""
        try:
            if traffic_limit <= 0:
                return {"within_limit": True, "limit": traffic_limit, "used": 0}

            stats = self.get_admin_traffic_usage(admin_username, 30)
            used_gb = stats.get("external_traffic_gb", 0)

            limit_gb = traffic_limit / (1024**3) if traffic_limit > 1024**3 else traffic_limit
            within_limit = used_gb <= limit_gb

            return {
                "within_limit": within_limit,
                "limit_gb": round(limit_gb, 3),
                "used_gb": round(used_gb, 3),
                "remaining_gb": round(max(0, limit_gb - used_gb), 3),
                "percentage_used": round((used_gb / limit_gb) * 100, 1) if limit_gb > 0 else 0,
            }
        except Exception as e:
            logger.error(f"Failed to check admin traffic limit: {e}")
            return {
                "within_limit": True,
                "limit_gb": traffic_limit,
                "used_gb": 0,
                "error": str(e),
            }


# Глобальный экземпляр сервиса
traffic_service = TrafficService()
