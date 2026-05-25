# ⚡ Quick Start

Get ServerSphere running in 2 minutes.

## Prerequisites

- **Docker** and **Docker Compose**
- A server with SSH access (for managing remote VPS)

## Launch

```bash
# 1. Clone
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere

# 2. (Optional) Edit credentials
cp .env.example .env
nano .env

# 3. Launch
docker compose up -d --build

# 4. Open
# http://your-server-ip:8080
# Login: admin / change-me
```

## What's Next?

Once logged in:

1. **Add a VPS** — Click "Add VPS", enter hostname/IP, SSH user, and key
2. **Open Terminal** — Click the terminal icon to SSH into any server
3. **Manage Containers** — View, start, stop containers from the dashboard
4. **Create Users** — Add team members with role-based access

## Default Credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `change-me` |
| Port | `8080` |

> **Security:** Change the default password on first login. Close port 8080 to public via security group/firewall.
