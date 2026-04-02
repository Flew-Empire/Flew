from typing import List, Optional

from pydantic import BaseModel


class SystemStats(BaseModel):
    version: str
    edition: Optional[str] = None
    features: List[str] = []
    xpanel_enabled: bool = True
    mem_total: int
    mem_used: int
    cpu_cores: int
    cpu_usage: float
    total_user: int
    online_users: int
    users_active: int
    users_on_hold: int
    users_disabled: int
    users_expired: int
    users_limited: int
    incoming_bandwidth: int
    outgoing_bandwidth: int
    incoming_bandwidth_speed: int
    outgoing_bandwidth_speed: int
