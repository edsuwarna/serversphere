# ServerSphere — Multi-Server Management Dashboard

Manage semua VPS dari satu dashboard. SSH terminal, container manager, resource monitor, RBAC — semua dari browser.

![ServerSphere](docs/screenshot.png)

## Jalanin 2 Detik

```yaml
# docker-compose.yml
services:
  serversphere:
    image: ghcr.io/edsuwarna/serversphere:latest
    container_name: serversphere
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - DASHBOARD_PASS=ganti-ini
      - SECRET_KEY=ganti-ini-juga
      - POSTGRES_PASSWORD=ganti-ini
    volumes:
      - ~/.ssh:/root/.ssh:ro
    depends_on:
      serversphere-db:
        condition: service_healthy

  serversphere-db:
    image: postgres:18-alpine
    container_name: serversphere-db
    restart: unless-stopped
    environment:
      - POSTGRES_PASSWORD=ganti-ini
    volumes:
      - pg-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vpsadmin -d vpsdashboard"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pg-data:
```

```bash
docker compose up -d
# Buka http://server-ip:8080 — login: admin / ganti-ini
```

## Fitur

- **Overview** — Semua server dalam satu halaman, status online/offline, resource usage
- **SSH Terminal** — Langsung dari browser pake xterm.js via WebSocket
- **Container Management** — List, start, stop, restart, hapus container di VPS manapun
- **Logs** — Syslog, auth, kernel, docker, nginx — dari dashboard
- **Quick Commands** — Tombol preset buat perintah umum
- **Resource Monitor** — CPU, RAM, Disk, Load Average + visual bar
- **User Management** — Multi-user dengan role Admin, Operator, Viewer
- **Audit Logs** — Semua aktivitas tercatat (siapa, apa, dari mana)

## Tech Stack

- **Backend:** FastAPI, SQLAlchemy, Paramiko (SSH), WebSocket
- **Database:** PostgreSQL 18
- **Frontend:** Vanilla JS, xterm.js, CSS Amber theme (dark/light)
- **Deployment:** Docker Compose (2 container: app + db)
- **Registry:** ghcr.io/edsuwarna/serversphere

## RBAC

| Role | VPS | SSH | Command | User |
|------|-----|-----|---------|------|
| **Admin** | ✅ All | ✅ | ✅ | ✅ |
| **Operator** | ✅ Assigned | ✅ | ✅ | ❌ |
| **Viewer** | ✅ Assigned | ❌ | ❌ | ❌ |

## Dokumentasi

Lengkap di [serversphere.pages.dev](https://serversphere.pages.dev):
Instalasi, konfigurasi, API, troubleshooting, cara backup.

## Development

```bash
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere
cp .env.example .env
docker compose up -d --build
```

## Lisensi

MIT
