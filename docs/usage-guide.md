# Usage Guide

## Dashboard

After login, you'll see all your servers displayed as cards — status (green/red), IP, CPU, RAM, Disk at a glance.

## SSH Terminal

Click the terminal icon on any server card. It's a real terminal — you can run `apt update`, `top`, `vim`, anything.
- Open multiple tabs for different servers
- Copy-paste with Ctrl+Shift+C / Ctrl+Shift+V
- Terminal window is resizable

## Container Management

Open the **Containers** tab in the dashboard:
- **List** — view all containers (name, image, status, ports)
- **Start/Stop/Restart/Remove** — one-click buttons
- **Logs** — view real-time logs per container
- **Stats** — CPU & Memory usage per container

## System Logs

**Logs** tab → select log type:
- Syslog — `/var/log/syslog`
- Auth — `/var/log/auth.log`
- Kernel — `dmesg`
- Docker — `docker logs`
- Nginx — `/var/log/nginx/*.log`

## Resource Monitoring

Each server card shows:
- **CPU** — progress bar + percentage
- **RAM** — used / total
- **Disk** — root partition usage
- **Load Average** — 1, 5, 15 minutes

## User Management

Admins can:
1. **Create users** — set name, password, role
2. **Assign VPS** — choose which servers the user can access
3. **Edit roles** — promote/demote users (Admin / Operator / Viewer)
4. **Delete users** — revoke access entirely

## Quick Commands

Preset buttons on the VPS detail page:
- `df -h` — check disk usage
- `free -h` — check RAM
- `uptime` — server uptime
- `docker ps` — list containers

Just click to run — no need to type manually.
