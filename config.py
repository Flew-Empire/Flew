import os

from decouple import config
from dotenv import load_dotenv
from app.utils.edition_names import normalize_edition_name

load_dotenv()


SQLALCHEMY_DATABASE_URL = config("SQLALCHEMY_DATABASE_URL", default="sqlite:///db.sqlite3")
SQLALCHEMY_POOL_SIZE = config("SQLALCHEMY_POOL_SIZE", cast=int, default=10)
SQLIALCHEMY_MAX_OVERFLOW = config("SQLIALCHEMY_MAX_OVERFLOW", cast=int, default=30)

UVICORN_HOST = config("UVICORN_HOST", default="0.0.0.0")
UVICORN_PORT = config("UVICORN_PORT", cast=int, default=8000)
UVICORN_UDS = config("UVICORN_UDS", default=None)
UVICORN_SSL_CERTFILE = config("UVICORN_SSL_CERTFILE", default=None)
UVICORN_SSL_KEYFILE = config("UVICORN_SSL_KEYFILE", default=None)
UVICORN_SSL_CA_TYPE = config("UVICORN_SSL_CA_TYPE", default="public").lower()
DASHBOARD_PATH = config("DASHBOARD_PATH", default="/")

DEBUG = config("DEBUG", default=False, cast=bool)
DOCS = config("DOCS", default=False, cast=bool)

ALLOWED_ORIGINS = config("ALLOWED_ORIGINS", default="*").split(",")

VITE_BASE_API = f"http://127.0.0.1:{UVICORN_PORT}/api/" \
    if DEBUG and config("VITE_BASE_API", default="/api/") == "/api/" \
    else config("VITE_BASE_API", default="/api/")

XRAY_JSON = config("XRAY_JSON", default="./xray_config.json")
if XRAY_JSON and not os.path.isabs(XRAY_JSON):
    XRAY_JSON = os.path.abspath(os.path.join(os.path.dirname(__file__), XRAY_JSON))
XRAY_RUNTIME_JSON = config("XRAY_RUNTIME_JSON", default="/usr/local/etc/xray/config.json")
if XRAY_RUNTIME_JSON and not os.path.isabs(XRAY_RUNTIME_JSON):
    XRAY_RUNTIME_JSON = os.path.abspath(os.path.join(os.path.dirname(__file__), XRAY_RUNTIME_JSON))
XRAY_FALLBACKS_INBOUND_TAG = config("XRAY_FALLBACKS_INBOUND_TAG", cast=str, default="") or config(
    "XRAY_FALLBACK_INBOUND_TAG", cast=str, default=""
)
XRAY_EXECUTABLE_PATH = config("XRAY_EXECUTABLE_PATH", default="/usr/local/bin/xray")
XRAY_ASSETS_PATH = config("XRAY_ASSETS_PATH", default="/usr/local/share/xray")
XRAY_EXCLUDE_INBOUND_TAGS = config("XRAY_EXCLUDE_INBOUND_TAGS", default='').split()
XRAY_SUBSCRIPTION_URL_PREFIX = config("XRAY_SUBSCRIPTION_URL_PREFIX", default="").strip("/")
XRAY_SUBSCRIPTION_PATH = config("XRAY_SUBSCRIPTION_PATH", default="sub").strip("/")

TELEGRAM_API_TOKEN = config("TELEGRAM_API_TOKEN", default="")
TELEGRAM_ADMIN_ID = config(
    'TELEGRAM_ADMIN_ID',
    default="",
    cast=lambda v: [int(i) for i in filter(str.isdigit, (s.strip() for s in v.split(',')))]
)
TELEGRAM_PROXY_URL = config("TELEGRAM_PROXY_URL", default="")
TELEGRAM_LOGGER_CHANNEL_ID = config("TELEGRAM_LOGGER_CHANNEL_ID", cast=int, default=0)
TELEGRAM_DEFAULT_VLESS_FLOW = config("TELEGRAM_DEFAULT_VLESS_FLOW", default="")

JWT_ACCESS_TOKEN_EXPIRE_MINUTES = config("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", cast=int, default=1440)

CUSTOM_TEMPLATES_DIRECTORY = config("CUSTOM_TEMPLATES_DIRECTORY", default=None)
SUBSCRIPTION_PAGE_TEMPLATE = config("SUBSCRIPTION_PAGE_TEMPLATE", default="subscription/index.html")
HOME_PAGE_TEMPLATE = config("HOME_PAGE_TEMPLATE", default="home/index.html")

CLASH_SUBSCRIPTION_TEMPLATE = config("CLASH_SUBSCRIPTION_TEMPLATE", default="clash/default.yml")
CLASH_SETTINGS_TEMPLATE = config("CLASH_SETTINGS_TEMPLATE", default="clash/settings.yml")

SINGBOX_SUBSCRIPTION_TEMPLATE = config("SINGBOX_SUBSCRIPTION_TEMPLATE", default="singbox/default.json")
SINGBOX_SETTINGS_TEMPLATE = config("SINGBOX_SETTINGS_TEMPLATE", default="singbox/settings.json")

MUX_TEMPLATE = config("MUX_TEMPLATE", default="mux/default.json")

V2RAY_SUBSCRIPTION_TEMPLATE = config("V2RAY_SUBSCRIPTION_TEMPLATE", default="v2ray/default.json")
V2RAY_SETTINGS_TEMPLATE = config("V2RAY_SETTINGS_TEMPLATE", default="v2ray/settings.json")

USER_AGENT_TEMPLATE = config("USER_AGENT_TEMPLATE", default="user_agent/default.json")
GRPC_USER_AGENT_TEMPLATE = config("GRPC_USER_AGENT_TEMPLATE", default="user_agent/grpc.json")

EXTERNAL_CONFIG = config("EXTERNAL_CONFIG", default="", cast=str)
LOGIN_NOTIFY_WHITE_LIST = [ip.strip() for ip in config("LOGIN_NOTIFY_WHITE_LIST",
                                                       default="", cast=str).split(",") if ip.strip()]

# Login captcha (optional brute-force protection)
LOGIN_CAPTCHA_ENABLED = config("LOGIN_CAPTCHA_ENABLED", default=False, cast=bool)
LOGIN_CAPTCHA_VENDOR = config("LOGIN_CAPTCHA_VENDOR", default="turnstile")
LOGIN_CAPTCHA_SITE_KEY = config("LOGIN_CAPTCHA_SITE_KEY", default="")
LOGIN_CAPTCHA_SECRET = config("LOGIN_CAPTCHA_SECRET", default="")
LOGIN_CAPTCHA_THRESHOLD = config("LOGIN_CAPTCHA_THRESHOLD", cast=int, default=3)
LOGIN_CAPTCHA_WINDOW_SECONDS = config("LOGIN_CAPTCHA_WINDOW_SECONDS", cast=int, default=600)
LOGIN_CAPTCHA_REQUIRED_SECONDS = config("LOGIN_CAPTCHA_REQUIRED_SECONDS", cast=int, default=1800)

USE_CUSTOM_JSON_DEFAULT = config("USE_CUSTOM_JSON_DEFAULT", default=False, cast=bool)
USE_CUSTOM_JSON_FOR_V2RAYN = config("USE_CUSTOM_JSON_FOR_V2RAYN", default=False, cast=bool)
USE_CUSTOM_JSON_FOR_V2RAYNG = config("USE_CUSTOM_JSON_FOR_V2RAYNG", default=False, cast=bool)
USE_CUSTOM_JSON_FOR_STREISAND = config("USE_CUSTOM_JSON_FOR_STREISAND", default=False, cast=bool)
USE_CUSTOM_JSON_FOR_HAPP = config("USE_CUSTOM_JSON_FOR_HAPP", default=False, cast=bool)

NOTIFY_STATUS_CHANGE = config("NOTIFY_STATUS_CHANGE", default=True, cast=bool)
NOTIFY_USER_CREATED = config("NOTIFY_USER_CREATED", default=True, cast=bool)
NOTIFY_USER_UPDATED = config("NOTIFY_USER_UPDATED", default=True, cast=bool)
NOTIFY_USER_DELETED = config("NOTIFY_USER_DELETED", default=True, cast=bool)
NOTIFY_USER_DATA_USED_RESET = config("NOTIFY_USER_DATA_USED_RESET", default=True, cast=bool)
NOTIFY_USER_SUB_REVOKED = config("NOTIFY_USER_SUB_REVOKED", default=True, cast=bool)
NOTIFY_IF_DATA_USAGE_PERCENT_REACHED = config("NOTIFY_IF_DATA_USAGE_PERCENT_REACHED", default=True, cast=bool)
NOTIFY_IF_DAYS_LEFT_REACHED = config("NOTIFY_IF_DAYS_LEFT_REACHED", default=True, cast=bool)
NOTIFY_LOGIN = config("NOTIFY_LOGIN", default=True, cast=bool)

ACTIVE_STATUS_TEXT = config("ACTIVE_STATUS_TEXT", default="Active")
EXPIRED_STATUS_TEXT = config("EXPIRED_STATUS_TEXT", default="Expired")
LIMITED_STATUS_TEXT = config("LIMITED_STATUS_TEXT", default="Limited")
DISABLED_STATUS_TEXT = config("DISABLED_STATUS_TEXT", default="Disabled")
ONHOLD_STATUS_TEXT = config("ONHOLD_STATUS_TEXT", default="On-Hold")

USERS_AUTODELETE_DAYS = config("USERS_AUTODELETE_DAYS", default=-1, cast=int)
USER_AUTODELETE_INCLUDE_LIMITED_ACCOUNTS = config("USER_AUTODELETE_INCLUDE_LIMITED_ACCOUNTS", default=False, cast=bool)


# USERNAME: PASSWORD
SUDOERS = {config("SUDO_USERNAME"): config("SUDO_PASSWORD")} \
    if config("SUDO_USERNAME", default='') and config("SUDO_PASSWORD", default='') \
    else {}


WEBHOOK_ADDRESS = config(
    'WEBHOOK_ADDRESS',
    default="",
    cast=lambda v: [address.strip() for address in v.split(',')] if v else []
)
WEBHOOK_SECRET = config("WEBHOOK_SECRET", default=None)

# recurrent notifications

# timeout between each retry of sending a notification in seconds
RECURRENT_NOTIFICATIONS_TIMEOUT = config("RECURRENT_NOTIFICATIONS_TIMEOUT", default=180, cast=int)
# how many times to try after ok response not recevied after sending a notifications
NUMBER_OF_RECURRENT_NOTIFICATIONS = config("NUMBER_OF_RECURRENT_NOTIFICATIONS", default=3, cast=int)

# sends a notification when the user uses this much of thier data
NOTIFY_REACHED_USAGE_PERCENT = config(
    "NOTIFY_REACHED_USAGE_PERCENT",
    default="80",
    cast=lambda v: [int(p.strip()) for p in v.split(',')] if v else []
)

# sends a notification when there is n days left of their service
NOTIFY_DAYS_LEFT = config(
    "NOTIFY_DAYS_LEFT",
    default="3",
    cast=lambda v: [int(d.strip()) for d in v.split(',')] if v else []
)

DISABLE_RECORDING_NODE_USAGE = config("DISABLE_RECORDING_NODE_USAGE", cast=bool, default=False)

# headers: profile-update-interval, support-url, profile-title
SUB_UPDATE_INTERVAL = config("SUB_UPDATE_INTERVAL", default="12")
SUB_SUPPORT_URL = config("SUB_SUPPORT_URL", default="https://t.me/")
SUB_PROFILE_TITLE = config("SUB_PROFILE_TITLE", default="Flew")

# discord webhook log
DISCORD_WEBHOOK_URL = config("DISCORD_WEBHOOK_URL", default="")


# Interval jobs, all values are in seconds
JOB_CORE_HEALTH_CHECK_INTERVAL = config("JOB_CORE_HEALTH_CHECK_INTERVAL", cast=int, default=10)
JOB_RECORD_NODE_USAGES_INTERVAL = config("JOB_RECORD_NODE_USAGES_INTERVAL", cast=int, default=30)
JOB_RECORD_USER_USAGES_INTERVAL = config("JOB_RECORD_USER_USAGES_INTERVAL", cast=int, default=10)
JOB_REVIEW_USERS_INTERVAL = config("JOB_REVIEW_USERS_INTERVAL", cast=int, default=10)
JOB_SEND_NOTIFICATIONS_INTERVAL = config("JOB_SEND_NOTIFICATIONS_INTERVAL", cast=int, default=30)

# ============================================
# FLEW PANEL - Subscription Aggregation
# ============================================
FLEW_DOMAIN = config("FLEW_DOMAIN", default="home.turkmendili.ru")
FLEW_TARGET_CHECK_IPS = config("FLEW_TARGET_CHECK_IPS", default="93.171.220.198,185.69.186.175").split(",")
FLEW_MAX_PING_MS = config("FLEW_MAX_PING_MS", cast=int, default=300)
FLEW_UPDATE_INTERVAL_HOURS = config("FLEW_UPDATE_INTERVAL_HOURS", cast=int, default=1)
FLEW_REDIS_URL = config("FLEW_REDIS_URL", default="")
FLEW_REQUIRE_ACTIVE_STATUS = config("FLEW_REQUIRE_ACTIVE_STATUS", cast=bool, default=True)
FLEW_USE_DYNAMIC_FILTERING = config("FLEW_USE_DYNAMIC_FILTERING", cast=bool, default=True)
FLEW_MIN_USERS_FOR_STATS = config("FLEW_MIN_USERS_FOR_STATS", cast=int, default=3)
FLEW_TOP_SERVERS_LIMIT = config("FLEW_TOP_SERVERS_LIMIT", cast=int, default=1000)  # Убираем лимит
FLEW_USE_COUNTRY_FLAGS = config("FLEW_USE_COUNTRY_FLAGS", cast=bool, default=True)
JOB_SUBSCRIPTION_AGGREGATION_INTERVAL = config("JOB_SUBSCRIPTION_AGGREGATION_INTERVAL", cast=int, default=3600)
FLEW_TRAFFIC_TRACKING_ENABLED = config("FLEW_TRAFFIC_TRACKING_ENABLED", cast=bool, default=True)
FLEW_TRAFFIC_DB_PATH = config("FLEW_TRAFFIC_DB_PATH", default="data/traffic_stats.db")
FLEW_TRAFFIC_RETENTION_DAYS = config("FLEW_TRAFFIC_RETENTION_DAYS", cast=int, default=0)
FLEW_IP_ROTATION_WINDOW_SECONDS = config("FLEW_IP_ROTATION_WINDOW_SECONDS", cast=int, default=0)

# ============================================
# Flew Free - Edition and Features
# ============================================
FLEW_EDITION = normalize_edition_name(
    config("FLEW_EDITION", default="free"), default="free"
)
FLEW_FEATURES = [
    item.strip().lower()
    for item in config("FLEW_FEATURES", default="").split(",")
    if item.strip()
]
ADMIN_CHAT_MAIN_ADMIN = config("ADMIN_CHAT_MAIN_ADMIN", default="").strip().lower()
ADMIN_CHAT_LOCKED_SUDOERS = [
    item.strip().lower()
    for item in config("ADMIN_CHAT_LOCKED_SUDOERS", default="").split(",")
    if item.strip()
]
INSTALL_OTP_ALLOWED_ADMINS = [
    item.strip().lower()
    for item in config("INSTALL_OTP_ALLOWED_ADMINS", default="").split(",")
    if item.strip()
]
XPANEL_ENABLED = False

INSTALL_RELEASES_DIR = config("INSTALL_RELEASES_DIR", default="releases").strip()
INSTALL_CLIENT_SCRIPT = config(
    "INSTALL_CLIENT_SCRIPT", default="scripts/install_client.sh"
).strip()
INSTALL_DOWNLOAD_TOKEN_TTL_SECONDS = config(
    "INSTALL_DOWNLOAD_TOKEN_TTL_SECONDS", cast=int, default=900
)
