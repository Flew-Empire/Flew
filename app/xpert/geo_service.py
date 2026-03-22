import re
import socket
from typing import Optional, Dict
import requests
import logging

logger = logging.getLogger(__name__)

class GeoService:
    def __init__(self):
        # Кэш для результатов геолокации
        self._cache: Dict[str, Dict[str, str]] = {}
        
        # Флаги стран (emoji) - расширенный список
        self.country_flags = {
            'US': '🇺🇸', 'GB': '🇬🇧', 'DE': '🇩🇪', 'FR': '🇫🇷', 'NL': '🇳🇱',
            'CA': '🇨🇦', 'AU': '🇦🇺', 'JP': '🇯🇵', 'SG': '🇸🇬', 'KR': '🇰🇷',
            'HK': '🇭🇰', 'IN': '🇮🇳', 'BR': '🇧🇷', 'MX': '🇲🇽', 'AR': '🇦🇷',
            'CL': '🇨🇱', 'PE': '🇵🇪', 'CO': '🇨🇴', 'VE': '🇻🇪', 'RU': '🇷🇺',
            'UA': '🇺🇦', 'PL': '🇵🇱', 'CZ': '🇨🇿', 'SK': '🇸🇰', 'HU': '🇭🇺',
            'RO': '🇷🇴', 'BG': '🇧🇬', 'GR': '🇬🇷', 'TR': '🇹🇷', 'IL': '🇮🇱',
            'AE': '🇦🇪', 'SA': '🇸🇦', 'EG': '🇪🇬', 'ZA': '🇿🇦', 'KE': '🇰🇪',
            'NG': '🇳🇬', 'TH': '🇹🇭', 'VN': '🇻🇳', 'MY': '🇲🇾', 'ID': '🇮🇩',
            'PH': '🇵🇭', 'TW': '🇹🇼', 'CN': '🇨🇳', 'NZ': '🇳🇿', 'CH': '🇨🇭',
            'AT': '🇦🇹', 'BE': '🇧🇪', 'DK': '🇩🇰', 'FI': '🇫🇮', 'IE': '🇮🇪',
            'IS': '🇮🇸', 'LI': '🇱🇮', 'LU': '🇱🇺', 'NO': '🇳🇴', 'PT': '🇵🇹',
            'SE': '🇸🇪', 'ES': '🇪🇸', 'IT': '🇮🇹', 'MT': '🇲🇹', 'CY': '🇨🇾',
            'EE': '🇪🇪', 'LV': '🇱🇻', 'LT': '🇱🇹', 'MD': '🇲🇩', 'SI': '🇸🇮',
            'HR': '🇭🇷', 'BA': '🇧🇦', 'RS': '🇷🇸', 'ME': '🇲🇪', 'AL': '🇦🇱',
            'MK': '🇲🇰', 'XK': '🇽🇰', 'BY': '🇧🇾', 'GE': '🇬🇪', 'AM': '🇦🇲',
            'AZ': '🇦🇿', 'KZ': '🇰🇿', 'UZ': '🇺🇿', 'KG': '🇰🇬', 'TJ': '🇹🇯',
            'TM': '🇹🇲', 'AF': '🇦🇫', 'PK': '🇵🇰', 'BD': '🇧🇩', 'LK': '🇱🇰',
            'NP': '🇳🇵', 'BT': '🇧🇹', 'MV': '🇲🇻', 'MM': '🇲🇲', 'LA': '🇱🇦',
            'KH': '🇰🇭', 'BN': '🇧🇳', 'DO': '🇩🇴', 'CR': '🇨🇷', 'GT': '🇬🇹',
            'PA': '🇵🇦', 'EC': '🇪🇨', 'BO': '🇧🇴', 'PY': '�🇾', 'UY': '🇺🇾',
            'NI': '🇳🇮', 'SV': '🇸🇻', 'HN': '�🇭🇳', 'JM': '🇯🇲', 'TT': '🇹🇹',
            'BB': '🇧🇧', 'GD': '🇬🇩', 'LC': '🇱🇨', 'VC': '🇻🇨', 'AG': '🇦🇬',
            'DM': '🇩🇲', 'KN': '🇰🇳', 'BS': '🇧🇸', 'BM': '🇧🇲', 'KY': '🇰🇾',
            'FK': '🇫🇰', 'GI': '🇬🇮', 'IM': '🇮🇲', 'JE': '🇯🇪', 'GG': '🇬🇬',
            'SH': '🇸🇭', 'MS': '🇲🇸', 'TC': '🇹🇨', 'VG': '🇻🇬', 'AI': '🇦🇮',
            'PM': '🇵🇲', 'WF': '🇼🇫', 'PF': '🇵🇫', 'NU': '🇳🇺', 'CK': '🇨🇰',
            'AS': '🇦🇸', 'GU': '🇬🇺', 'MP': '🇲🇵', 'VI': '🇻🇮', 'PR': '🇵🇷',
            'UM': '🇺🇲', 'PW': '🇵🇼', 'FM': '🇫🇲', 'MH': '🇲🇭', 'KI': '🇰🇮',
            'NR': '🇳🇷', 'TV': '🇹🇻', 'TO': '🇹🇴', 'WS': '🇼🇸', 'SB': '��🇧',
            'VU': '🇻🇺', 'FJ': '🇫🇯', 'NC': '🇳🇨', 'PF': '🇵🇫', 'AS': '🇦🇸',
            'CK': '🇨🇰', 'NU': '🇳🇺', 'TK': '🇹🇰', 'PN': '🇵🇳', 'WF': '🇼🇫'
        }
        
        # Названия стран на английском
        self.country_names = {
            'US': 'United States', 'GB': 'United Kingdom', 'DE': 'Germany',
            'FR': 'France', 'NL': 'Netherlands', 'CA': 'Canada', 'AU': 'Australia',
            'JP': 'Japan', 'SG': 'Singapore', 'KR': 'South Korea', 'HK': 'Hong Kong',
            'IN': 'India', 'BR': 'Brazil', 'MX': 'Mexico', 'AR': 'Argentina',
            'CL': 'Chile', 'PE': 'Peru', 'CO': 'Colombia', 'VE': 'Venezuela',
            'RU': 'Russia', 'UA': 'Ukraine', 'PL': 'Poland', 'CZ': 'Czech Republic',
            'SK': 'Slovakia', 'HU': 'Hungary', 'RO': 'Romania', 'BG': 'Bulgaria',
            'GR': 'Greece', 'TR': 'Turkey', 'IL': 'Israel', 'AE': 'United Arab Emirates',
            'SA': 'Saudi Arabia', 'EG': 'Egypt', 'ZA': 'South Africa', 'KE': 'Kenya',
            'NG': 'Nigeria', 'TH': 'Thailand', 'VN': 'Vietnam', 'MY': 'Malaysia',
            'ID': 'Indonesia', 'PH': 'Philippines', 'TW': 'Taiwan', 'CN': 'China',
            'NZ': 'New Zealand', 'CH': 'Switzerland', 'AT': 'Austria', 'BE': 'Belgium',
            'DK': 'Denmark', 'FI': 'Finland', 'IE': 'Ireland', 'IS': 'Iceland',
            'LI': 'Liechtenstein', 'LU': 'Luxembourg', 'NO': 'Norway', 'PT': 'Portugal',
            'SE': 'Sweden', 'ES': 'Spain', 'IT': 'Italy', 'MT': 'Malta',
            'CY': 'Cyprus', 'EE': 'Estonia', 'LV': 'Latvia', 'LT': 'Lithuania',
            'MD': 'Moldova', 'SI': 'Slovenia', 'HR': 'Croatia', 'BA': 'Bosnia',
            'RS': 'Serbia', 'ME': 'Montenegro', 'AL': 'Albania', 'MK': 'Macedonia',
            'XK': 'Kosovo', 'BY': 'Belarus', 'GE': 'Georgia', 'AM': 'Armenia',
            'AZ': 'Azerbaijan', 'KZ': 'Kazakhstan', 'UZ': 'Uzbekistan', 'KG': 'Kyrgyzstan',
            'TJ': 'Tajikistan', 'TM': 'Turkmenistan', 'AF': 'Afghanistan', 'PK': 'Pakistan',
            'BD': 'Bangladesh', 'LK': 'Sri Lanka', 'NP': 'Nepal', 'BT': 'Bhutan',
            'MV': 'Maldives', 'MM': 'Myanmar', 'LA': 'Laos', 'KH': 'Cambodia',
            'BN': 'Brunei', 'TH': 'Thailand', 'VN': 'Vietnam', 'MY': 'Malaysia',
            'ID': 'Indonesia', 'PH': 'Philippines', 'TW': 'Taiwan', 'CN': 'China',
            'NZ': 'New Zealand', 'CH': 'Switzerland', 'AT': 'Austria', 'BE': 'Belgium',
            'DK': 'Denmark', 'FI': 'Finland', 'IE': 'Ireland', 'IS': 'Iceland',
            'LI': 'Liechtenstein', 'LU': 'Luxembourg', 'NO': 'Norway', 'PT': 'Portugal',
            'SE': 'Sweden', 'ES': 'Spain', 'IT': 'Italy', 'MT': 'Malta'
        }

    def get_server_ip(self, server: str) -> Optional[str]:
        """Получить IP адрес сервера по доменному имени"""
        try:
            return socket.gethostbyname(server)
        except:
            return None

    def get_country_info(self, server: str) -> Dict[str, str]:
        """Получить информацию о стране сервера"""
        # Проверяем кэш
        if server in self._cache:
            return self._cache[server]
        
        # Получаем IP
        ip = self.get_server_ip(server)
        if not ip:
            return {'country': 'Unknown', 'code': 'UN', 'flag': '🌍', 'name': 'Unknown'}
        
        try:
            # Используем бесплатный API для геолокации
            response = requests.get(f"http://ip-api.com/json/{ip}?fields=status,country,countryCode", timeout=3)
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get('status') == 'success':
                    country_code = data.get('countryCode', 'UN')
                    country_name = data.get('country', 'Unknown')
                    
                    # Получаем флаг
                    flag = self.country_flags.get(country_code, '🌍')
                    
                    result = {
                        'country': country_name,
                        'code': country_code,
                        'flag': flag,
                        'name': country_name
                    }
                    
                    # Кэшируем результат
                    self._cache[server] = result
                    return result
        
        except Exception as e:
            print(f"Geo lookup failed for {server}: {e}")
        
        # Если не удалось определить, возвращаем значение по умолчанию
        result = {'country': 'Unknown', 'code': 'UN', 'flag': '🌍', 'name': 'Unknown'}
        self._cache[server] = result
        return result

    def get_flag_display(self, server: str) -> str:
        """Получить отображение с флагом для сервера"""
        info = self.get_country_info(server)
        return f"{info['flag']} {info['name']}"

    def get_simple_name(self, server: str) -> str:
        """Получить простое имя с флагом для конфигурации"""
        info = self.get_country_info(server)
        return f"{info['flag']} {info['code']}"

# Глобальный экземпляр сервиса
geo_service = GeoService()
