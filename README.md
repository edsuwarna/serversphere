# VPS Dashboard - Multi-Server Management

A single-page web dashboard for managing multiple VPS servers via SSH.

## Features

- **VPS Overview** — List all servers with online/offline status and resource usage at a glance
- **SSH Terminal** — Full interactive terminal (xterm.js) via WebSocket
- **Container Management** — List, start, stop, restart, remove Docker containers
- **Container Logs & Stats** — View logs and resource usage for each container
- **System Logs** — View syslog, auth, kernel, docker, nginx logs
- **Quick Commands** — Run one-off commands with preset buttons
- **Resource Monitoring** — CPU, RAM, Disk, Load Average with visual bars
- **User Management** — Create, edit, delete users with role-based access
- **RBAC** — Admin, Operator, Viewer roles with per-VPS access control
- **PostgreSQL** — Persistent data storage in PostgreSQL database

## Quick Start

```bash
# 1. Clone or copy the project
cd vps-dashboard

# 2. (Optional) Edit credentials
cp .env.example .env
nano .env

# 3. Launch (includes PostgreSQL + App)
docker compose up -d --build

# 4. Open in browser
# http://your-server-ip:8080
```

## Configuration

Environment variables (set in `.env` or `docker-compose.yml`):

| Variable | Default | Description |
|---|---|---|
| `DASHBOARD_USER` | `admin` | Initial admin username |
| `DASHBOARD_PASS` | `change-me` | Initial admin password |
| `DASHBOARD_PORT` | `8080` | Port to expose |
| `SECRET_KEY` | `change-this-...` | Session secret |
| `POSTGRES_DB` | `vpsdashboard` | Database name |
| `POSTGRES_USER` | `vpsadmin` | Database user |
| `POSTGRES_PASSWORD` | `change-me` | Database password |

## RBAC Roles

| Role | View VPS | Manage VPS | SSH Terminal | Run Commands | Manage Users |
|---|---|---|---|---|---|
| **admin** | ✅ All | ✅ | ✅ | ✅ | ✅ |
| **operator** | ✅ Assigned | ❌ | ✅ | ✅ | ❌ |
| **viewer** | ✅ Assigned | ❌ | ❌ | ❌ | ❌ |

Assign specific VPS to users or leave empty for access to all VPS.

## Architecture

```
Browser (SPA)  ←→  FastAPI (Python)  ←→  PostgreSQL
                      ├── REST API (VPS CRUD, users, RBAC)
                      └── WebSocket (SSH terminal)
                              └── Paramiko (SSH)
```

### Tech Stack

- **Backend:** FastAPI, SQLAlchemy, Paramiko (SSH), WebSocket
- **Database:** PostgreSQL 16
- **Frontend:** Vanilla JS, xterm.js, CSS (dark theme)
- **Deployment:** Docker Compose (2 containers: app + db)

### Database Tables

- `users` — User accounts with hashed passwords and roles
- `vps` — VPS server configurations
- `user_vps_access` — Junction table for per-user VPS access control

## SSH Key Setup

The dashboard mounts `~/.ssh` from the host as read-only. To use SSH keys:

1. Place your keys on the host: `~/.ssh/id_rsa`, `~/.ssh/id_ed25519`, etc.
2. When adding a VPS, set the **SSH Key File Path** to `/root/.ssh/your_key`

## Backup

```bash
# Backup PostgreSQL
sudo docker exec vps-dashboard-db pg_dump -U vpsadmin vpsdashboard > backup.sql

# Restore
cat backup.sql | sudo docker exec -i vps-dashboard-db psql -U vpsadmin vpsdashboard
```
