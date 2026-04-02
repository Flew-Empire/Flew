Flew Free

Flew Free is the free edition of the Flew panel by Flew Empire.

Dashboard
Inbounds
Nodes
Hosts
Admin Accounts
Admin Manager
XPanel and the paid modules are not included in this edition.

Install
Run one command on a clean Ubuntu or Debian server as root:

bash -c "$(curl -fsSL https://raw.githubusercontent.com/Flew-Empire/Flew/main/install.sh)" -- \
  --domain panel.example.com \
  --admin admin \
  --password 'change-this-password' \
  --email admin@example.com
If you do not want to use an email for Let's Encrypt:

bash -c "$(curl -fsSL https://raw.githubusercontent.com/Flew-Empire/Flew/main/install.sh)" -- \
  --domain panel.example.com \
  --admin admin \
  --password 'change-this-password'
Install without a domain, without nginx, and without HTTPS:

bash -c "$(curl -fsSL https://raw.githubusercontent.com/Flew-Empire/Flew/main/install.sh)" -- \
  --admin admin \
  --password 'change-this-password'
After installation, open:

https://panel.example.com/dashboard/
If you install without a domain, open the panel at:

http://SERVER_IP:8000/dashboard/
Replace SERVER_IP with your server's public IP address or hostname.

What The Installer Does
installs system packages
installs Xray
clones this repository into /opt/flew
creates a Python virtual environment
installs backend dependencies
writes a ready-to-run .env
runs database migrations
starts flew.service
configures Nginx and HTTPS
Without a domain, the installer skips nginx and HTTPS and starts Flew directly on http://SERVER_IP:8000/dashboard/.

Custom Install Location
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Flew-Empire/Flew/main/install.sh)" -- \
  --domain panel.example.com \
  --admin admin \
  --password 'change-this-password' \
  --install-dir /opt/flew-free
Notes
service name: flew
install directory by default: /opt/flew
the repository ships with the built dashboard, so npm is not required on the server