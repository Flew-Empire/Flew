import json
import base64
import logging
from typing import Dict, List
from datetime import datetime

logger = logging.getLogger(__name__)

class RoutingService:
    """Сервис для создания Happ routing профилей"""
    
    def __init__(self):
        self.routing_profiles = {
            'tm': {  # Туркменистан
                'name': 'Turkmenistan Routing',
                'description': 'Optimized servers for Turkmenistan',
                'countries': ['TM', 'IR', 'AF', 'UZ', 'KZ'],  # Ближайшие страны
                'priority_countries': ['TM', 'IR', 'KZ', 'UZ']
            },
            'kz': {  # Казахстан
                'name': 'Kazakhstan Routing', 
                'description': 'Optimized servers for Kazakhstan',
                'countries': ['KZ', 'RU', 'UZ', 'KG', 'TM'],
                'priority_countries': ['KZ', 'RU', 'UZ', 'KG']
            },
            'ru': {  # Россия
                'name': 'Russia Routing',
                'description': 'Optimized servers for Russia', 
                'countries': ['RU', 'KZ', 'BY', 'UA', 'GE'],
                'priority_countries': ['RU', 'KZ', 'BY']
            },
            'global': {  # Глобальный
                'name': 'Global Routing',
                'description': 'All servers worldwide',
                'countries': [],  # Все страны
                'priority_countries': ['US', 'DE', 'NL', 'FR', 'GB']
            }
        }
    
    def create_routing_profile(self, profile_key: str, servers: List[Dict]) -> str:
        """Создает routing профиль для Happ"""
        if profile_key not in self.routing_profiles:
            profile_key = 'global'
        
        profile_config = self.routing_profiles[profile_key]
        
        # Фильтруем сервера по стране
        filtered_servers = []
        priority_servers = []
        
        for server in servers:
            server_country = self._get_server_country(server.get('server', ''))
            
            if not profile_config['countries']:  # Global профиль
                filtered_servers.append(server)
            elif server_country in profile_config['countries']:
                filtered_servers.append(server)
                if server_country in profile_config['priority_countries']:
                    priority_servers.append(server)
        
        # Создаем routing конфигурацию
        routing_config = {
            "name": profile_config['name'],
            "description": profile_config['description'],
            "version": "1.0",
            "created": datetime.utcnow().isoformat(),
            "rules": [
                {
                    "type": "country_priority",
                    "countries": profile_config['priority_countries'],
                    "action": "priority"
                },
                {
                    "type": "country_filter", 
                    "countries": profile_config['countries'] if profile_config['countries'] else [],
                    "action": "allow" if profile_config['countries'] else "allow_all"
                },
                {
                    "type": "ping_filter",
                    "max_ping": 1000,
                    "action": "allow"
                }
            ],
            "servers": {
                "total": len(filtered_servers),
                "priority": len(priority_servers),
                "countries": list(set([self._get_server_country(s.get('server', '')) for s in filtered_servers]))
            }
        }
        
        # Конвертируем в Base64 для Happ
        routing_json = json.dumps(routing_config, separators=(',', ':'))
        routing_base64 = base64.b64encode(routing_json.encode()).decode()
        
        logger.info(f"Created routing profile '{profile_config['name']}' with {len(filtered_servers)} servers")
        return routing_base64
    
    def _get_server_country(self, server: str) -> str:
        """Определяет страну сервера"""
        try:
            from app.xpert.geo_service import geo_service
            country_info = geo_service.get_country_info(server)
            return country_info['code']
        except:
            return 'UNKNOWN'
    
    def _detect_user_region(self, user_ip: str = None) -> str:
        """Определяет регион пользователя по IP"""
        if not user_ip:
            # Если IP неизвестен, используем глобальный профиль
            return 'global'
        
        try:
            import requests
            # Используем бесплатный IP геолокационный сервис
            response = requests.get(f"http://ip-api.com/json/{user_ip}", timeout=2)
            if response.status_code == 200:
                data = response.json()
                country_code = data.get('countryCode', '').upper()
                
                # Маппинг стран на профили
                country_to_profile = {
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
                
                profile = country_to_profile.get(country_code, 'global')
                logger.info(f"Detected user region: {country_code} -> profile: {profile}")
                return profile
                
        except Exception as e:
            logger.warning(f"Failed to detect user region for IP {user_ip}: {e}")
        
        return 'global'
    
    def get_routing_link(self, profile_key: str, servers: List[Dict]) -> str:
        """Генерирует Happ routing ссылку"""
        routing_base64 = self.create_routing_profile(profile_key, servers)
        return f"happ://routing/add/{routing_base64}"
    
    def add_routing_to_subscription(self, subscription_content: str, profile_key: str, servers: List[Dict]) -> str:
        """Добавляет routing в подписку"""
        routing_link = self.get_routing_link(profile_key, servers)
        
        # Добавляем routing в начало подписки
        routing_comment = f"# Routing: {routing_link}\n"
        
        return routing_comment + subscription_content

# Глобальный экземпляр
routing_service = RoutingService()
