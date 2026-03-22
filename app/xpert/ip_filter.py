import logging
import re
from typing import List, Set
from urllib.parse import urlparse
from app.xpert.cluster_service import whitelist_service

logger = logging.getLogger(__name__)

class HostFilter:
    """Фильтрует сервера по белому списку хостов (IP и домены)"""
    
    def __init__(self):
        self.allowed_hosts: Set[str] = set()
    
    def update_allowed_hosts(self):
        """Обновляет кэш разрешенных хостов"""
        self.allowed_hosts = whitelist_service.get_all_allowed_hosts()
        logger.info(f"Updated allowed hosts cache: {len(self.allowed_hosts)} hosts")
    
    def extract_address_from_config(self, config: str) -> str:
        """Извлекает address (IP или домен) из конфигурации"""
        try:
            # Пробуем разные форматы конфигов
            
            # VLESS/VLESS/TROJAN: vless://uuid@ADDRESS:PORT?...
            if config.startswith(('vless://', 'trojan://')):
                match = re.search(r'@([^:]+):', config)
                if match:
                    address = match.group(1)
                    logger.debug(f"Extracted address {address} from VLESS/Trojan config")
                    return address
            
            # VMESS: vmess://BASE64
            elif config.startswith('vmess://'):
                import base64
                try:
                    decoded = base64.b64decode(config[8:]).decode('utf-8')
                    data = eval(decoded)  # В реальном коде нужно использовать json.loads
                    address = data.get('add', '')
                    if address:
                        logger.debug(f"Extracted address {address} from VMESS config")
                        return address
                except:
                    pass
            
            # Shadowsocks: ss://BASE64
            elif config.startswith('ss://'):
                import base64
                try:
                    # Убираем префикс и декодируем
                    encoded = config[5:]
                    if encoded.endswith('/'):
                        encoded = encoded[:-1]
                    
                    # Добавляем padding если нужно
                    padding_needed = len(encoded) % 4
                    if padding_needed:
                        encoded += '=' * (4 - padding_needed)
                    
                    decoded = base64.b64decode(encoded).decode('utf-8')
                    
                    # Формат: method:password@ADDRESS:PORT
                    if '@' in decoded:
                        match = re.search(r'@([^:]+):', decoded)
                        if match:
                            address = match.group(1)
                            logger.debug(f"Extracted address {address} from SS config")
                            return address
                except:
                    pass
            
            # SSR: ssr://BASE64
            elif config.startswith('ssr://'):
                import base64
                try:
                    encoded = config[6:]
                    padding_needed = len(encoded) % 4
                    if padding_needed:
                        encoded += '=' * (4 - padding_needed)
                    
                    decoded = base64.urlsafe_b64decode(encoded).decode('utf-8')
                    parts = decoded.split(':')
                    if len(parts) >= 2:
                        address = parts[0]
                        logger.debug(f"Extracted address {address} from SSR config")
                        return address
                except:
                    pass
            
            logger.warning(f"Could not extract address from config: {config[:50]}...")
            return ""
            
        except Exception as e:
            logger.error(f"Error extracting address from config: {e}")
            return ""
    
    def is_address_allowed(self, address: str) -> bool:
        """Проверяет разрешен ли address (IP или домен)"""
        if not address:
            return False
        
        # Обновляем кэш если пуст
        if not self.allowed_hosts:
            self.update_allowed_hosts()
        
        return address in self.allowed_hosts
    
    def filter_servers(self, server_configs: List[str]) -> List[str]:
        """Фильтрует сервера, оставляя только с разрешенными адресами"""
        if not server_configs:
            return []
        
        # Обновляем разрешенные хосты
        self.update_allowed_hosts()
        
        if not self.allowed_hosts:
            logger.warning("No allowed hosts configured, returning all servers")
            return server_configs
        
        logger.info(f"Filtering {len(server_configs)} servers against {len(self.allowed_hosts)} allowed hosts")
        
        filtered_servers = []
        
        for config in server_configs:
            address = self.extract_address_from_config(config)
            
            if self.is_address_allowed(address):
                filtered_servers.append(config)
                logger.info(f"✅ Allowed server: {address}")
            else:
                logger.info(f"❌ Blocked server: {address} (not in whitelist)")
        
        logger.info(f"Filtered result: {len(filtered_servers)}/{len(server_configs)} servers allowed")
        return filtered_servers
    
    def get_filter_stats(self) -> dict:
        """Получает статистику фильтрации"""
        self.update_allowed_hosts()
        
        return {
            'allowed_hosts_count': len(self.allowed_hosts),
            'allowed_hosts': list(self.allowed_hosts),
            'whitelists_count': len(whitelist_service.whitelists),
            'whitelists_stats': whitelist_service.get_whitelist_stats()
        }

# Глобальный экземпляр
host_filter = HostFilter()
