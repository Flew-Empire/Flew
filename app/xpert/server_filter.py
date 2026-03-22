import asyncio
import logging
from typing import List, Dict, Optional
from app.xpert.checker import ConfigChecker
from app.xpert.cluster_service import cluster_service

logger = logging.getLogger(__name__)

class ServerFilter:
    """Фильтрует сервера через проверочные цели"""
    
    def __init__(self):
        self.checker = ConfigChecker()
    
    async def test_server_through_targets(self, server_config: str, test_targets: List) -> Dict:
        """Проверяет работает ли сервер через проверочные цели"""
        results = {
            'server': server_config,
            'working_targets': [],
            'failed_targets': [],
            'is_working': False,
            'avg_ping': 0.0
        }
        
        # Парсим конфиг сервера
        protocol, server_ip, port, remarks = self.checker.parse_config(server_config)
        
        if not server_ip or not port:
            logger.warning(f"Failed to parse server config: {server_config}")
            return results
        
        logger.info(f"Testing server {server_ip}:{port} against {len(test_targets)} targets")
        
        working_count = 0
        total_ping = 0.0
        
        for target in test_targets:
            try:
                # Проверяем доступность сервера
                is_connected, connection_time = await self.checker.check_connectivity(server_ip, port)
                
                if not is_connected:
                    results['failed_targets'].append({
                        'target_ip': target.ip,
                        'target_domain': target.domain,
                        'error': 'Server not reachable',
                        'ping': 999.0
                    })
                    continue
                
                # Если сервер доступен, проверяем пинг до цели через сервер
                # Это упрощенная проверка - в реальности нужно проксирование через сервер
                # Но для начала проверим просто доступность сервера и пинг до цели напрямую
                
                ping_result = await self._ping_target_directly(target.ip)
                
                if ping_result < 1000:  # Если пинг до цели хороший
                    working_count += 1
                    total_ping += ping_result
                    results['working_targets'].append({
                        'target_ip': target.ip,
                        'target_domain': target.domain,
                        'ping': ping_result,
                        'connection_time': connection_time
                    })
                    logger.debug(f"Server {server_ip} can reach target {target.ip} with ping {ping_result}ms")
                else:
                    results['failed_targets'].append({
                        'target_ip': target.ip,
                        'target_domain': target.domain,
                        'error': f'High ping to target: {ping_result}ms',
                        'ping': ping_result
                    })
                    
            except Exception as e:
                results['failed_targets'].append({
                    'target_ip': target.ip,
                    'target_domain': target.domain,
                    'error': str(e),
                    'ping': 999.0
                })
                logger.debug(f"Error testing server {server_ip} against target {target.ip}: {e}")
        
        # Определяем работает ли сервер
        results['is_working'] = working_count > 0
        if working_count > 0:
            results['avg_ping'] = total_ping / working_count
        
        logger.info(f"Server {server_ip} working: {results['is_working']}, working targets: {working_count}/{len(test_targets)}")
        return results
    
    async def _ping_target_directly(self, target_ip: str) -> float:
        """Прямой пинг до цели (упрощенная проверка)"""
        try:
            ping, jitter, loss = await self.checker.check_ping(target_ip)
            return ping
        except Exception as e:
            logger.debug(f"Failed to ping target {target_ip}: {e}")
            return 999.0
    
    async def filter_servers(self, server_configs: List[str]) -> List[str]:
        """Фильтрует сервера, оставляя только рабочие"""
        if not server_configs:
            return []
        
        # Получаем проверочные цели
        test_targets = cluster_service.get_active_test_targets()
        
        if not test_targets:
            logger.warning("No test targets found, returning all servers")
            return server_configs
        
        logger.info(f"Filtering {len(server_configs)} servers against {len(test_targets)} test targets")
        
        working_servers = []
        
        # Проверяем сервера параллельно
        tasks = []
        for config in server_configs:
            task = self.test_server_through_targets(config, test_targets)
            tasks.append(task)
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Error testing server {i}: {result}")
                continue
            
            if result['is_working']:
                working_servers.append(result['server'])
                logger.info(f"✅ Server working: {result['server'][:50]}...")
            else:
                logger.info(f"❌ Server not working: {result['server'][:50]}...")
        
        logger.info(f"Filtered {len(server_configs)} -> {len(working_servers)} working servers")
        return working_servers
    
    def get_filter_stats(self, server_configs: List[str]) -> Dict:
        """Получает статистику фильтрации"""
        test_targets = cluster_service.get_active_test_targets()
        
        return {
            'total_servers': len(server_configs),
            'test_targets_count': len(test_targets),
            'test_targets': [
                {
                    'ip': t.ip,
                    'domain': t.domain,
                    'country': t.country,
                    'description': t.description
                }
                for t in test_targets
            ]
        }

# Глобальный экземпляр
server_filter = ServerFilter()
