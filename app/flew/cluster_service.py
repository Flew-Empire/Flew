import json
import logging
from typing import Dict, List, Optional, Set
from datetime import datetime
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

@dataclass
class AllowedHost:
    """Разрешенный хост (IP или домен)"""
    host: str  # IP или домен
    description: str = ""
    country: str = ""
    is_active: bool = True
    added_at: str = ""

@dataclass 
class HostWhitelist:
    """Белый список хостов (IP и домены)"""
    id: str
    name: str
    description: str
    allowed_hosts: List[AllowedHost]
    created_at: str
    updated_at: str
    is_active: bool = True

class WhitelistService:
    """Сервис управления белым списком хостов (IP и домены)"""
    
    def __init__(self):
        self.whitelists: Dict[str, HostWhitelist] = {}
        self.storage_file = "host_whitelist.json"
        self._load_whitelists()
    
    def _load_whitelists(self):
        """Загружает белые списки из файла"""
        try:
            with open(self.storage_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for whitelist_id, whitelist_data in data.items():
                    hosts = [AllowedHost(**host) for host in whitelist_data['allowed_hosts']]
                    self.whitelists[whitelist_id] = HostWhitelist(
                        id=whitelist_data['id'],
                        name=whitelist_data['name'],
                        description=whitelist_data['description'],
                        allowed_hosts=hosts,
                        created_at=whitelist_data['created_at'],
                        updated_at=whitelist_data['updated_at'],
                        is_active=whitelist_data.get('is_active', True)
                    )
                logger.info(f"Loaded {len(self.whitelists)} host whitelists")
        except FileNotFoundError:
            logger.info("No host whitelist file found, starting empty")
        except Exception as e:
            logger.error(f"Error loading host whitelist: {e}")
    
    def _save_whitelists(self):
        """Сохраняет белые списки в файл"""
        try:
            data = {}
            for whitelist_id, whitelist in self.whitelists.items():
                data[whitelist_id] = {
                    'id': whitelist.id,
                    'name': whitelist.name,
                    'description': whitelist.description,
                    'allowed_hosts': [asdict(host) for host in whitelist.allowed_hosts],
                    'created_at': whitelist.created_at,
                    'updated_at': whitelist.updated_at,
                    'is_active': whitelist.is_active
                }
            
            with open(self.storage_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            logger.info(f"Saved {len(self.whitelists)} host whitelists")
        except Exception as e:
            logger.error(f"Error saving host whitelist: {e}")
    
    def create_whitelist(self, name: str, description: str = "") -> str:
        """Создает новый белый список хостов"""
        whitelist_id = f"whitelist_{len(self.whitelists) + 1}_{int(datetime.now().timestamp())}"
        
        whitelist = HostWhitelist(
            id=whitelist_id,
            name=name,
            description=description,
            allowed_hosts=[],
            created_at=datetime.utcnow().isoformat(),
            updated_at=datetime.utcnow().isoformat()
        )
        
        self.whitelists[whitelist_id] = whitelist
        self._save_whitelists()
        
        logger.info(f"Created host whitelist: {name} ({whitelist_id})")
        return whitelist_id
    
    def add_allowed_host(self, whitelist_id: str, host: str, description: str = "", country: str = "") -> bool:
        """Добавляет разрешенный хост (IP или домен) в белый список"""
        if whitelist_id not in self.whitelists:
            logger.error(f"Host whitelist {whitelist_id} not found")
            return False
        
        allowed_host = AllowedHost(
            host=host,
            description=description,
            country=country,
            added_at=datetime.utcnow().isoformat()
        )
        
        self.whitelists[whitelist_id].allowed_hosts.append(allowed_host)
        self.whitelists[whitelist_id].updated_at = datetime.utcnow().isoformat()
        self._save_whitelists()
        
        logger.info(f"Added allowed host {host} to whitelist {whitelist_id}")
        return True
    
    def get_all_allowed_hosts(self) -> Set[str]:
        """Получает все разрешенные хосты (IP и домены)"""
        allowed_hosts = set()
        
        for whitelist in self.whitelists.values():
            if not whitelist.is_active:
                continue
                
            for host in whitelist.allowed_hosts:
                if host.is_active:
                    allowed_hosts.add(host.host)
        
        logger.info(f"Found {len(allowed_hosts)} allowed hosts")
        return allowed_hosts
    
    def update_host_status(self, host: str, is_active: bool):
        """Обновляет статус хоста"""
        for whitelist in self.whitelists.values():
            for allowed_host in whitelist.allowed_hosts:
                if allowed_host.host == host:
                    allowed_host.is_active = is_active
                    whitelist.updated_at = datetime.utcnow().isoformat()
                    self._save_whitelists()
                    logger.info(f"Updated host {host}: active={is_active}")
                    return True
        
        logger.warning(f"Host {host} not found in any whitelist")
        return False
    
    def delete_whitelist(self, whitelist_id: str) -> bool:
        """Удаляет белый список"""
        if whitelist_id not in self.whitelists:
            logger.error(f"Host whitelist {whitelist_id} not found")
            return False
        
        del self.whitelists[whitelist_id]
        self._save_whitelists()
        
        logger.info(f"Deleted host whitelist {whitelist_id}")
        return True
    
    def remove_host_from_whitelist(self, whitelist_id: str, host: str) -> bool:
        """Удаляет хост из белого списка"""
        if whitelist_id not in self.whitelists:
            logger.error(f"Host whitelist {whitelist_id} not found")
            return False
        
        whitelist = self.whitelists[whitelist_id]
        original_count = len(whitelist.allowed_hosts)
        
        whitelist.allowed_hosts = [
            h for h in whitelist.allowed_hosts if h.host != host
        ]
        
        if len(whitelist.allowed_hosts) < original_count:
            whitelist.updated_at = datetime.utcnow().isoformat()
            self._save_whitelists()
            logger.info(f"Removed host {host} from whitelist {whitelist_id}")
            return True
        else:
            logger.warning(f"Host {host} not found in whitelist {whitelist_id}")
            return False
    
    def get_whitelist_stats(self) -> Dict:
        """Получает статистику по белым спискам"""
        total_whitelists = len(self.whitelists)
        active_whitelists = sum(1 for w in self.whitelists.values() if w.is_active)
        total_hosts = sum(len(w.allowed_hosts) for w in self.whitelists.values())
        active_hosts = sum(
            sum(1 for h in w.allowed_hosts if h.is_active)
            for w in self.whitelists.values()
        )
        
        return {
            "total_whitelists": total_whitelists,
            "active_whitelists": active_whitelists,
            "total_hosts": total_hosts,
            "active_hosts": active_hosts
        }
    
    def get_all_whitelists(self) -> List[HostWhitelist]:
        """Получает все белые списки"""
        return list(self.whitelists.values())

# Глобальный экземпляр
whitelist_service = WhitelistService()
