from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.db import Session, crud, get_db
from app.flew.admin_billing_service import (
    format_money_from_cents,
    is_billing_manager,
    parse_money_to_cents,
    send_invoice_paid_chat_notice,
    get_billing_event_label,
)
from app.models.admin import Admin
from app.utils import responses
from app.utils.features import feature_enabled


router = APIRouter(
    tags=["Admin Billing"],
    prefix="/api/admin-billing",
    responses={401: responses._401},
)


def _ensure_billing_feature_enabled() -> None:
    if not feature_enabled("admin_billing"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _ensure_access(current_admin: Admin, target_username: str) -> None:
    current_username = str(current_admin.username or "").strip().lower()
    target = str(target_username or "").strip().lower()
    if current_username == target:
        return
    if is_billing_manager(current_admin.username):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You're not allowed")


class AdminBillingRatePayload(BaseModel):
    unit_price: Optional[float] = None


class AdminBillingEntryResponse(BaseModel):
    id: int
    created_at: datetime
    event_type: str
    event_label: str
    action: str
    target_username: Optional[str] = None
    amount_cents: int
    amount_display: str


class AdminBillingInvoiceResponse(BaseModel):
    id: Optional[int] = None
    status: str
    opened_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    closed_by_username: Optional[str] = None
    total_cents: int
    total_display: str
    item_count: int
    items: List[AdminBillingEntryResponse] = []


class AdminBillingDetailResponse(BaseModel):
    admin_username: str
    can_manage: bool
    unit_price_cents: Optional[int] = None
    unit_price_display: Optional[str] = None
    current_invoice: AdminBillingInvoiceResponse
    history: List[AdminBillingInvoiceResponse] = []


class AdminBillingAdminSummary(BaseModel):
    username: str
    is_sudo: bool
    is_disabled: bool
    unit_price_cents: Optional[int] = None
    unit_price_display: Optional[str] = None
    current_total_cents: int
    current_total_display: str
    current_item_count: int


def _serialize_invoice(invoice) -> AdminBillingInvoiceResponse:
    if invoice is None:
        return AdminBillingInvoiceResponse(
            id=None,
            status="open",
            total_cents=0,
            total_display=format_money_from_cents(0),
            item_count=0,
            items=[],
        )

    items = [
        AdminBillingEntryResponse(
            id=item.id,
            created_at=item.created_at,
            event_type=item.event_type,
            event_label=get_billing_event_label(item.event_type),
            action=item.action,
            target_username=item.target_username,
            amount_cents=int(item.amount_cents or 0),
            amount_display=format_money_from_cents(int(item.amount_cents or 0)),
        )
        for item in sorted(
            list(getattr(invoice, "entries", []) or []),
            key=lambda value: (value.created_at, value.id),
        )
    ]
    total_cents = sum(int(item.amount_cents or 0) for item in getattr(invoice, "entries", []) or [])
    return AdminBillingInvoiceResponse(
        id=invoice.id,
        status=invoice.status,
        opened_at=invoice.opened_at,
        closed_at=invoice.closed_at,
        closed_by_username=invoice.closed_by_username,
        total_cents=total_cents,
        total_display=format_money_from_cents(total_cents),
        item_count=len(items),
        items=items,
    )


def _build_detail_payload(
    db: Session,
    username: str,
    current_admin: Admin,
) -> AdminBillingDetailResponse:
    admin_username = str(username or "").strip()
    profile = crud.get_admin_billing_profile(db, admin_username)
    invoices = crud.list_admin_billing_invoices(db, admin_username, limit=80)
    current_invoice = next((invoice for invoice in invoices if invoice.status == "open"), None)
    history = [invoice for invoice in invoices if invoice.status != "open"]

    unit_price_cents = getattr(profile, "unit_price_cents", None)
    return AdminBillingDetailResponse(
        admin_username=admin_username,
        can_manage=is_billing_manager(current_admin.username),
        unit_price_cents=unit_price_cents,
        unit_price_display=(
            format_money_from_cents(int(unit_price_cents))
            if unit_price_cents is not None
            else None
        ),
        current_invoice=_serialize_invoice(current_invoice),
        history=[_serialize_invoice(invoice) for invoice in history],
    )


@router.get("/me", response_model=AdminBillingDetailResponse)
def get_my_admin_billing(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.get_current),
):
    _ensure_billing_feature_enabled()
    return _build_detail_payload(db, current_admin.username, current_admin)


@router.get("/admins", response_model=List[AdminBillingAdminSummary])
def list_admin_billing_admins(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.get_current),
):
    _ensure_billing_feature_enabled()
    if not is_billing_manager(current_admin.username):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only moor can manage billing")

    profiles = {
        item.admin_username: item
        for item in crud.list_admin_billing_profiles(db)
    }

    out: List[AdminBillingAdminSummary] = []
    for item in crud.get_admins(db):
        open_invoice = crud.get_admin_billing_open_invoice(db, item.username)
        open_total = crud.get_admin_billing_open_total_cents(db, item.username)
        open_item_count = len(getattr(open_invoice, "entries", []) or []) if open_invoice else 0
        profile = profiles.get(item.username)
        unit_price_cents = getattr(profile, "unit_price_cents", None)
        out.append(
            AdminBillingAdminSummary(
                username=item.username,
                is_sudo=bool(item.is_sudo),
                is_disabled=bool(getattr(item, "is_disabled", False)),
                unit_price_cents=unit_price_cents,
                unit_price_display=(
                    format_money_from_cents(int(unit_price_cents))
                    if unit_price_cents is not None
                    else None
                ),
                current_total_cents=open_total,
                current_total_display=format_money_from_cents(open_total),
                current_item_count=open_item_count,
            )
        )

    out.sort(key=lambda item: (item.username.lower(), item.username))
    return out


@router.get("/{admin_username}", response_model=AdminBillingDetailResponse)
def get_admin_billing_detail(
    admin_username: str,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.get_current),
):
    _ensure_billing_feature_enabled()
    _ensure_access(current_admin, admin_username)
    return _build_detail_payload(db, admin_username, current_admin)


@router.put("/{admin_username}/rate", response_model=AdminBillingDetailResponse)
def set_admin_billing_rate(
    admin_username: str,
    payload: AdminBillingRatePayload,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.get_current),
):
    _ensure_billing_feature_enabled()
    if not is_billing_manager(current_admin.username):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only moor can manage billing")

    dbadmin = crud.get_admin(db, admin_username)
    if not dbadmin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")

    unit_price_cents = parse_money_to_cents(payload.unit_price)
    if payload.unit_price is not None and unit_price_cents is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid unit price")

    crud.upsert_admin_billing_profile(
        db=db,
        username=dbadmin.username,
        unit_price_cents=unit_price_cents,
        updated_by_username=current_admin.username,
    )
    return _build_detail_payload(db, dbadmin.username, current_admin)


@router.post("/{admin_username}/mark-paid", response_model=AdminBillingDetailResponse)
def mark_admin_billing_paid(
    admin_username: str,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.get_current),
):
    _ensure_billing_feature_enabled()
    if not is_billing_manager(current_admin.username):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only moor can manage billing")

    dbadmin = crud.get_admin(db, admin_username)
    if not dbadmin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")

    open_invoice = crud.get_admin_billing_open_invoice(db, dbadmin.username)
    open_total_cents = crud.get_admin_billing_open_total_cents(db, dbadmin.username)
    if open_invoice is None or open_total_cents <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="There is no unpaid bill to close")

    paid_invoice, _new_invoice = crud.mark_admin_billing_invoice_paid(
        db=db,
        username=dbadmin.username,
        closed_by_username=current_admin.username,
    )
    if paid_invoice is not None:
        try:
            send_invoice_paid_chat_notice(
                db=db,
                admin_username=dbadmin.username,
                invoice=paid_invoice,
                total_cents=open_total_cents,
            )
        except Exception:
            pass

    return _build_detail_payload(db, dbadmin.username, current_admin)
