# Руководство по системе мониторинга трафика Flew Panel

## 🎯 Обзор

Система мониторинга трафика позволяет отслеживать использование **внешних VPN серверов** через Flew Panel с последующей интеграцией в Flew UI.

## ✅ Возможности

- ✅ **Отслеживание трафика** через чужие сервера (не ваши)
- ✅ **Статистика в ГБ** по пользователям и серверам
- ✅ **Webhook система** для приема данных от клиентов
- ✅ **Интеграция с Flew UI** через API
- ✅ **Middleware логирование** подписных запросов
- ✅ **Очистка старых данных** по требованию
- ✅ **SQLite база** с индексами для быстрой работы

## 🚀 Быстрый старт

### 1. Проверка конфигурации

Убедитесь что в `.env` файле есть:

```env
FLEW_TRAFFIC_TRACKING_ENABLED=True
FLEW_TRAFFIC_DB_PATH=data/traffic_stats.db
FLEW_TRAFFIC_RETENTION_DAYS=0
FLEW_DOMAIN=your-domain.com
```

### 2. Перезапуск панели

```bash
# Перезапустите Flew Panel для загрузки нового middleware
sudo systemctl restart flew
# или
python3 main.py
```

### 3. Проверка работы

```bash
# Тестирование системы
cd /opt/flew
python3 test_traffic_simple.py
```

## 📊 Использование API

### 🔗 Webhook для приема трафика

**Эндпоинт:** `POST /api/flew/traffic-webhook`

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

**Эндпоинт:** `GET /api/flew/traffic-stats/{user_token}?days=30`

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

**Эндпоинт:** `GET /api/flew/traffic-stats/global?days=30`

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

### 🖥️ Интеграция с Flew UI

**Эндпоинт:** `GET /api/flew/flew-traffic-stats?days=30`

**Ответ (совместимый с Flew):**
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
        "integration_type": "flew",
        "data_source": "traffic_monitoring_system"
    }
}
```

## 📱 Подписные URL с отслеживанием

### Базовая подписка

```
GET /api/flew/sub?user_token=user123
```

**Заголовки ответа:**
```
Content-Type: text/plain; charset=utf-8
Profile-Update-Interval: 1
Subscription-Userinfo: upload=64000000; download=128000000; total=192000000; expire=0
Profile-Title: Flew Panel
Traffic-Webhook: https://your-domain.com/api/flew/traffic-webhook
User-Token: user123
```

### Direct Configurations подписка

```
GET /api/flew/direct-configs/sub?user_token=user123
```

**Заголовки ответа:**
```
Content-Type: text/plain; charset=utf-8
Profile-Update-Interval: 1
Subscription-Userinfo: upload=64000000; download=128000000; total=192000000; expire=0
Profile-Title: Flew Direct
Traffic-Webhook: https://your-domain.com/api/flew/traffic-webhook
User-Token: user123
```

## 🧪 Примеры использования

### 1. Клиентское приложение

```python
import requests

# Получение подписки
response = requests.get("https://your-domain.com/api/flew/sub?user_token=user123")
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
API_BASE="https://your-domain.com/api/flew"

# Получение статистики
curl -s "${API_BASE}/traffic-stats/${USER_TOKEN}?days=7" | jq '.'
```

### 3. Интеграция с Flew UI

```javascript
// JavaScript для Flew UI
async function fetchExternalTrafficStats() {
    const response = await fetch('/api/flew/flew-traffic-stats?days=30');
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
curl -X POST "https://your-domain.com/api/flew/traffic-stats/cleanup?days=90"
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
curl -s "https://your-domain.com/api/flew/traffic-stats/database/info" | jq '.'
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
app/flew/
├── traffic_service.py     # Основной сервис статистики
├── service.py           # Агрегация подписок
├── flew_integration.py  # Интеграция с Flew
└── direct_config_service.py # Direct конфигурации

app/routers/
└── flew.py            # API эндпоинты + middleware

config.py               # Конфигурационные переменные
```

### Тестирование

```bash
# Запуск тестов
cd /opt/flew
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
   - Проверьте `FLEW_DOMAIN` в конфигурации
   - Убедитесь что порт 8000 доступен

3. **Статистика не накапливается**
   - Проверьте что клиенты отправляют данные на webhook
   - Проверьте логи Flew Panel

4. **Интеграция с Flew не работает**
   - Проверьте эндпоинт `/api/flew/flew-traffic-stats`
   - Убедитесь что `external_servers: true`

## 📞 Поддержка

### Логирование

```bash
# Просмотр логов Flew Panel
sudo journalctl -u flew -f

# Или если запущено вручную
tail -f /var/log/flew.log
```

### Отладка

```bash
# Проверка конфигурации
cd /opt/flew
python3 -c "
from config import FLEW_TRAFFIC_TRACKING_ENABLED
print('Traffic tracking enabled:', FLEW_TRAFFIC_TRACKING_ENABLED)
"
```

---

**Система мониторинга трафика готова к использованию! 🎉**

Теперь вы можете отслеживать использование трафика через внешние VPN серверы и отображать статистику в Flew UI.
