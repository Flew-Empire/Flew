#!/usr/bin/env python3
"""
Тестирование UI настроек для Traffic Manager
"""

import sys
import os

# Добавляем путь к app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_ui_files():
    """Проверяем что все UI файлы созданы"""
    print("🎨 Testing UI Files...")
    
    files_to_check = [
        "/opt/xpert/app/dashboard/src/components/TrafficManager.tsx",
        "/opt/xpert/app/dashboard/src/pages/TrafficPage.tsx",
        "/opt/xpert/app/dashboard/src/pages/Router.tsx",
        "/opt/xpert/app/dashboard/src/components/Header.tsx"
    ]
    
    all_exist = True
    for file_path in files_to_check:
        if os.path.exists(file_path):
            print(f"✅ {file_path.split('/')[-1]} exists")
        else:
            print(f"❌ {file_path.split('/')[-1]} missing")
            all_exist = False
    
    return all_exist

def test_api_endpoints():
    """Проверяем что API эндпоинты доступны"""
    print("\n🔗 Testing API Integration...")
    
    try:
        from app.xpert.traffic_service import traffic_service
        
        # Проверяем методы
        methods = [
            'get_admin_traffic_usage',
            'reset_admin_external_traffic', 
            'check_admin_traffic_limit'
        ]
        
        for method in methods:
            if hasattr(traffic_service, method):
                print(f"✅ {method} method exists")
            else:
                print(f"❌ {method} method missing")
                return False
        
        return True
        
    except Exception as e:
        print(f"❌ API test failed: {e}")
        return False

def test_router_config():
    """Проверяем конфигурацию роутера"""
    print("\n🛣️ Testing Router Configuration...")
    
    router_file = "/opt/xpert/app/dashboard/src/pages/Router.tsx"
    
    if not os.path.exists(router_file):
        print("❌ Router.tsx not found")
        return False
    
    with open(router_file, 'r') as f:
        content = f.read()
        
    if 'TrafficPage' in content:
        print("✅ TrafficPage imported")
    else:
        print("❌ TrafficPage not imported")
        return False
    
    if '"/traffic/"' in content:
        print("✅ Traffic route added")
    else:
        print("❌ Traffic route missing")
        return False
    
    return True

def test_header_config():
    """Проверяем конфигурацию Header"""
    print("\n📱 Testing Header Configuration...")
    
    header_file = "/opt/xpert/app/dashboard/src/components/Header.tsx"
    
    if not os.path.exists(header_file):
        print("❌ Header.tsx not found")
        return False
    
    with open(header_file, 'r') as f:
        content = f.read()
        
    if 'TrafficManagerIcon' in content:
        print("✅ TrafficManagerIcon added")
    else:
        print("❌ TrafficManagerIcon missing")
        return False
    
    if '"/traffic/"' in content:
        print("✅ Traffic menu link added")
    else:
        print("❌ Traffic menu link missing")
        return False
    
    if 'Traffic Manager' in content:
        print("✅ Traffic Manager menu item added")
    else:
        print("❌ Traffic Manager menu item missing")
        return False
    
    return True

def print_ui_summary():
    """Выводим сводку по UI"""
    print("\n📚 UI Setup Summary:")
    print("=" * 40)
    
    print("\n🎯 Что создано:")
    print("   • TrafficManager.tsx - компонент управления трафиком")
    print("   • TrafficPage.tsx - отдельная страница для Traffic Manager")
    print("   • Обновлен Router.tsx - добавлен маршрут /traffic/")
    print("   • Обновлен Header.tsx - добавлен пункт меню")
    
    print("\n🔗 Навигация:")
    print("   • Главное меню → ☰ → Traffic Manager")
    print("   • Прямая ссылка: #/traffic/")
    
    print("\n📊 Функционал в UI:")
    print("   • Глобальная статистика трафика")
    print("   • Информация о базе данных")
    print("   • Статистика по пользователям")
    print("   • Кнопки сброса и очистки")
    print("   • Конфигурация системы")
    
    print("\n🎨 Как использовать:")
    print("   1. 🔄 Перезапустите Xpert Panel")
    print("   2. 🌐 Откройте UI в браузере")
    print("   3. ☰ Нажмите на меню (три полоски)")
    print("   4. 📊 Выберите 'Traffic Manager'")
    print("   5. 📈 Просматривайте статистику")
    print("   6. 🗑️ Используйте кнопки управления")
    
    print("\n⚙️ API эндпоинты для UI:")
    endpoints = [
        "GET /api/xpert/core-traffic-stats",
        "GET /api/xpert/traffic-stats/database/info", 
        "GET /api/xpert/traffic-stats/{user_token}",
        "POST /api/xpert/traffic-stats/cleanup"
    ]
    
    for endpoint in endpoints:
        print(f"   • {endpoint}")

def main():
    """Основная функция тестирования"""
    print("🚀 Xpert Panel UI Setup Test")
    print("=" * 40)
    
    # Тестирование файлов
    ui_ok = test_ui_files()
    
    # Тестирование API
    api_ok = test_api_endpoints()
    
    # Тестирование роутера
    router_ok = test_router_config()
    
    # Тестирование хедера
    header_ok = test_header_config()
    
    # Сводка
    print_ui_summary()
    
    # Итог
    print("\n🎯 Setup Test Results:")
    print("=" * 30)
    print(f"UI Files: {'✅ PASS' if ui_ok else '❌ FAIL'}")
    print(f"API Integration: {'✅ PASS' if api_ok else '❌ FAIL'}")
    print(f"Router Config: {'✅ PASS' if router_ok else '❌ FAIL'}")
    print(f"Header Config: {'✅ PASS' if header_ok else '❌ FAIL'}")
    
    if ui_ok and api_ok and router_ok and header_ok:
        print("\n🎉 All UI tests passed! Traffic Manager ready!")
        print("\n📝 Next steps:")
        print("1. 🔄 Перезапустите Xpert Panel")
        print("2. 🌐 Откройте http://your-domain.com")
        print("3. ☰ Откройте меню и выберите 'Traffic Manager'")
        print("4. 📊 Проверьте что статистика отображается")
        print("5. 🎯 Протестируйте кнопки управления")
    else:
        print("\n❌ Some UI tests failed. Please check the implementation.")
    
    print("\n📚 Documentation:")
    print("   • TRAFFIC_MONITORING_GUIDE.md")
    print("   • CORE_INTEGRATION_GUIDE.md")


if __name__ == "__main__":
    main()
