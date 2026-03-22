import logging
import os

from app import scheduler
from app.db import GetDB
from app.xpert.panel_sync_service import panel_sync_service

logger = logging.getLogger(__name__)

PANEL_SYNC_RECONCILE_INTERVAL_SECONDS = max(
    60,
    int(os.getenv("PANEL_SYNC_RECONCILE_INTERVAL_SECONDS", "1800")),
)
PANEL_SYNC_USAGE_INTERVAL_SECONDS = max(
    10,
    int(os.getenv("PANEL_SYNC_USAGE_INTERVAL_SECONDS", "60")),
)


def panel_sync_reconcile_job():
    """Every 30 minutes: enforce local->remote parity and refresh cached remote links."""
    try:
        with GetDB() as db:
            result = panel_sync_service.sync_all_users_from_db(db)
        logger.info(
            "Panel sync reconcile: total=%s created=%s updated=%s errors=%s",
            result.get("total_users", 0),
            result.get("created", 0),
            result.get("updated", 0),
            result.get("errors", 0),
        )
    except Exception:
        logger.exception("Panel sync reconcile job failed")


def panel_sync_usage_job():
    """Frequent sync of remote used_traffic deltas into local users/admin usage counters."""
    try:
        with GetDB() as db:
            result = panel_sync_service.sync_usage_from_targets(db)
        total_delta = int(result.get("total_delta", 0))
        errors = result.get("errors") or []
        if total_delta > 0 or errors:
            logger.info(
                "Panel sync usage: users_with_delta=%s total_delta=%s errors=%s",
                result.get("users_with_delta", 0),
                total_delta,
                len(errors),
            )
    except Exception:
        logger.exception("Panel sync usage job failed")


scheduler.add_job(
    panel_sync_reconcile_job,
    "interval",
    seconds=PANEL_SYNC_RECONCILE_INTERVAL_SECONDS,
    id="xpanel_sync_reconcile",
    replace_existing=True,
    max_instances=1,
    coalesce=True,
)

scheduler.add_job(
    panel_sync_usage_job,
    "interval",
    seconds=PANEL_SYNC_USAGE_INTERVAL_SECONDS,
    id="xpanel_sync_usage",
    replace_existing=True,
    max_instances=1,
    coalesce=True,
)

logger.info(
    "Panel sync jobs scheduled: reconcile=%ss usage=%ss",
    PANEL_SYNC_RECONCILE_INTERVAL_SECONDS,
    PANEL_SYNC_USAGE_INTERVAL_SECONDS,
)
