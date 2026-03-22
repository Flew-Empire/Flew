import base64
import json
import logging
import random
import secrets
from collections import defaultdict
from datetime import datetime as dt
from datetime import timedelta
from typing import TYPE_CHECKING, List, Literal, Union
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from jdatetime import date as jd

from app import xray
from app.utils.system import get_public_ip, get_public_ipv6, readable_size

from . import *

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from app.models.user import UserResponse

from config import (
    ACTIVE_STATUS_TEXT,
    DISABLED_STATUS_TEXT,
    EXPIRED_STATUS_TEXT,
    LIMITED_STATUS_TEXT,
    ONHOLD_STATUS_TEXT,
)

SERVER_IP = get_public_ip()
SERVER_IPV6 = get_public_ipv6()

STATUS_EMOJIS = {
    "active": "✅",
    "expired": "⌛️",
    "limited": "🪫",
    "disabled": "❌",
    "on_hold": "🔌",
}

STATUS_TEXTS = {
    "active": ACTIVE_STATUS_TEXT,
    "expired": EXPIRED_STATUS_TEXT,
    "limited": LIMITED_STATUS_TEXT,
    "disabled": DISABLED_STATUS_TEXT,
    "on_hold": ONHOLD_STATUS_TEXT,
}

def _v2box_device_id_case(device_id: str) -> str:
    value = (device_id or "").strip()
    if not value:
        return ""
    if value[:1].islower():
        value = value[0].upper() + value[1:]
    return value


def _inject_device_id_into_vmess(link: str, device_id: str) -> str:
    payload = link[len("vmess://") :]
    if not payload:
        return link
    padded = payload + ("=" * (-len(payload) % 4))
    try:
        raw = base64.b64decode(padded.encode("utf-8"))
        obj = json.loads(raw.decode("utf-8"))
        if not isinstance(obj, dict):
            return link
        if any(str(k).lower() == "deviceid" for k in obj.keys()):
            return link
        obj["deviceID"] = device_id
        encoded = base64.b64encode(
            json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        ).decode("utf-8")
        return "vmess://" + encoded.rstrip("=")
    except Exception:
        return link


def _inject_device_id_into_link(link: str, device_id: str) -> str:
    if not link or "://" not in link:
        return link
    if link.startswith("vmess://"):
        return _inject_device_id_into_vmess(link, device_id)
    if link.startswith("v2box://"):
        return link
    try:
        parts = urlsplit(link)
        if not parts.scheme:
            return link
        query_items = parse_qsl(parts.query, keep_blank_values=True)
        if any(k.lower() == "deviceid" for k, _ in query_items):
            return link
        query_items.append(("deviceID", device_id))
        new_query = urlencode(query_items, doseq=True)
        return urlunsplit((parts.scheme, parts.netloc, parts.path, new_query, parts.fragment))
    except Exception:
        return link


def _apply_v2box_device_id(config: str, device_id: str) -> str:
    if not config or not device_id:
        return config
    device_id = _v2box_device_id_case(device_id)
    if not device_id:
        return config
    lines = []
    for line in config.splitlines():
        stripped = line.strip()
        if not stripped:
            lines.append(line)
            continue
        lines.append(_inject_device_id_into_link(stripped, device_id))
    return "\n".join(lines)



def _xpert_allowed_for_user(extra_data: dict) -> bool:
    user_status = extra_data.get("status")
    if user_status not in ["active", "on_hold"]:
        return False

    data_limit = extra_data.get("data_limit")
    used_traffic = extra_data.get("used_traffic")
    if data_limit is not None and data_limit > 0 and used_traffic is not None and used_traffic >= data_limit:
        return False

    expire = extra_data.get("expire")
    # `expire` of 0 means unlimited in Xpert/Xpert and should stay allowed.
    if expire is not None and expire > 0:
        now_ts = int(dt.utcnow().timestamp())
        if expire <= now_ts:
            return False

    return True

def filter_servers_by_region(configs: list, user_ip: str = None) -> list:
    """Фильтрует сервера по региону пользователя"""
    try:
        # Определяем регион пользователя
        user_region = detect_user_region(user_ip)
        
        # Правила фильтрации по регионам
        region_filters = {
            'tm': ['TM', 'IR', 'AF', 'UZ', 'KZ'],  # Туркменистан
            'kz': ['KZ', 'RU', 'UZ', 'KG', 'TM'],  # Казахстан  
            'ru': ['RU', 'KZ', 'BY', 'UA', 'GE'],  # Россия
            'global': []  # Все страны
        }
        
        allowed_countries = region_filters.get(user_region, [])
        
        if not allowed_countries:  # Global - все сервера
            return configs
            
        filtered_configs = []
        for config in configs:
            try:
                # Получаем страну сервера
                server_name = config.get('remarks', '')
                server = config.get('server', '')
                
                # Пробуем определить страну
                country = None
                if '.' in server:
                    country_info = geo_service.get_country_info(server)
                    country = country_info.get('code', 'UNKNOWN')
                elif server_name:
                    # Ищем код страны в имени
                    import re
                    match = re.search(r'\b([A-Z]{2})\b', server_name)
                    if match:
                        country = match.group(1)
                
                if country in allowed_countries:
                    filtered_configs.append(config)
                    logger.debug(f"Allowed server {server} ({country}) for region {user_region}")
                else:
                    logger.debug(f"Filtered out server {server} ({country}) for region {user_region}")
                    
            except Exception as e:
                logger.debug(f"Error filtering server {config}: {e}")
                # Если не удалось определить, оставляем
                filtered_configs.append(config)
        
        logger.info(f"Filtered {len(configs)} -> {len(filtered_configs)} servers for region {user_region}")
        return filtered_configs
        
    except Exception as e:
        logger.error(f"Error in region filtering: {e}")
        return configs  # Возвращаем все если ошибка

def detect_user_region(user_ip: str = None) -> str:
    """Определяет регион пользователя по IP"""
    if not user_ip:
        return 'global'
    
    try:
        import requests
        response = requests.get(f"http://ip-api.com/json/{user_ip}", timeout=2)
        if response.status_code == 200:
            data = response.json()
            country_code = data.get('countryCode', '').upper()
            
            # Маппинг стран на регионы
            country_to_region = {
                'TM': 'tm',  # Туркменистан
                'KZ': 'kz',  # Казахстан  
                'RU': 'ru',  # Россия
                'UZ': 'kz',  # Узбекистан -> Казахстан
                'KG': 'kz',  # Кыргызстан -> Казахстан
                'TJ': 'kz',  # Таджикистан -> Казахстан
                'BY': 'ru',  # Беларусь -> Россия
                'UA': 'ru',  # Украина -> Россия
                'AZ': 'kz',  # Азербайджан -> Казахстан
                'AM': 'kz',  # Армения -> Казахстан
                'GE': 'kz',  # Грузия -> Казахстан
            }
            
            region = country_to_region.get(country_code, 'global')
            logger.info(f"Detected user region: {country_code} -> {region}")
            return region
            
    except Exception as e:
        logger.warning(f"Failed to detect user region: {e}")
    
    return 'global'


def create_config_from_cluster_server(server, extra_data: dict) -> str:
    """Создает конфигурацию из данных кластерного сервера"""
    try:
        import secrets
        from app import xray
        
        # Получаем UUID пользователя
        user_uuid = extra_data.get('uuid', secrets.token_hex(8))
        
        # Определяем протокол по порту или настройкам
        if server.port == 443:
            protocol = "vless"  # По умолчанию для 443
        else:
            protocol = "vmess"  # Для других портов
        
        # Создаем базовую конфигурацию
        if protocol == "vless":
            config = f"vless://{user_uuid}@{server.ip}:{server.port}?security=tls&type=ws&host={server.host or server.domain}&path=/"
            if server.sni:
                config += f"&sni={server.sni}"
            config += f"#{server.country or 'UNKNOWN'}-{server.ip}"
        else:  # vmess
            vmess_config = {
                "v": "2",
                "ps": f"{server.country or 'UNKNOWN'}-{server.ip}",
                "add": server.ip,
                "port": server.port,
                "id": user_uuid,
                "aid": "0",
                "scy": "auto",
                "net": "ws",
                "type": "none",
                "host": server.host or server.domain,
                "path": "/",
                "tls": "tls",
                "sni": server.sni or server.domain
            }
            import base64
            import json
            config = "vmess://" + base64.b64encode(json.dumps(vmess_config).encode()).decode()
        
        logger.debug(f"Created {protocol} config for {server.ip}")
        return config
        
    except Exception as e:
        logger.error(f"Error creating config from cluster server: {e}")
        return ""


def replace_server_names_with_flags(config_raw: str) -> str:
    try:
        import config as app_config
        
        # Если флаги отключены в настройках, возвращаем как есть
        if not app_config.XPERT_USE_COUNTRY_FLAGS:
            logger.info("Country flags disabled in config, returning original")
            return config_raw
            
        from app.xpert.geo_service import geo_service
        import re
        import logging
        import urllib.parse
        logger = logging.getLogger(__name__)
        
        logger.info(f"Processing config for flags replacement, length: {len(config_raw)}")
        
        # Регулярное выражение для поиска имен серверов в различных форматах
        name_pattern = r'(name="?([^"=,]+)"?)'
        
        def replace_name(match):
            full_match = match.group(1)
            server_name = match.group(2)
            
            logger.debug(f"Processing server name: {server_name}")
            
            # Если имя уже содержит флаг (emoji), не меняем его
            if any(ord(char) > 127 for char in server_name):
                logger.debug(f"Server {server_name} already has flag, skipping")
                return full_match
            
            # Пробуем определить страну по имени сервера
            if '.' in server_name and not server_name.startswith('http'):
                try:
                    country_info = geo_service.get_country_info(server_name.split(':')[0])
                    flag = country_info['flag']
                    code = country_info['code']
                    
                    # Конвертируем emoji в UTF-8 URL-encoded для Happ
                    flag_encoded = urllib.parse.quote(flag.encode('utf-8'))
                    new_name = f"{flag_encoded} {code}"
                    
                    logger.info(f"Replaced '{server_name}' with '{new_name}' (flag: {flag})")
                    return full_match.replace(server_name, new_name)
                except Exception as e:
                    logger.debug(f"Failed to get country for {server_name}: {e}")
            else:
                logger.debug(f"Server name {server_name} doesn't look like domain, skipping")
            
            # Если не удалось определить, оставляем как есть
            return full_match
        
        # Применяем замену
        result = re.sub(name_pattern, replace_name, config_raw)
        
        # Дополнительная обработка для remark полей
        remark_pattern = r'(remark="?([^"=,]+)"?)'
        result = re.sub(remark_pattern, replace_name, result)
        
        # Дополнительная обработка для других полей
        other_patterns = [
            r'(ps="?([^"=,]+)"?)',  # ps field
        ]
        
        for pattern in other_patterns:
            result = re.sub(pattern, replace_name, result)
        
        logger.info(f"Processed config with Happ-compatible flags")
        return result
        
    except Exception as e:
        logger.error(f"Error in replace_server_names_with_flags: {e}")
        import traceback
        logger.error(traceback.format_exc())
        # Если что-то пошло не так, возвращаем оригинал
        return config_raw


def generate_v2ray_links(proxies: dict, inbounds: dict, extra_data: dict, reverse: bool) -> list:
    format_variables = setup_format_variables(extra_data)
    conf = V2rayShareLink()
    
    # Проверяем статус пользователя для фильтрации сторонних серверов
    user_status = extra_data.get('status', '')
    data_limit = extra_data.get('data_limit', 0)
    used_traffic = extra_data.get('used_traffic', 0)
    expire = extra_data.get('expire', 0)
    
    # Определяем, нужно ли скрывать сторонние сервера
    hide_external_servers = False
    import config as app_config
    
    # Если пользователь неактивен - скрываем сторонние сервера
    if user_status not in ['active', 'on_hold']:
        hide_external_servers = True
    
    # Если закончился трафик - скрываем сторонние сервера  
    if data_limit is not None and data_limit > 0 and used_traffic >= data_limit:
        hide_external_servers = True
        
    # Если истек срок - скрываем сторонние сервера
    if expire is not None and expire > 0 and expire <= 0:
        hide_external_servers = True
    
    # Добавляем обычные конфиги Xpert (только если не скрыты)
    if not hide_external_servers:
        xpert_links = process_inbounds_and_tags(inbounds, proxies, format_variables, conf=conf, reverse=reverse)
    else:
        # Если пользователь неактивен, добавляем только заглушку или пусто
        pass
    
    # Добавляем конфиги из Xpert Panel (с автоматической синхронизацией)
    try:
        from app.xpert.service import xpert_service
        from app.xpert.cluster_service import whitelist_service
        from app.xpert.ip_filter import host_filter
        from app.xpert.xpert_integration import xpert_integration
        
        # Автоматическая синхронизация с Xpert при генерации подписки
        # Это гарантирует что Xpert конфиги всегда доступны в Xpert
        try:
            # Проверяем нужно ли синхронизировать (раз в час)
            import time
            current_time = time.time()
            
            # Получаем время последней синхронизации из кэша или файла
            last_sync_time = getattr(xpert_service, '_last_sync_time', 0)
            
            if current_time - last_sync_time > 3600:  # 1 час
                logger.info("Auto-syncing Xpert configs to Xpert during subscription generation")
                xpert_integration.sync_active_configs_to_xpert()
                xpert_service._last_sync_time = current_time
        except Exception as sync_error:
            logger.warning(f"Auto-sync failed: {sync_error}")
        
        # Получаем разрешенные хосты
        allowed_hosts = whitelist_service.get_all_allowed_hosts()
        logger.info(f"Found {len(allowed_hosts)} allowed hosts in whitelist")
        
        # Получаем все конфиги из Xpert
        if not app_config.XPERT_REQUIRE_ACTIVE_STATUS:
            xpert_configs = xpert_service.get_active_configs()
        else:
            # Если пользователь неактивен, не добавляем Xpert конфиги
            if user_status not in ['active', 'on_hold']:
                return conf.render(reverse=reverse)
                
            # Если закончился трафик, не добавляем Xpert конфиги
            if data_limit is not None and data_limit > 0 and used_traffic >= data_limit:
                return conf.render(reverse=reverse)
                
            # Если истек срок, не добавляем Xpert конфиги
            if expire is not None and expire > 0 and expire <= 0:
                return conf.render(reverse=reverse)
            
            xpert_configs = xpert_service.get_active_configs()
        
        # ВСЕГДА фильтруем сервера по разрешенным хостам
        if xpert_configs:
            server_configs = [config.raw for config in xpert_configs]
            logger.info(f"Processing {len(server_configs)} Xpert servers")
            
            if server_configs:
                logger.info(f"Filtering {len(server_configs)} servers by allowed hosts")
                
                # Фильтрация серверов
                filtered_configs = host_filter.filter_servers(server_configs)
                
                logger.info(f"Filtered result: {len(filtered_configs)}/{len(server_configs)} servers allowed")
                
                # Добавляем только разрешенные конфиги
                for config_raw in filtered_configs:
                    config_with_flags = replace_server_names_with_flags(config_raw)
                    conf.add_link(config_with_flags)
                    
    except Exception as e:
        # Если Xpert Panel не настроен, просто игнорируем
        logger.debug(f"Xpert Panel integration failed: {e}")
        pass
    
    return conf.render(reverse=reverse)


def generate_clash_subscription(
        proxies: dict, inbounds: dict, extra_data: dict, reverse: bool, is_meta: bool = False
) -> str:
    if is_meta is True:
        conf = ClashMetaConfiguration()
    else:
        conf = ClashConfiguration()

    format_variables = setup_format_variables(extra_data)
    
    # Добавляем обычные конфиги Xpert
    xpert_config = process_inbounds_and_tags(
        inbounds, proxies, format_variables, conf=conf, reverse=reverse
    )
    
    # Добавляем конфиги из Xpert Panel (только для v2ray формата, clash требует специальной конвертации)
    # Пока пропускаем для clash, так как нужна конвертация в yaml формат
    
    return xpert_config


def generate_singbox_subscription(
        proxies: dict, inbounds: dict, extra_data: dict, reverse: bool
) -> str:
    conf = SingBoxConfiguration()

    format_variables = setup_format_variables(extra_data)
    return process_inbounds_and_tags(
        inbounds, proxies, format_variables, conf=conf, reverse=reverse
    )


def generate_outline_subscription(
        proxies: dict, inbounds: dict, extra_data: dict, reverse: bool,
) -> str:
    conf = OutlineConfiguration()

    format_variables = setup_format_variables(extra_data)
    return process_inbounds_and_tags(
        inbounds, proxies, format_variables, conf=conf, reverse=reverse
    )


def generate_v2ray_json_subscription(
        proxies: dict, inbounds: dict, extra_data: dict, reverse: bool,
) -> str:
    conf = V2rayJsonConfig()

    format_variables = setup_format_variables(extra_data)
    return process_inbounds_and_tags(
        inbounds, proxies, format_variables, conf=conf, reverse=reverse
    )


def generate_subscription(
        user: "UserResponse",
        config_format: Literal["v2ray", "clash-meta", "clash", "sing-box", "outline", "v2ray-json"],
        as_base64: bool,
        reverse: bool,
        v2box_device_id: str | None = None,
) -> str:
    kwargs = {
        "proxies": user.proxies,
        "inbounds": user.inbounds,
        "extra_data": user.__dict__,
        "reverse": reverse,
    }

    if config_format == "v2ray":
        config = "\n".join(generate_v2ray_links(**kwargs))
    elif config_format == "clash-meta":
        config = generate_clash_subscription(**kwargs, is_meta=True)
    elif config_format == "clash":
        config = generate_clash_subscription(**kwargs)
    elif config_format == "sing-box":
        config = generate_singbox_subscription(**kwargs)
    elif config_format == "outline":
        config = generate_outline_subscription(**kwargs)
    elif config_format == "v2ray-json":
        config = generate_v2ray_json_subscription(**kwargs)
    else:
        raise ValueError(f'Unsupported format "{config_format}"')

    # Happ routing injection disabled to avoid forced Geo package prompts in clients.
    if config_format == "v2ray":
        try:
            if _xpert_allowed_for_user(kwargs["extra_data"]):
                from app.xpert.service import xpert_service
                xpert_mix = xpert_service.generate_subscription(format="universal")
                if xpert_mix:
                    config = (config.rstrip("\n") + "\n" + xpert_mix.lstrip("\n")).rstrip("\n") + "\n"
        except Exception as e:
            logger.error(f"Failed to append Xpert mix subscription: {e}")


        # Append per-user remote panel links from local sync cache.
        # This keeps subscription generation fast and avoids remote API calls per request.
        try:
            from app.xpert.panel_sync_service import panel_sync_service

            username = str(kwargs["extra_data"].get("username") or "").strip()
            if username:
                remote_links = panel_sync_service.get_cached_user_links(username)
                if remote_links:
                    existing = {line.strip() for line in config.splitlines() if line.strip()}
                    extra_lines = [link for link in remote_links if link not in existing]
                    if extra_lines:
                        suffix = "\n".join(extra_lines)
                        config = (config.rstrip("\n") + "\n" + suffix.lstrip("\n")).rstrip("\n") + "\n"
        except Exception as e:
            logger.error(f"Failed to append remote panel links: {e}")

        if v2box_device_id:
            config = _apply_v2box_device_id(config, v2box_device_id)

    if as_base64:
        config = base64.b64encode(config.encode()).decode()

    return config


def format_time_left(seconds_left: int) -> str:
    if not seconds_left or seconds_left <= 0:
        return "∞"

    minutes, seconds = divmod(seconds_left, 60)
    hours, minutes = divmod(minutes, 60)
    days, hours = divmod(hours, 24)
    months, days = divmod(days, 30)

    result = []
    if months:
        result.append(f"{months}m")
    if days:
        result.append(f"{days}d")
    if hours and (days < 7):
        result.append(f"{hours}h")
    if minutes and not (months or days):
        result.append(f"{minutes}m")
    if seconds and not (months or days):
        result.append(f"{seconds}s")
    return " ".join(result)


def setup_format_variables(extra_data: dict) -> dict:
    from app.models.user import UserStatus

    user_status = extra_data.get("status")
    expire_timestamp = extra_data.get("expire")
    on_hold_expire_duration = extra_data.get("on_hold_expire_duration")
    now = dt.utcnow()
    now_ts = now.timestamp()

    if user_status != UserStatus.on_hold:
        # `expire_timestamp` <= 0 is treated as unlimited.
        if expire_timestamp is not None and expire_timestamp > 0:
            seconds_left = expire_timestamp - int(dt.utcnow().timestamp())
            expire_datetime = dt.fromtimestamp(expire_timestamp)
            expire_date = expire_datetime.date()
            jalali_expire_date = jd.fromgregorian(
                year=expire_date.year, month=expire_date.month, day=expire_date.day
            ).strftime("%Y-%m-%d")
            if now_ts < expire_timestamp:
                days_left = (expire_datetime - dt.utcnow()).days + 1
                time_left = format_time_left(seconds_left)
            else:
                days_left = "0"
                time_left = "0"

        else:
            days_left = "∞"
            time_left = "∞"
            expire_date = "∞"
            jalali_expire_date = "∞"
    else:
        if on_hold_expire_duration is not None and on_hold_expire_duration >= 0:
            days_left = timedelta(seconds=on_hold_expire_duration).days
            time_left = format_time_left(on_hold_expire_duration)
            expire_date = "-"
            jalali_expire_date = "-"
        else:
            days_left = "∞"
            time_left = "∞"
            expire_date = "∞"
            jalali_expire_date = "∞"

    if extra_data.get("data_limit"):
        data_limit = readable_size(extra_data["data_limit"])
        data_left = extra_data["data_limit"] - extra_data["used_traffic"]
        if data_left < 0:
            data_left = 0
        data_left = readable_size(data_left)
    else:
        data_limit = "∞"
        data_left = "∞"

    status_emoji = STATUS_EMOJIS.get(extra_data.get("status")) or ""
    status_text = STATUS_TEXTS.get(extra_data.get("status")) or ""

    format_variables = defaultdict(
        lambda: "<missing>",
        {
            "SERVER_IP": SERVER_IP,
            "SERVER_IPV6": SERVER_IPV6,
            "USERNAME": extra_data.get("username", "{USERNAME}"),
            "DATA_USAGE": readable_size(extra_data.get("used_traffic")),
            "DATA_LIMIT": data_limit,
            "DATA_LEFT": data_left,
            "DAYS_LEFT": days_left,
            "EXPIRE_DATE": expire_date,
            "JALALI_EXPIRE_DATE": jalali_expire_date,
            "TIME_LEFT": time_left,
            "STATUS_EMOJI": status_emoji,
            "STATUS_TEXT": status_text,
        },
    )

    return format_variables


def process_inbounds_and_tags(
        inbounds: dict,
        proxies: dict,
        format_variables: dict,
        conf: Union[
            V2rayShareLink,
            V2rayJsonConfig,
            SingBoxConfiguration,
            ClashConfiguration,
            ClashMetaConfiguration,
            OutlineConfiguration
        ],
        reverse=False,
) -> Union[List, str]:
    _inbounds = []
    for protocol, tags in inbounds.items():
        for tag in tags:
            _inbounds.append((protocol, [tag]))
    index_dict = {proxy: index for index, proxy in enumerate(
        xray.config.inbounds_by_tag.keys())}
    inbounds = sorted(
        _inbounds, key=lambda x: index_dict.get(x[1][0], float('inf')))

    for protocol, tags in inbounds:
        settings = proxies.get(protocol)
        if not settings:
            continue

        format_variables.update({"PROTOCOL": protocol.name})
        for tag in tags:
            inbound = xray.config.inbounds_by_tag.get(tag)
            if not inbound:
                continue

            format_variables.update({"TRANSPORT": inbound["network"]})
            host_inbound = inbound.copy()
            for host in xray.hosts.get(tag, []):
                sni = ""
                sni_list = host["sni"] or inbound["sni"]
                if sni_list:
                    salt = secrets.token_hex(8)
                    sni = random.choice(sni_list).replace("*", salt)

                if sids := inbound.get("sids"):
                    inbound["sid"] = random.choice(sids)

                req_host = ""
                req_host_list = host["host"] or inbound["host"]
                if req_host_list:
                    salt = secrets.token_hex(8)
                    req_host = random.choice(req_host_list).replace("*", salt)

                address = ""
                address_list = host['address']
                if host['address']:
                    salt = secrets.token_hex(8)
                    address = random.choice(address_list).replace('*', salt)

                if host["path"] is not None:
                    path = host["path"].format_map(format_variables)
                else:
                    path = inbound.get("path", "").format_map(format_variables)

                if host.get("use_sni_as_host", False) and sni:
                    req_host = sni

                host_inbound.update(
                    {
                        "port": host["port"] or inbound["port"],
                        "sni": sni,
                        "host": req_host,
                        "tls": inbound["tls"] if host["tls"] is None else host["tls"],
                        "alpn": host["alpn"] if host["alpn"] else None,
                        "path": path,
                        "fp": host["fingerprint"] or inbound.get("fp", ""),
                        "ais": host["allowinsecure"]
                        or inbound.get("allowinsecure", ""),
                        "mux_enable": host["mux_enable"],
                        "fragment_setting": host["fragment_setting"],
                        "noise_setting": host["noise_setting"],
                        "random_user_agent": host["random_user_agent"],
                    }
                )

                # Заменяем имя сервера на флаг страны
                original_remark = host["remark"].format_map(format_variables)
                flag_remark = replace_server_names_with_flags(f"name={original_remark}")
                # Извлекаем только имя с флагом
                flag_remark = flag_remark.replace("name=", "").strip('"')
                
                conf.add(
                    remark=flag_remark,
                    address=address.format_map(format_variables),
                    inbound=host_inbound,
                    settings=settings.model_dump()
                )

    return conf.render(reverse=reverse)


def encode_title(text: str) -> str:
    return f"base64:{base64.b64encode(text.encode()).decode()}"
