import asyncio
import base64
import json
import re
import socket
import ssl
import subprocess
import time
import logging
from typing import List, Tuple, Optional
from urllib.parse import urlparse, parse_qs, unquote
import httpx

import config

logger = logging.getLogger(__name__)


class ConfigChecker:
    """Проверка и парсинг VPN конфигураций"""
    
    def __init__(self):
        self.max_ping = config.XPERT_MAX_PING_MS
        self.target_ips = config.XPERT_TARGET_CHECK_IPS
        self.timeout = 3
        self._target_probe_cache = {
            "ts": 0.0,
            "ok": False,
            "avg_ping": 999.0,
            "success_count": 0,
        }
        self._target_probe_ttl_sec = 30.0
    
    def parse_config(self, raw: str) -> Tuple[str, str, int, str]:
        """Парсинг конфигурации VPN"""
        raw = raw.strip()
        protocol = ""
        server = ""
        port = 0
        remarks = ""
        
        logger.info(f"Parsing config: {raw[:50]}...")
        
        try:
            if raw.startswith("vless://"):
                protocol = "vless"
                server, port, remarks = self._parse_vless(raw)
                logger.info(f"VLESS parsed: server={server}, port={port}")
            elif raw.startswith("vmess://"):
                protocol = "vmess"
                server, port, remarks = self._parse_vmess(raw)
                logger.info(f"VMESS parsed: server={server}, port={port}")
            elif raw.startswith("trojan://"):
                protocol = "trojan"
                server, port, remarks = self._parse_trojan(raw)
                logger.info(f"TROJAN parsed: server={server}, port={port}")
            elif raw.startswith("ss://"):
                protocol = "shadowsocks"
                server, port, remarks = self._parse_shadowsocks(raw)
                logger.info(f"SS parsed: server={server}, port={port}")
            elif raw.startswith("ssr://"):
                protocol = "ssr"
                server, port, remarks = self._parse_ssr(raw)
                logger.info(f"SSR parsed: server={server}, port={port}")
            else:
                logger.warning(f"Unknown protocol: {raw[:20]}...")
        except Exception as e:
            logger.error(f"Failed to parse config: {e}")
        
        return protocol, server, port, remarks
    
    def _parse_vless(self, raw: str) -> Tuple[str, int, str]:
        try:
            parsed = urlparse(raw)
            server = parsed.hostname or ""
            port = parsed.port or 443
            remarks = unquote(parsed.fragment) if parsed.fragment else ""
            return server, port, remarks
        except:
            return "", 0, ""
    
    def _parse_vmess(self, raw: str) -> Tuple[str, int, str]:
        try:
            import json
            encoded = raw.replace("vmess://", "")
            padding = 4 - len(encoded) % 4
            if padding != 4:
                encoded += "=" * padding
            decoded = base64.b64decode(encoded).decode('utf-8')
            data = json.loads(decoded)
            server = data.get("add", "")
            port = int(data.get("port", 443))
            remarks = data.get("ps", "")
            return server, port, remarks
        except:
            return "", 0, ""
    
    def _parse_trojan(self, raw: str) -> Tuple[str, int, str]:
        try:
            parsed = urlparse(raw)
            server = parsed.hostname or ""
            port = parsed.port or 443
            remarks = unquote(parsed.fragment) if parsed.fragment else ""
            return server, port, remarks
        except:
            return "", 0, ""
    
    def _parse_shadowsocks(self, raw: str) -> Tuple[str, int, str]:
        try:
            parsed = urlparse(raw)
            server = parsed.hostname or ""
            port = parsed.port or 443
            remarks = unquote(parsed.fragment) if parsed.fragment else ""
            return server, port, remarks
        except:
            return "", 0, ""
    
    def _parse_ssr(self, raw: str) -> Tuple[str, int, str]:
        try:
            encoded = raw.replace("ssr://", "")
            padding = 4 - len(encoded) % 4
            if padding != 4:
                encoded += "=" * padding
            decoded = base64.urlsafe_b64decode(encoded).decode('utf-8')
            parts = decoded.split(":")
            if len(parts) >= 2:
                server = parts[0]
                port = int(parts[1])
                return server, port, ""
        except:
            pass
        return "", 0, ""
    
    async def check_connectivity(self, host: str, port: int) -> Tuple[bool, float]:
        """Комплексная проверка доступности сервера"""
        try:
            # Метод 1: TCP соединение (самый надежный)
            start_time = time.time()
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(5)  # 5 секунд таймаут
            result = sock.connect_ex((host, port))
            end_time = time.time()
            sock.close()
            
            if result == 0:
                tcp_time = (end_time - start_time) * 1000  # в миллисекундах
                logger.debug(f"TCP connection successful to {host}:{port} in {tcp_time:.2f}ms")
                return True, tcp_time
            else:
                logger.debug(f"TCP connection failed to {host}:{port}")
                
        except Exception as e:
            logger.debug(f"TCP check failed for {host}:{port}: {e}")
        
        # Метод 2: HTTP/HTTPS проверка (если порт 80/443)
        if port in [80, 443, 8080, 8443]:
            try:
                import httpx
                protocol = "https" if port in [443, 8443] else "http"
                url = f"{protocol}://{host}:{port}"
                
                start_time = time.time()
                async with httpx.AsyncClient(timeout=5, verify=False) as client:
                    response = await client.head(url)
                    end_time = time.time()
                    
                if response.status_code < 500:
                    http_time = (end_time - start_time) * 1000
                    logger.debug(f"HTTP check successful to {url} in {http_time:.2f}ms")
                    return True, http_time
                    
            except Exception as e:
                logger.debug(f"HTTP check failed for {host}:{port}: {e}")
        
        return False, 999.0

    def check_connectivity_sync(self, host: str, port: int, timeout: float = 2.5) -> Tuple[bool, float]:
        """Синхронная TCP-проверка доступности для вызова из API-хендлеров."""
        try:
            start_time = time.time()
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            result = sock.connect_ex((host, port))
            end_time = time.time()
            sock.close()

            if result == 0:
                tcp_time = max(1.0, (end_time - start_time) * 1000)
                return True, tcp_time
        except Exception:
            pass
        return False, 999.0

    def check_tls_handshake_sync(self, host: str, port: int, timeout: float = 3.0) -> Tuple[bool, float]:
        """Синхронная проверка TCP+TLS handshake."""
        raw_sock = None
        tls_sock = None
        try:
            start_time = time.time()
            raw_sock = socket.create_connection((host, port), timeout=timeout)
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            tls_sock = context.wrap_socket(raw_sock, server_hostname=host)
            end_time = time.time()
            return True, max(1.0, (end_time - start_time) * 1000)
        except Exception as e:
            # EOF/Unexpected EOF during TLS handshake показываем отдельным значением.
            err = str(e).lower()
            if "eof" in err or "unexpected eof" in err:
                return False, 1200.0
            return False, 999.0
        finally:
            try:
                if tls_sock:
                    tls_sock.close()
            except Exception:
                pass
            try:
                if raw_sock:
                    raw_sock.close()
            except Exception:
                pass

    def should_use_tls_probe(self, raw: str, protocol: str, port: int) -> bool:
        """Определяет, нужен ли TLS-handshake probe."""
        p = (protocol or "").lower()
        r = (raw or "").lower()

        if port in [443, 8443, 2053, 2083, 2087, 2096]:
            return True

        if p == "trojan":
            return True
        if p == "vmess" and self._vmess_uses_tls(raw):
            return True

        tls_markers = [
            "security=tls",
            "security=reality",
            "tls=1",
            "type=grpc",
            "sni=",
            "alpn=",
        ]
        return any(m in r for m in tls_markers)

    def _vmess_uses_tls(self, raw: str) -> bool:
        try:
            if not raw.startswith("vmess://"):
                return False
            encoded = raw.replace("vmess://", "")
            padding = 4 - len(encoded) % 4
            if padding != 4:
                encoded += "=" * padding
            data = json.loads(base64.b64decode(encoded).decode("utf-8"))
            tls_val = str(data.get("tls", "")).lower()
            scy_val = str(data.get("scy", "")).lower()
            if tls_val in ["tls", "reality", "1", "true"]:
                return True
            if scy_val in ["tls", "reality"]:
                return True
            return any(bool(data.get(k)) for k in ["sni", "alpn", "fp", "pbk"])
        except Exception:
            return False

    def _probe_target_ips_tls_cached(self, timeout: float = 2.0) -> Tuple[bool, float]:
        now = time.time()
        if (now - self._target_probe_cache["ts"]) < self._target_probe_ttl_sec:
            return self._target_probe_cache["ok"], self._target_probe_cache["avg_ping"]

        pings = []
        for ip in self.target_ips or []:
            ip = str(ip).strip()
            if not ip:
                continue
            ok, ping_ms = self.check_tls_handshake_sync(ip, 443, timeout=timeout)
            if ok:
                pings.append(float(ping_ms))

        ok = len(pings) > 0
        avg_ping = (sum(pings) / len(pings)) if ok else 999.0
        self._target_probe_cache = {
            "ts": now,
            "ok": ok,
            "avg_ping": float(avg_ping),
            "success_count": len(pings),
        }
        return ok, float(avg_ping)

    def probe_endpoint_sync(self, raw: str, protocol: str, host: str, port: int, timeout: float = 2.5) -> Tuple[bool, float]:
        """Унифицированная проверка endpoint: TLS-handshake или TCP connect."""
        if self.should_use_tls_probe(raw, protocol, port):
            cfg_ok, cfg_ping = self.check_tls_handshake_sync(host, port, timeout=timeout)
        else:
            cfg_ok, cfg_ping = self.check_connectivity_sync(host, port, timeout=timeout)

        # Дополнительно учитываем TLS-handshake до Target IPs (кешировано).
        target_ok, target_ping = self._probe_target_ips_tls_cached(timeout=min(2.0, timeout))
        if cfg_ok and target_ok:
            mixed = (float(cfg_ping) * 0.7) + (float(target_ping) * 0.3)
            return True, max(1.0, mixed)
        return cfg_ok, float(cfg_ping)
    
    async def check_ping(self, host: str) -> Tuple[float, float, float]:
        """Улучшенная проверка пинга с fallback на connectivity"""
        try:
            # Сначала пробуем ICMP ping
            process = await asyncio.create_subprocess_exec(
                "ping", "-c", "2", "-W", "2", host,  # Уменьшили количество и таймаут
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout=5)
            output = stdout.decode()
            
            times = re.findall(r'time[=<](\d+\.?\d*)', output)
            if times:
                pings = [float(t) for t in times]
                avg_ping = sum(pings) / len(pings)
                jitter = max(pings) - min(pings) if len(pings) > 1 else 0
                
                loss_match = re.search(r'(\d+)% packet loss', output)
                loss = float(loss_match.group(1)) if loss_match else 0
                
                logger.debug(f"ICMP ping to {host}: {avg_ping:.2f}ms, loss: {loss}%")
                return avg_ping, jitter, loss
                
        except Exception as e:
            logger.debug(f"ICMP ping failed for {host}: {e}")
        
        # Fallback: если ICMP не работает, возвращаем высокие значения
        # Но проверка connectivity будет в основном методе
        return 999.0, 0.0, 100.0
    
    def check_port(self, host: str, port: int) -> bool:
        """Проверка доступности порта"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(self.timeout)
            result = sock.connect_ex((host, port))
            sock.close()
            return result == 0
        except:
            return False
    
    async def fetch_subscription(self, url: str) -> List[str]:
        """Получение конфигураций из URL подписки"""
        configs = []
        try:
            # Улучшенные заголовки для GitHub и других сервисов
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                "Accept": "text/plain, application/octet-stream, */*",
                "Accept-Encoding": "gzip, deflate",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache"
            }
            
            # Настройки клиента с поддержкой SSL
            async with httpx.AsyncClient(
                timeout=30, 
                follow_redirects=True,
                verify=False  # Отключаем проверку SSL для проблемных сертификатов
            ) as client:
                response = await client.get(url, headers=headers)
                
                if response.status_code == 200:
                    content = response.text
                    
                    # Проверяем если контент уже содержит готовые конфиги
                    if any(proto in content for proto in ['vless://', 'vmess://', 'trojan://', 'ss://', 'ssr://']):
                        # Это готовые конфиги, используем как есть
                        final_content = content
                        logger.info(f"Detected direct configs from {url}")
                    else:
                        # Попробуем декодировать base64
                        decoded_content = content
                        for attempt in range(3):
                            try:
                                # Убираем возможные пробелы и переносы
                                clean_content = content.strip().replace('\n', '').replace('\r', '')
                                # Добавляем padding если нужно
                                padding_needed = len(clean_content) % 4
                                if padding_needed:
                                    clean_content += '=' * (4 - padding_needed)
                                
                                decoded = base64.b64decode(clean_content).decode('utf-8')
                                decoded_content = decoded
                                logger.info(f"Successfully decoded base64 from {url}")
                                break
                            except Exception as e:
                                if attempt == 2:  # Последняя попытка
                                    logger.debug(f"Base64 decode failed after 3 attempts: {e}")
                                continue
                        
                        # Используем декодированный контент или оригинал
                        final_content = decoded_content if decoded_content != content else content
                    
                    # Разбиваем на строки и фильтруем
                    for line in final_content.split('\n'):
                        line = line.strip()
                        if line and any(line.startswith(p) for p in ['vless://', 'vmess://', 'trojan://', 'ss://', 'ssr://']):
                            configs.append(line)
                    
                    logger.info(f"Fetched {len(configs)} configs from {url}")
                    
                else:
                    logger.error(f"HTTP {response.status_code} for {url}")
                    
        except httpx.SSLError as e:
            logger.error(f"SSL error for {url}: {e}")
        except httpx.TimeoutException as e:
            logger.error(f"Timeout for {url}: {e}")
        except Exception as e:
            logger.error(f"Failed to fetch subscription {url}: {e}")
        
        return configs
    
    def process_config(self, raw: str) -> Optional[dict]:
        """Обработка одной конфигурации с TCP-проверкой доступности."""
        protocol, server, port, remarks = self.parse_config(raw)
        
        if not server or not port:
            logger.warning(f"Failed to parse server/port from: {raw}")
            return None
        
        logger.info(f"Added config: {protocol}://{server}:{port} - {remarks[:30]}...")
        
        ok, tcp_ping = self.probe_endpoint_sync(raw, protocol, server, port, timeout=2.5)
        if ok:
            is_active = True
            ping, jitter, loss = tcp_ping, 0.0, 0.0
        else:
            is_active = False
            ping, jitter, loss = 999.0, 0.0, 100.0
        
        return {
            "raw": raw,
            "protocol": protocol,
            "server": server,
            "port": port,
            "remarks": remarks or f"{protocol.upper()}-{server[:15]}",
            "ping_ms": ping,
            "jitter_ms": jitter,
            "packet_loss": loss,
            "is_active": is_active
        }


checker = ConfigChecker()
