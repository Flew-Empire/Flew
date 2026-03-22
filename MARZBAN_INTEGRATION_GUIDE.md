# Руководство по интеграции с Xpert Panel

## 🎯 Обзор

Система мониторинга трафика полностью интегрирована с Xpert Panel! Теперь кнопки **"Сбросить трафик"** и **"Лимит трафика"** работают как для обычных пользователей Xpert, так и для внешних серверов через Xpert Panel.

## ✅ Что реализовано

### 🔄 Кнопка "Сбросить трафик"
- **Эндпоинт:** `POST /api/admin/usage/reset/{username}`
- **Функционал:** Сбрасывает И Xpert трафик, И внешний трафик
- **Результат:** Полная очистка статистики использования

### 📊 Кнопка "Лимит трафика"  
- **Эндпоинт:** `GET /api/admin/usage/{username}`
- **Функционал:** Показывает ОБЩЕЕ использование (Xpert + внешний трафик)
- **Учет:** Внешний трафик добавляется к `users_usage` админа

### 📈 Детальная статистика
- **Эндпоинт:** `GET /api/admin/usage/{username}/detailed`
- **Функционал:** Раздельная статистика по источникам трафика
- **Данные:** Xpert GB + External GB + лимиты

## 🚀 Использование в Xpert UI

### 1. Стандартное использование
Когда вы нажимаете кнопку "Сбросить трафик" в Xpert UI:

```javascript
// UI отправляет запрос на:
POST /api/admin/usage/reset/admin1

// Система выполняет:
1. crud.reset_admin_usage() - сброс Xpert трафика
2. traffic_service.reset_admin_external_traffic() - сброс внешнего трафика
3. Возвращает обновленный admin объект
```

### 2. Просмотр статистики
Когда вы открываете страницу администратора:

```javascript
// UI запрашивает:
GET /api/admin/usage/admin1

// Система возвращает:
{
  "xpert_usage_bytes": 1073741824,     // Стандартный трафик Xpert
  "external_traffic_gb": 2.456,             // Внешний трафик в ГБ
  "total_usage_bytes": 3640646656,        // ОБЩИЙ трафик в байтах
  "traffic_limit_bytes": 10737418240,       // Лимит из админа
  "limit_check": {                           // Проверка лимита
    "within_limit": false,
    "percentage_used": 33.9
  }
}
```

### 3. Детальная статистика
Для детального анализа:

```javascript
// UI запрашивает:
GET /api/admin/usage/admin1/detailed

// Возвращает полную разбивку:
{
  "username": "admin1",
  "xpert_usage_bytes": 1073741824,     // 1.0 GB стандартного
  "external_traffic": {                       // Статистика внешних серверов
    "external_traffic_gb": 2.456,           // 2.456 GB внешнего
    "external_unique_users": 15,              // 15 уникальных пользователей
    "external_unique_servers": 8               // 8 уникальных серверов
  },
  "total_usage_bytes": 3640646656,        // 3.456 GB всего
  "traffic_limit_bytes": 10737418240,       // 10 GB лимит
  "limit_check": {
    "within_limit": false,                    // Превышен лимит
    "percentage_used": 34.6                   // 34.6% использовано
  }
}
```

## 🔗 Новые API эндпоинты

### Основные эндпоинты

| Метод | Эндпоинт | Описание |
|-------|------------|----------|
| **Сброс всего трафика** | `POST /api/admin/usage/reset/{username}` | Сбрасывает Xpert + внешний трафик |
| **Общее использование** | `GET /api/admin/usage/{username}` | Возвращает суммарное использование |
| **Детальная статистика** | `GET /api/admin/usage/{username}/detailed` | Разбивка по источникам трафика |

### Дополнительные эндпоинты

| Метод | Эндпоинт | Описание |
|-------|------------|----------|
| **Сброс внешнего трафика** | `POST /api/admin/external-traffic/reset/{username}` | Только внешний трафик |
| **Статистика внешнего** | `GET /api/admin/external-traffic/stats/{username}` | Только внешняя статистика |

## 📊 Примеры использования

### Пример 1: Администратор с лимитом 10GB

```bash
# Администратор установил лимит:
# traffic_limit = 10737418240  # 10GB в байтах

# Клиенты использовали внешние серверы:
# - 2.456 GB через внешние VPN
# - 1.000 GB через Xpert

# UI покажет:
# Total: 3.456 GB / 10.000 GB (34.6% использовано)
# Status: Лимит превышен!
```

### Пример 2: Сброс трафика

```bash
# Нажимаем кнопку "Сбросить трафик"

# Запрос:
curl -X POST "https://your-domain.com/api/admin/usage/reset/admin1" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Ответ:
{
  "username": "admin1",
  "users_usage": 0,                          // Xpert трафик сброшен
  "traffic_limit": 10737418240,
  // ... другие поля
}

# Результат:
# - Вся статистика очищена
# - Счетчики обнулены
# - UI показывает 0 использование
```

### Пример 3: Проверка лимитов

```bash
# UI автоматически проверяет лимиты:
if (total_usage > traffic_limit) {
  showWarning("Лимит трафика превышен!");
  disableButton("Новые подключения");
}
```

## 🎯 Интеграция с UI

### Цветовые индикаторы

```css
.traffic-status {
  padding: 8px 12px;
  border-radius: 4px;
  font-weight: bold;
}

.traffic-status.ok {
  background: #10b981;
  color: white;
}

.traffic-status.warning {
  background: #f59e0b;
  color: white;
}

.traffic-status.danger {
  background: #ef4444;
  color: white;
}
```

### JavaScript примеры

```javascript
// Получение статистики для админа
async function fetchAdminUsage(username) {
  const response = await fetch(`/api/admin/usage/${username}`);
  const data = await response.json();
  
  return {
    totalUsageGB: (data.total_usage_bytes / (1024**3)).toFixed(2),
    limitGB: (data.traffic_limit_bytes / (1024**3)).toFixed(2),
    percentageUsed: data.limit_check?.percentage_used || 0,
    withinLimit: data.limit_check?.within_limit || true,
    xpertUsageGB: (data.xpert_usage_bytes / (1024**3)).toFixed(2),
    externalTrafficGB: data.external_traffic?.external_traffic_gb || 0
  };
}

// Сброс трафика
async function resetTraffic(username) {
  const response = await fetch(`/api/admin/usage/reset/${username}`, {
    method: 'POST'
  });
  
  if (response.ok) {
    showNotification('Трафик успешно сброшен', 'success');
    // Обновить UI
    await fetchAdminUsage(username);
  }
}

// Обновление индикаторов
function updateTrafficUI(usage) {
  const progressBar = document.getElementById('traffic-progress');
  const statusElement = document.getElementById('traffic-status');
  
  progressBar.style.width = `${usage.percentageUsed}%`;
  statusElement.textContent = `${usage.totalUsageGB}GB / ${usage.limitGB}GB`;
  
  statusElement.className = `traffic-status ${
    usage.withinLimit ? 'ok' : 
    usage.percentageUsed > 80 ? 'danger' : 'warning'
  }`;
}
```

## 🔄 Порядок работы системы

### 1. Запись трафика
```
Клиент → Подписка → Middleware → Traffic Service → SQLite
    ↓
Webhook → API → Traffic Service → SQLite → Статистика
```

### 2. Запрос статистики
```
UI → API → Traffic Service → SQLite → Агрегация
    ↓
UI → API → Admin Router → Traffic Service + Xpert → Общий результат
```

### 3. Сброс трафика
```
UI → API → Admin Router → 
  ├─→ crud.reset_admin_usage() (Xpert)
  └─→ traffic_service.reset_admin_external_traffic() (Xpert)
```

## 🛠️ Конфигурация

### Переменные в .env

```env
# Включение системы мониторинга
XPERT_TRAFFIC_TRACKING_ENABLED=True

# Путь к базе данных
XPERT_TRAFFIC_DB_PATH=data/traffic_stats.db

# Хранение данных (0 = бесконечно)
XPERT_TRAFFIC_RETENTION_DAYS=0

# Домен для webhook
XPERT_DOMAIN=your-domain.com
```

### Структура базы данных

```sql
CREATE TABLE traffic_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_token TEXT NOT NULL,
    config_server TEXT NOT NULL,
    config_port INTEGER NOT NULL,
    protocol TEXT NOT NULL,
    bytes_uploaded INTEGER DEFAULT 0,
    bytes_downloaded INTEGER DEFAULT 0,
    date_collected DATE NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_token, config_server, config_port, date_collected)
);
```

## 📈 Преимущества интеграции

### ✅ Для администраторов
- **Единый интерфейс** - все те же кнопки в Xpert UI
- **Полный контроль** - сброс и лимиты работают для всего трафика
- **Прозрачность** - видно сколько используется внешних vs внутренних серверов
- **Гибкость** - можно сбросить только внешний трафик

### ✅ Для пользователей
- **Отслеживание** - весь трафик учитывается в статистике
- **Лимиты** - работают с внешними серверами
- **Вебхуки** - автоматическая отправка статистики
- **Подписки** - с tracking параметрами

### ✅ Для системы
- **Масштабируемость** - SQLite с индексами
- **Надежность** - обработка ошибок и логирование
- **Совместимость** - не ломает существующий функционал Xpert
- **Безопасность** - проверка лимитов и прав доступа

## 🚨 Поиск проблем

### Если статистика не учитывается
1. Проверьте `XPERT_TRAFFIC_TRACKING_ENABLED=True`
2. Проверьте что клиенты отправляют данные на webhook
3. Проверьте логи Xpert Panel
4. Проверьте базу данных: `ls -la data/traffic_stats.db`

### Если кнопки не работают
1. Проверьте права админа (нужен sudo)
2. Проверьте API эндпоинты: `curl /api/admin/usage/admin1`
3. Проверьте что traffic_service импортируется без ошибок
4. Проверьте интеграцию в admin.py

### Если лимиты не применяются
1. Проверьте что у админа установлен `traffic_limit`
2. Проверьте конвертацию байт → ГБ
3. Проверьте что UI использует `total_usage_bytes`
4. Проверьте что `limit_check` работает корректно

## 🎉 Результат

**Теперь Xpert Panel полностью контролирует трафик через внешние VPN серверы!**

- ✅ Кнопка "Сбросить трафик" очищает ВЕСЬ трафик
- ✅ Кнопка "Лимит трафика" учитывает ВЕСЬ трафик  
- ✅ Статистика показывает разбивку Xpert + Внешний
- ✅ Вебхуки принимают данные от клиентов
- ✅ Система готова к использованию

**Администраторы могут использовать привычные кнопки для полного контроля трафика через чужие сервера!** 🚀
