from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class HwidSubscriptionSettings(BaseModel):
    enabled: bool = False
    fallback_device_limit: int = 1
    max_devices_announce: Optional[str] = None


class HwidSubscriptionSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    fallback_device_limit: Optional[int] = None
    max_devices_announce: Optional[str] = None


class SubscriptionCustomRemarks(BaseModel):
    expired_users: List[str] = Field(default_factory=list)
    limited_users: List[str] = Field(default_factory=list)
    disabled_users: List[str] = Field(default_factory=list)
    empty_hosts: List[str] = Field(default_factory=list)
    hwid_max_devices_exceeded: List[str] = Field(default_factory=list)
    hwid_not_supported: List[str] = Field(default_factory=list)


class SubscriptionCustomRemarksUpdate(BaseModel):
    expired_users: Optional[List[str]] = None
    limited_users: Optional[List[str]] = None
    disabled_users: Optional[List[str]] = None
    empty_hosts: Optional[List[str]] = None
    hwid_max_devices_exceeded: Optional[List[str]] = None
    hwid_not_supported: Optional[List[str]] = None


class SubscriptionSettingsResponse(BaseModel):
    profile_title: str
    support_link: str
    profile_update_interval: int
    is_profile_web_page_url_enabled: bool = True
    serve_json_for_happ: bool = False
    is_show_custom_remarks: bool = True
    randomize_text_links: bool = False
    happ_announce: Optional[str] = None
    happ_routing: Optional[str] = None
    custom_response_headers: Dict[str, str] = Field(default_factory=dict)
    custom_remarks: SubscriptionCustomRemarks = Field(
        default_factory=SubscriptionCustomRemarks
    )
    hwid_settings: HwidSubscriptionSettings = Field(
        default_factory=HwidSubscriptionSettings
    )


class SubscriptionSettingsUpdate(BaseModel):
    profile_title: Optional[str] = None
    support_link: Optional[str] = None
    profile_update_interval: Optional[int] = None
    is_profile_web_page_url_enabled: Optional[bool] = None
    serve_json_for_happ: Optional[bool] = None
    is_show_custom_remarks: Optional[bool] = None
    randomize_text_links: Optional[bool] = None
    happ_announce: Optional[str] = None
    happ_routing: Optional[str] = None
    custom_response_headers: Optional[Dict[str, str]] = None
    custom_remarks: Optional[SubscriptionCustomRemarksUpdate] = None
    hwid_settings: Optional[HwidSubscriptionSettingsUpdate] = None

