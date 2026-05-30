# ServerSphere

Manage semua VPS dari satu dashboard. SSH terminal, container manager, resource monitoring, RBAC — semua dari browser tanpa install client.

## Cara Jalanin

Pilih salah satu:

### Pakai Image (Recommended)

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
```

### Clone & Build

```bash
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere
docker compose up -d --build
```

## Cocok buat siapa

- **DevOps** — 5-50 VPS dari satu dashboard
- **Sysadmin** — SSH + monitor tanpa client tools
- **Team Lead** — Akses terbatas per VPS buat tim

## Fitur Utama

- Multi-VPS overview dengan status online/offline
- SSH terminal via WebSocket (xterm.js)
- Docker container management dari dashboard
- System logs viewer (syslog, auth, kernel, docker, nginx)
- CPU, RAM, Disk monitoring real-time
- User management + RBAC (Admin/Operator/Viewer)
- Audit trail lengkap

## Tech

**Backend:** FastAPI, SQLAlchemy, Paramiko  
**Database:** PostgreSQL 18  
**Frontend:** Vanilla JS, xterm.js  
**Deploy:** Docker Compose  

[Installation →](/installation) · [Quick Start →](/quickstart) · [API Docs →](/api) · [GitHub →](https://github.com/edsuwarna/serversphere)
