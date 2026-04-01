# Flew Inbound Setup for Flew Panel

## 🎯 Universal Port Logic

Flew Panel использует **универсальный подход** - создает отдельный inbound для каждого уникального порта из конфигураций.

## 📋 How It Works

1. **Парсит конфиги** → извлекает протокол, порт, сервер
2. **Группирует** → `protocol-port` (например: `vless-in-443`, `vmess-in-8080`)
3. **Создает inbound'ы** → автоматически для каждой группы
4. **Добавляет хосты** → серверы как хосты к соответствующим inbound'ам

## 🔄 Example

Если в подписках есть:
- `vless://server1.com:443` → создается inbound `vless-in-443`
- `vless://server2.com:443` → добавляется хост к `vless-in-443`
- `vmess://server3.com:8080` → создается inbound `vmess-in-8080`
- `trojan://server4.com:443` → создается inbound `trojan-in-443`

## 🛠 Automatic Inbound Creation

Flew Panel **автоматически создает** inbound'ы с такими настройками:

### VLESS Inbound (example: vless-in-443)
```json
{
  "tag": "vless-in-443",
  "protocol": "vless",
  "port": 443,
  "settings": {
    "clients": [],
    "decryption": "none"
  },
  "streamSettings": {
    "network": "ws",
    "security": "tls",
    "wsSettings": {
      "path": "/vless"
    }
  }
}
```

### VMess Inbound (example: vmess-in-8080)
```json
{
  "tag": "vmess-in-8080",
  "protocol": "vmess", 
  "port": 8080,
  "settings": {
    "clients": [],
    "disableInsecureEncryption": false
  },
  "streamSettings": {
    "network": "ws",
    "security": "none",
    "wsSettings": {
      "path": "/vmess"
    }
  }
}
```

### Trojan Inbound (example: trojan-in-443)
```json
{
  "tag": "trojan-in-443",
  "protocol": "trojan",
  "port": 443,
  "settings": {
    "clients": []
  },
  "streamSettings": {
    "network": "ws", 
    "security": "tls",
    "wsSettings": {
      "path": "/trojan"
    }
  }
}
```

### Shadowsocks Inbound (example: ss-in-8388)
```json
{
  "tag": "ss-in-8388",
  "protocol": "shadowsocks",
  "port": 8388,
  "settings": {
    "clients": [],
    "network": "tcp,udp"
  }
}
```

## 🎛 Manual Setup (Optional)

Если хотите настроить inbound'ы вручную **до** запуска Flew Panel:

1. **Предварительно создайте inbound'ы** для ожидаемых портов
2. **Используйте теги** в формате `protocol-in-port`
3. **Flew Panel найдет** существующие inbound'ы и добавит хосты

## 📝 Host Configuration

Каждый хост добавляется с настройками:
- **Address**: сервер из конфига
- **Port**: порт из конфига  
- **SNI**: адрес сервера
- **Security**: TLS для VLESS/VMess/Trojan, none для Shadowsocks
- **ALPN**: h2,http/1.1 для TLS

## 🚀 Benefits

✅ **Универсальность** - поддерживает любые порты из подписок  
✅ **Автоматизация** - не нужно настраивать inbound'и вручную  
✅ **Гибкость** - каждый порт обрабатывается отдельно  
✅ **Простота** - работает с существующими конфигами  

## 🎯 Result

После настройки:
- Flew Panel автоматически создаст inbound'и для всех портов
- Рабочие серверы добавятся как хосты
- Пользователи получат конфиги с правильными портами и хостами
