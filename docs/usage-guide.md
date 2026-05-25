# 🚀 Usage Guide

## Dashboard Overview

When you log in, you'll see:

- **Server Cards** — each VPS with online/offline status, IP, and resource usage
- **Quick Stats** — total servers, online count, container counts
- **Navigation** — add server, manage users, view logs

## SSH Terminal

Click the terminal icon on any server card to open an interactive shell:

```bash
# It's a full terminal — run any command
uptime
df -h
free -m
top
```

- Multiple terminal tabs for different servers
- Copy/paste support
- Resizable terminal window

## Container Management

View and manage Docker containers on any VPS:

```
Container List → Shows: Name, Image, Status, Ports, Created
Actions → Start, Stop, Restart, Remove
Stats → CPU, Memory usage per container
Logs → View real-time container logs
```

## System Logs

Access system logs from the dashboard:

| Log Type | Source |
|----------|--------|
| Syslog | `/var/log/syslog` |
| Auth | `/var/log/auth.log` |
| Kernel | `dmesg` |
| Docker | `docker logs` |
| Nginx | `/var/log/nginx/*.log` |

## Resource Monitoring

Each server card shows:

- **CPU** — usage bar with percentage
- **RAM** — used/total with visual indicator
- **Disk** — root partition usage
- **Load Average** — 1, 5, 15 minute averages

## User Management

As admin, you can:

1. **Create users** — set username, password, role
2. **Assign VPS** — grant access to specific servers
3. **Edit roles** — promote/demote users
4. **Delete users** — remove access

## Quick Commands

Preset command buttons for common tasks:

```bash
# Quick checks
df -h
free -h
uptime
docker ps
```
