import logging
import time

import config
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from config import XPERT_TRAFFIC_TRACKING_ENABLED

from config import ALLOWED_ORIGINS, DOCS, XRAY_SUBSCRIPTION_PATH, XPERT_DOMAIN

__version__ = "0.8.4"

app = FastAPI(
    title="XpertAPI",
    description="Unified GUI Censorship Resistant Solution Powered by Xray",
    version=__version__,
    docs_url="/docs" if DOCS else None,
    redoc_url="/redoc" if DOCS else None,
)

scheduler = BackgroundScheduler(
    {"apscheduler.job_defaults.max_instances": 20}, timezone="UTC"
)
logger = logging.getLogger("uvicorn.error")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
from app import dashboard, jobs, routers, telegram  # noqa
from app.routers import api_router  # noqa
from app.routers.xpert import router as xpert_router  # noqa

app.include_router(api_router)
app.include_router(xpert_router, prefix="/api")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    try:
        body_bytes = await request.body()
        body_len = len(body_bytes or b"")
    except Exception:
        body_len = -1

    client_host = request.client.host if request.client else "-"
    ua = request.headers.get("user-agent", "-")
    content_type = request.headers.get("content-type", "-")

    # Traffic monitoring for subscription requests
    if XPERT_TRAFFIC_TRACKING_ENABLED:
        try:
            from app.xpert.traffic_service import traffic_service
            
            # Check if this is a subscription request
            is_subscription_request = (
                request.url.path.startswith("/sub/") or 
                request.url.path.startswith("/api/xpert/sub") or
                request.url.path.startswith("/api/xpert/direct-configs/sub") or
                request.url.path.startswith(f"/{XRAY_SUBSCRIPTION_PATH}/")
            )
            
            if is_subscription_request:
                # Extract user token from path
                path_parts = request.url.path.strip("/").split("/")
                user_token = "anonymous"
                
                if len(path_parts) > 1:
                    potential_token = path_parts[-1]
                    if len(potential_token) > 8:  # Basic token validation
                        user_token = potential_token
                
                # Log subscription request for traffic tracking
                logger.info(f"SUBSCRIPTION_REQUEST user={user_token} ip={client_host} "
                           f"path={request.url.path} ua={ua[:50]}")
                
                # Record basic access (will be enhanced with webhook data)
                try:
                    # For now, just record the access - actual traffic will come from webhook
                    pass
                except Exception as e:
                    logger.debug(f"Could not record subscription access: {e}")
                    
        except ImportError:
            # Traffic service not available
            pass
        except Exception as e:
            logger.debug(f"Traffic monitoring error: {e}")

    logger.info(
        "REQ %s %s?%s from=%s ct=%s ua=%s body_len=%s",
        request.method,
        request.url.path,
        request.url.query,
        client_host,
        content_type,
        ua,
        body_len,
    )

    try:
        response = await call_next(request)
        duration_ms = int((time.time() - start) * 1000)
        logger.info(
            "RESP %s %s status=%s duration_ms=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response
    except Exception as exc:
        duration_ms = int((time.time() - start) * 1000)
        logger.exception(
            "ERR %s %s duration_ms=%s error=%s",
            request.method,
            request.url.path,
            duration_ms,
            exc,
        )
        raise


def use_route_names_as_operation_ids(app: FastAPI) -> None:
    for route in app.routes:
        if isinstance(route, APIRoute):
            route.operation_id = route.name


use_route_names_as_operation_ids(app)


@app.on_event("startup")
def on_startup():
    paths = [f"{r.path}/" for r in app.routes]
    paths.append("/api/")
    if f"/{XRAY_SUBSCRIPTION_PATH}/" in paths:
        raise ValueError(
            f"you can't use /{XRAY_SUBSCRIPTION_PATH}/ as subscription path it reserved for {app.title}"
        )
    scheduler.start()


@app.on_event("shutdown")
def on_shutdown():
    scheduler.shutdown()


@app.exception_handler(RequestValidationError)
def validation_exception_handler(request: Request, exc: RequestValidationError):
    details = {}
    for error in exc.errors():
        details[error["loc"][-1]] = error.get("msg")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=jsonable_encoder({"detail": details}),
    )
