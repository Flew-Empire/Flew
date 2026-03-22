# Руководство по системе мониторинга трафика Xpert Panel

## 🎯 Обзор

Система мониторинга трафика позволяет отслеживать использование **внешних VPN серверов** через Xpert Panel с последующей интеграцией в Xpert UI.

## ✅ Возможности

- ✅ **Отслеживание трафика** через чужие сервера (не ваши)
- ✅ **Статистика в ГБ** по пользователям и серверам
- ✅ **Webhook система** для приема данных от клиентов
- ✅ **Интеграция с Xpert UI** через API
- ✅ **Middleware логирование** подписных запросов
- ✅ **Очистка старых данных** по требованию
- ✅ **SQLite база** с индексами для быстрой работы

## 🚀 Быстрый старт

### 1. Проверка конфигурации

Убедитесь что в `.env` файле есть:

```env
XPERT_TRAFFIC_TRACKING_ENABLED=True
XPERT_TRAFFIC_DB_PATH=data/traffic_stats.db
XPERT_TRAFFIC_RETENTION_DAYS=0
XPERT_DOMAIN=your-domain.com
```

### 2. Перезапуск панели

```bash
# Перезапустите Xpert Panel для загрузки нового middleware
sudo systemctl restart xpert
# или
python3 main.py
```

### 3. Проверка работы

```bash
# Тестирование системы
cd /opt/xpert
python3 test_traffic_simple.py
```

## 📊 Использование API

### 🔗 Webhook для приема трафика

**Эндпоинт:** `POST /api/xpert/traffic-webhook`

**Тело запроса:**
```json
{
    "user_token": "user123",
    "server": "vpn.example.com",
    "port": 443,
    "protocol": "vless",
    "bytes_uploaded": 1048576,
    "bytes_downloaded": 2097152
}
```

**Ответ:**
```json
{
    "status": "success",
    "message": "Traffic recorded successfully"
}
```

### 👤 Статистика пользователя

**Эндпоинт:** `GET /api/xpert/traffic-stats/{user_token}?days=30`

**Ответ:**
```json
{
    "user_token": "user123",
    "total_gb_used": 2.456,
    "period_days": 30,
    "servers": [
        {
            "server": "vpn.example.com",
            "port": 443,
            "protocol": "vless",
            "upload_gb": 0.856,
            "download_gb": 1.600,
            "total_gb": 2.456,
            "connections": 15,
            "last_used": "2024-02-10 19:20:00"
        }
    ]
}
```

### 🌍 Глобальная статистика

**Эндпоинт:** `GET /api/xpert/traffic-stats/global?days=30`

**Ответ:**
```json
{
    "total_users": 25,
    "total_servers": 150,
    "total_gb_used": 125.789,
    "total_connections": 1250,
    "total_protocols": 4,
    "period_days": 30,
    "top_servers": [
        {
            "server": "fast.vpn.com",
            "port": 443,
            "protocol": "vless",
            "total_gb": 45.123
        }
    ]
}
```

### 🖥️ Интеграция с Xpert UI

**Эндпоинт:** `GET /api/xpert/xpert-traffic-stats?days=30`

**Ответ (совместимый с Xpert):**
```json
{
    "users_traffic": {
        "total_users": 25,
        "total_servers": 150,
        "total_gb_used": 125.789,
        "total_connections": 1250,
        "total_protocols": 4,
        "period_days": 30,
        "external_servers": true,
        "integration_type": "xpert",
        "data_source": "traffic_monitoring_system"
    }
}
```

## 📱 Подписные URL с отслеживанием

### Базовая подписка

```
GET /api/xpert/sub?user_token=user123
```

**Заголовки ответа:**
```
Content-Type: text/plain; charset=utf-8
Profile-Update-Interval: 1
Subscription-Userinfo: upload=64000000; download=128000000; total=192000000; expire=0
Profile-Title: Xpert Panel
Traffic-Webhook: https://your-domain.com/api/xpert/traffic-webhook
User-Token: user123
```

### Direct Configurations подписка

```
GET /api/xpert/direct-configs/sub?user_token=user123
```

**Заголовки ответа:**
```
Content-Type: text/plain; charset=utf-8
Profile-Update-Interval: 1
Subscription-Userinfo: upload=64000000; download=128000000; total=192000000; expire=0
Profile-Title: Xpert Direct
Traffic-Webhook: https://your-domain.com/api/xpert/traffic-webhook
User-Token: user123
```

## 🧪 Примеры использования

### 1. Клиентское приложение

```python
import requests

# Получение подписки
response = requests.get("https://your-domain.com/api/xpert/sub?user_token=user123")
webhook_url = response.headers.get('Traffic-Webhook')
user_token = response.headers.get('User-Token')

# Отправка статистики трафика
traffic_data = {
    "user_token": user_token,
    "server": "used.vpn.com",
    "port": 443,
    "protocol": "vless",
    "bytes_uploaded": 1048576,
    "bytes_downloaded": 2097152
}

requests.post(webhook_url, json=traffic_data)
```

### 2. Bash скрипт для мониторинга

```bash
#!/bin/bash
# Мониторинг трафика для пользователя

USER_TOKEN="user123"
API_BASE="https://your-domain.com/api/xpert"

# Получение статистики
curl -s "${API_BASE}/traffic-stats/${USER_TOKEN}?days=7" | jq '.'
```

### 3. Интеграция с Xpert UI

```javascript
// JavaScript для Xpert UI
async function fetchExternalTrafficStats() {
    const response = await fetch('/api/xpert/xpert-traffic-stats?days=30');
    const data = await response.json();
    
    if (data.users_traffic.external_servers) {
        console.log(`External servers: ${data.users_traffic.total_gb_used} GB used`);
        console.log(`Total users: ${data.users_traffic.total_users}`);
    }
}
```

## 🔧 Управление системой

### Очистка старой статистики

```bash
# Удаление записей старше 90 дней
curl -X POST "https://your-domain.com/api/xpert/traffic-stats/cleanup?days=90"
```

**Ответ:**
```json
{
    "status": "success",
    "deleted_rows": 1250,
    "cleanup_days": 90
}
```

### Информация о базе данных

```bash
curl -s "https://your-domain.com/api/xpert/traffic-stats/database/info" | jq '.'
```

**Ответ:**
```json
{
    "database_path": "data/traffic_stats.db",
    "total_records": 5000,
    "unique_users": 150,
    "unique_servers": 200,
    "database_size_mb": 12.45,
    "retention_days": 0
}
```

## 📈 Производительность

### Оптимизации

- ✅ **SQLite индексы** для быстрых запросов
- ✅ **Middleware кэширование** минимизирует нагрузку
- ✅ **Асинхронные API** эндпоинты
- ✅ **Конфигурируемое хранение** данных

### Нагрузка

- **Минимальная** - ~1-5ms на подписной запрос
- **База данных:** ~0.1MB на 1000 записей
- **Память:** ~10MB для сервиса статистики

## 🛠️ Разработка

### Структура файлов

```
app/xpert/
├── traffic_service.py     # Основной сервис статистики
├── service.py           # Агрегация подписок
├── xpert_integration.py  # Интеграция с Xpert
└── direct_config_service.py # Direct конфигурации

app/routers/
└── xpert.py            # API эндпоинты + middleware

config.py               # Конфигурационные переменные
```

### Тестирование

```bash
# Запуск тестов
cd /opt/xpert
python3 test_traffic_simple.py

# Тестирование API (требует запущенного сервера)
python3 test_traffic_system.py
```

## 🔒 Безопасность

### Защита

- ✅ **Базовая валидация** webhook данных
- ✅ **Логирование** всех запросов
- ✅ **Ограничение доступа** через конфигурацию
- ✅ **SQL injection защита** через параметризованные запросы

### Рекомендации

1. **Используйте HTTPS** для webhook вызовов
2. **Валидируйте** user_token на стороне клиента
3. **Ограничьте** частоту webhook вызовов
4. **Резервируйте** БД статистики регулярно

## 🚨 Поиск проблем

### Распространенные проблемы

1. **База данных не создается**
   ```bash
   mkdir -p data/
   chmod 755 data/
   ```

2. **Webhook не работает**
   - Проверьте `XPERT_DOMAIN` в конфигурации
   - Убедитесь что порт 8000 доступен

3. **Статистика не накапливается**
   - Проверьте что клиенты отправляют данные на webhook
   - Проверьте логи Xpert Panel

4. **Интеграция с Xpert не работает**
   - Проверьте эндпоинт `/api/xpert/xpert-traffic-stats`
   - Убедитесь что `external_servers: true`

## 📞 Поддержка

### Логирование

```bash
# Просмотр логов Xpert Panel
sudo journalctl -u xpert -f

# Или если запущено вручную
tail -f /var/log/xpert.log
```

### Отладка

```bash
# Проверка конфигурации
cd /opt/xpert
python3 -c "
from config import XPERT_TRAFFIC_TRACKING_ENABLED
print('Traffic tracking enabled:', XPERT_TRAFFIC_TRACKING_ENABLED)
"
```

---

**Система мониторинга трафика готова к использованию! 🎉**

Теперь вы можете отслеживать использование трафика через внешние VPN серверы и отображать статистику в Xpert UI.
