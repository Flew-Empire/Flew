# ⚡ Xpert Panel

**Modified Xpert Panel** - VPN управление с расширенным функционалом агрегации подписок.

## 🎯 Отличия от оригинального Xpert

### Добавленный функционал:
1. **Агрегация подписок** - прием ссылок на внешние подписки
2. **Проверка пинга** - автоматическая проверка через целевые IP (93.171.220.198, 185.69.186.175)
3. **Автообновление** - обновление подписок каждый час
4. **Фильтрация** - только рабочие конфиги с пингом < 300ms
5. **Ребрендинг** - название "Xpert Panel" вместо "Xpert"

## 🚀 Установка

### Через Docker (рекомендуется)

```bash
# Клонирование
git clone https://github.com/mybrohigh/Xpert-Panel.git
cd Xpert-Panel

# Настройка переменных окружения
cp .env.example .env
nano .env

# Запуск с MySQL
docker-compose up -d
```

### Ручная установка

```bash
# Установка зависимостей
pip install -r requirements.txt

# Установка фронтенда
cd app/dashboard
npm install
npm run build
cd ../..

# Запуск
python main.py
```

## ⚙️ Конфигурация

### Переменные окружения

```env
# Основные
UVICORN_HOST=0.0.0.0
UVICORN_PORT=8000
XRAY_JSON=/var/lib/xpert/xray_config.json

# База данных MySQL
SQLALCHEMY_DATABASE_URL=mysql+pymysql://user:password@localhost/xpert

# Целевые IP для проверки пинга
TARGET_CHECK_IPS=93.171.220.198,185.69.186.175

# Домен
DOMAIN=home.turkmendili.ru
```

## 📱 Использование

1. Откройте `http://your-domain:8000/dashboard/`
2. Войдите с учетными данными администратора
3. Добавьте источники подписок в разделе "Subscription Sources"
4. Система автоматически проверит и отфильтрует рабочие конфиги

## 🔗 Эндпоинты

| URL | Описание |
|-----|----------|
| `/dashboard/` | Веб-интерфейс |
| `/api/` | REST API |
| `/sub/{token}` | Подписка пользователя |
| `/api/subscription-sources` | Управление источниками подписок |

## 📊 Функции проверки подписок

### Автоматическая проверка:
- Пинг до VPN серверов
- Проверка доступности портов
- Фильтрация по задержке (< 300ms)
- Проверка потерь пакетов (< 50%)

### Целевые IP:
Конфиги проверяются на доступность с IP:
- `93.171.220.198`
- `185.69.186.175`

## 🎨 Изменения дизайна

- Название: **Xpert Panel**
- Цветовая схема: сохранена оригинальная (можно изменить в `app/dashboard/src/index.scss`)
- Логотип: можно заменить в `app/dashboard/public/`

## 📝 Лицензия

Based on [Xpert](https://github.com/Gozargah/Xpert) - AGPL-3.0 License

## 🔧 Разработка

```bash
# Фронтенд (React + Vite)
cd app/dashboard
npm run dev

# Бэкенд (FastAPI)
uvicorn main:app --reload
```

---

**Xpert Panel** v1.0.0 | Powered by Xpert + Custom Extensions
