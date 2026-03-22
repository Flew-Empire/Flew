from datetime import datetime
import ipaddress
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

_ALLOWED_EDITIONS = {"standard", "full", "custom"}
_ALLOWED_PRODUCTS = {"xpert", "marzban_patch"}
_DEFAULT_PRODUCT = "xpert"


class InstallOtpCreate(BaseModel):
    product: str = _DEFAULT_PRODUCT
    edition: Optional[str] = None
    bound_ip: Optional[str] = None
    expires_in_minutes: Optional[int] = None
    note: Optional[str] = None

    @field_validator("expires_in_minutes")
    @classmethod
    def validate_expires_in_minutes(cls, value: Optional[int]):
        if value is None:
            return value
        if not isinstance(value, int):
            raise ValueError("expires_in_minutes must be an integer")
        if value < 1 or value > 1440:
            raise ValueError("expires_in_minutes must be between 1 and 1440")
        return value

    @field_validator("product")
    @classmethod
    def validate_product(cls, value: str):
        normalized = (value or "").strip().lower()
        if normalized not in _ALLOWED_PRODUCTS:
            raise ValueError("product must be xpert or marzban_patch")
        return normalized

    @field_validator("bound_ip")
    @classmethod
    def validate_bound_ip(cls, value: Optional[str]):
        if value is None:
            return None
        normalized = str(value).strip()
        if not normalized:
            return None
        parts = [p.strip() for p in normalized.split(",") if p.strip()]
        for part in parts:
            try:
                if "/" in part:
                    ipaddress.ip_network(part, strict=False)
                else:
                    ipaddress.ip_address(part)
            except ValueError as exc:
                raise ValueError("bound_ip must be a valid IP or CIDR") from exc
        return ",".join(parts)

    @field_validator("edition")
    @classmethod
    def validate_edition(cls, value: Optional[str]):
        if value is None:
            return None
        return (value or "").strip().lower()

    @model_validator(mode="after")
    def validate_product_edition(self):
        product = (self.product or _DEFAULT_PRODUCT).strip().lower()
        if product not in _ALLOWED_PRODUCTS:
            product = _DEFAULT_PRODUCT
        self.product = product
        
        edition = (self.edition or "").strip().lower()
        if product in ("xpert", "marzban_patch"):
            if not edition:
                edition = "standard"
            if edition not in _ALLOWED_EDITIONS:
                raise ValueError("edition must be standard, full, or custom")
            self.edition = edition
        return self


class InstallOtpResponse(BaseModel):
    id: int
    code: str
    product: str
    bound_ip: Optional[str] = None
    edition: str
    created_at: datetime
    expires_at: datetime
    used_at: Optional[datetime] = None
    created_by_admin_username: Optional[str] = None
    note: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InstallOtpVerifyRequest(BaseModel):
    code: str


class InstallOtpVerifyResponse(BaseModel):
    valid: bool
    status: str
    otp_id: Optional[int] = None
    expires_at: Optional[datetime] = None
    used_at: Optional[datetime] = None


class InstallDownloadTokenRequest(BaseModel):
    code: str
    edition: Optional[str] = None
    product: Optional[str] = None

    @field_validator("product")
    @classmethod
    def validate_product(cls, value: Optional[str]):
        if value is None:
            return None
        normalized = (value or "").strip().lower()
        if normalized not in _ALLOWED_PRODUCTS:
            raise ValueError("product must be xpert or marzban_patch")
        return normalized

    @field_validator("edition")
    @classmethod
    def validate_optional_edition(cls, value: Optional[str]):
        if value is None:
            return None
        normalized = (value or "").strip().lower()
        if normalized not in _ALLOWED_EDITIONS:
            raise ValueError("edition must be standard, full, or custom")
        return normalized


class InstallDownloadTokenResponse(BaseModel):
    token: str
    expires_at: datetime
    product: str
    edition: str
    filename: str
    download_path: str
