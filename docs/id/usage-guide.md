# 🚀 Panduan Penggunaan

## Dashboard Overview

- **Server Cards** — tiap VPS dengan status online/offline, IP, resource usage
- **Quick Stats** — total server, online count, container counts
- **Navigation** — add server, manage users, view logs

## SSH Terminal

Klik icon terminal di card server untuk buka shell interaktif:

```bash
uptime
df -h
free -m
top
```

## Container Management

Lihat dan manage container Docker di VPS:
- List container (name, image, status, ports)
- Start, Stop, Restart, Remove
- Lihat logs & stats per container

## System Logs

| Log Type | Source |
|----------|--------|
| Syslog | `/var/log/syslog` |
| Auth | `/var/log/auth.log` |
| Kernel | `dmesg` |
| Docker | `docker logs` |

## User Management

Admin bisa:
1. Create users — set username, password, role
2. Assign VPS — grant akses ke server tertentu
3. Edit roles — promote/demote user
