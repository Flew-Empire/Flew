from __future__ import annotations

import json
from typing import Optional

from app.db import Session, crud
from app.db.models import AdminActionLog, AdminBillingEntry, AdminBillingInvoice
from config import ADMIN_CHAT_MAIN_ADMIN
from app.utils.features import feature_enabled


MAIN_ADMIN_USERNAME = (ADMIN_CHAT_MAIN_ADMIN or "").strip().lower()


def normalize_admin_username(value: Optional[str]) -> str:
    return str(value or "").strip()


def is_billing_manager(username: Optional[str]) -> bool:
    return normalize_admin_username(username).lower() == MAIN_ADMIN_USERNAME


def format_money_from_cents(value: int) -> str:
    cents = int(value or 0)
    return f"{cents / 100:.2f}"


def parse_money_to_cents(value: Optional[float]) -> Optional[int]:
    if value is None:
        return None
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    if amount < 0:
        return None
    return int(round(amount * 100))


def _normalize_meta(raw) -> dict:
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


def _looks_like_extension(action_log: AdminActionLog) -> bool:
    if (action_log.action or "").strip() == "user.active_next_plan":
        return True
    if (action_log.action or "").strip() != "user.modify":
        return False

    meta = _normalize_meta(action_log.meta)
    changes = meta.get("changes") if isinstance(meta, dict) else {}
    expire_change = changes.get("expire") if isinstance(changes, dict) else None
    if not isinstance(expire_change, dict):
        return False

    previous = expire_change.get("from")
    current = expire_change.get("to")
    if current is None:
        return False
    if previous is None:
        return True

    try:
        return int(current) > int(previous)
    except (TypeError, ValueError):
        return current != previous


def get_billing_event_type(action_log: AdminActionLog) -> Optional[str]:
    action = (action_log.action or "").strip()
    if action == "user.create":
        return "create"
    if action == "user.reset_usage":
        return "reset_usage"
    if _looks_like_extension(action_log):
        return "extend"
    return None


def get_billing_event_label(event_type: str) -> str:
    labels = {
        "create": "Создание пользователя",
        "extend": "Продление пользователя",
        "reset_usage": "Сброс трафика",
    }
    return labels.get(str(event_type or "").strip(), str(event_type or "").strip() or "Действие")


def _send_billing_chat_notice(
    db: Session,
    admin_username: str,
    entry: AdminBillingEntry,
    current_total_cents: int,
) -> None:
    recipient = normalize_admin_username(admin_username)
    if not recipient or recipient.lower() == MAIN_ADMIN_USERNAME:
        return

    body_lines = [
        "Новый счет",
        f"Действие: {get_billing_event_label(entry.event_type)}",
    ]
    if entry.target_username:
        body_lines.append(f"Пользователь: {entry.target_username}")
    body_lines.extend(
        [
            f"Сумма: {format_money_from_cents(entry.amount_cents)}",
            f"Текущий неоплаченный счет: {format_money_from_cents(current_total_cents)}",
        ]
    )
    crud.create_admin_chat_message(
        db=db,
        sender_username=MAIN_ADMIN_USERNAME,
        recipient_username=recipient,
        body="\n".join(body_lines),
    )


def send_invoice_paid_chat_notice(
    db: Session,
    admin_username: str,
    invoice: AdminBillingInvoice,
    total_cents: int,
) -> None:
    recipient = normalize_admin_username(admin_username)
    if not recipient or recipient.lower() == MAIN_ADMIN_USERNAME:
        return

    body_lines = [
        "Счет отмечен как оплаченный",
        f"Оплачено: {format_money_from_cents(total_cents)}",
    ]
    if getattr(invoice, "opened_at", None):
        body_lines.append(f"Открыт: {invoice.opened_at.isoformat()}")
    if getattr(invoice, "closed_at", None):
        body_lines.append(f"Закрыт: {invoice.closed_at.isoformat()}")
    body_lines.append("Новый счет открыт с нуля.")
    crud.create_admin_chat_message(
        db=db,
        sender_username=MAIN_ADMIN_USERNAME,
        recipient_username=recipient,
        body="\n".join(body_lines),
    )


def register_billing_from_action_log(
    db: Session,
    action_log: AdminActionLog,
) -> Optional[AdminBillingEntry]:
    if not feature_enabled("admin_billing"):
        return None

    if action_log is None:
        return None

    event_type = get_billing_event_type(action_log)
    if not event_type:
        return None

    admin_username = normalize_admin_username(action_log.admin_username)
    if not admin_username:
        return None

    if crud.get_admin_billing_entry_by_action_log(db, action_log.id):
        return None

    profile = crud.get_admin_billing_profile(db, admin_username)
    unit_price_cents = getattr(profile, "unit_price_cents", None)
    if unit_price_cents is None or int(unit_price_cents) <= 0:
        return None

    invoice = crud.get_or_create_open_admin_billing_invoice(db, admin_username)
    entry = crud.create_admin_billing_entry(
        db=db,
        invoice_id=invoice.id,
        action_log_id=action_log.id,
        admin_username=admin_username,
        event_type=event_type,
        action=action_log.action,
        target_username=action_log.target_username,
        unit_price_cents=int(unit_price_cents),
        amount_cents=int(unit_price_cents),
        meta={"source_action_log_id": action_log.id},
    )
    try:
        current_total_cents = crud.get_admin_billing_open_total_cents(db, admin_username)
        _send_billing_chat_notice(
            db=db,
            admin_username=admin_username,
            entry=entry,
            current_total_cents=current_total_cents,
        )
    except Exception:
        pass
    return entry
