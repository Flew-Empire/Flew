<img src="https://raw.githubusercontent.com/Flew-Empire/Flew/main/app/dashboard/build/logo.svg" width="200">

# Flew Free

Flew Free is the free edition of the Flew panel by Flew Empire.

## Features

- Dashboard
- Inbounds
- Nodes
- Hosts
- Admin Accounts
- Admin Manager

> **Note:** XPanel and the paid modules are not included in this edition.

---

## Install

Run one command on a clean Ubuntu or Debian server as root:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Flew-Empire/Flew/main/install.sh)" -- \
  --domain panel.example.com \
  --admin admin \
  --password 'change-this-password' \
  --email admin@example.com
```

If you do not want to use an email for Let's Encrypt:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Flew-Empire/Flew/main/install.sh)" -- \
  --domain panel.example.com \
  --admin admin \
  --password 'change-this-password'
```

Install without a domain, without nginx, and without HTTPS:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Flew-Empire/Flew/main/install.sh)" -- \
  --admin admin \
  --password 'change-this-password'
```

After installation, open:

- **With domain:** `https://panel.example.com/dashboard/`
- **Without domain:** `http://SERVER_IP:8000/dashboard/`

> Replace `SERVER_IP` with your server's public IP address or hostname.

---

## What The Installer Does

1. Installs system packages
2. Installs Xray
3. Clones this repository into `/opt/flew`
4. Creates a Python virtual environment
5. Installs backend dependencies
6. Writes a ready-to-run `.env`
7. Runs database migrations
8. Starts `flew.service`
9. Configures Nginx and HTTPS

> Without a domain, the installer skips nginx and HTTPS and starts Flew directly on `http://SERVER_IP:8000/dashboard/`

---

## Custom Install Location

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Flew-Empire/Flew/main/install.sh)" -- \
  --domain panel.example.com \
  --admin admin \
  --password 'change-this-password' \
  --install-dir /opt/flew-free
```

---

## Notes

- **Service name:** `flew`
- **Install directory by default:** `/opt/flew`
- The repository ships with the built dashboard, so npm is not required on the server