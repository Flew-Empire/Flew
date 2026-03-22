import sys
import asyncio
sys.path.append('.')
from app.xpert.direct_config_service import direct_config_service
from app.xpert.models import DirectConfig

# Тест добавления прямой конфигурации
async def test_direct_config():
    try:
        # Тестовый конфиг
        test_config = 'vless://test-uuid@example.com:443?encryption=none&security=tls&type=ws&host=example.com&path=/#Test-Config'
        
        print('Adding direct config...')
        config = await direct_config_service.add_config(
            raw=test_config,
            remarks='Test Direct Config',
            added_by='test_user'
        )
        
        print(f'Successfully added config: {config.protocol}://{config.server}:{config.port}')
        print(f'Config ID: {config.id}')
        print(f'Bypass whitelist: {config.bypass_whitelist}')
        print(f'Auto sync to Xpert Core: {config.auto_sync_to_core}')
        
        # Проверка получения всех конфигов
        all_configs = direct_config_service.get_all_configs()
        print(f'Total direct configs: {len(all_configs)}')
        
        # Проверка активных конфигов
        active_configs = direct_config_service.get_active_configs()
        print(f'Active direct configs: {len(active_configs)}')
        
        return True
        
    except Exception as e:
        print(f'Error: {e}')
        import traceback
        traceback.print_exc()
        return False

# Запуск теста
if __name__ == "__main__":
    result = asyncio.run(test_direct_config())
    print(f'Test result: {result}')
