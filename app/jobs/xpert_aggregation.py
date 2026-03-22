import asyncio
import logging

from app import scheduler
from app.xpert.service import xpert_service
from config import JOB_SUBSCRIPTION_AGGREGATION_INTERVAL

logger = logging.getLogger(__name__)


def run_subscription_aggregation():
    """Запуск асинхронной задачи обновления подписок"""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    loop.run_until_complete(_update_subscriptions())


async def _update_subscriptions():
    """Обновление всех подписок"""
    logger.info("Starting scheduled subscription aggregation...")
    try:
        result = await xpert_service.update_subscription()
        logger.info(f"Subscription aggregation complete: {result}")
    except Exception as e:
        logger.error(f"Subscription aggregation failed: {e}")


scheduler.add_job(
    run_subscription_aggregation,
    "interval",
    seconds=JOB_SUBSCRIPTION_AGGREGATION_INTERVAL,
    id="xpert_subscription_aggregation",
    replace_existing=True,
    max_instances=1
)

logger.info(f"Xpert subscription aggregation job scheduled (interval: {JOB_SUBSCRIPTION_AGGREGATION_INTERVAL}s)")
