from fastapi import APIRouter
from . import (
    admin, 
    core, 
    node, 
    install,
    subscription, 
    system, 
    user_template, 
    user,
    home,
)

api_router = APIRouter()

routers = [
    admin.router,
    core.router,
    node.router,
    install.router,
    subscription.router,
    system.router,
    user_template.router,
    user.router,
    home.router,
]

for router in routers:
    api_router.include_router(router)

__all__ = ["api_router"]
