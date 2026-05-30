# Installation

Ada dua cara: pake image dari GHCR (gak perlu clone repo) atau build sendiri.

## Pakai Docker Image (Recommended)

Buat file `docker-compose.yml` di server lu:

```yaml
services:
  serversphere:
    image: ghcr.io/edsuwarna/serversphere:latest
    container_name: serversphere
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - DASHBOARD_USER=admin
      - DASHBOARD_PASS=change-me
      - DASHBOARD_PORT=8080
      - SECRET_KEY=change-this-to-something-random
      - POSTGRES_DB=vpsdashboard
      - POSTGRES_USER=vpsadmin
      - POSTGRES_PASSWORD=change-me
      - POSTGRES_HOST=serversphere-db
      - POSTGRES_PORT=5432
    volumes:
      - ~/.ssh:/root/.ssh:ro
      - serversphere-data:/app/data
    depends_on:
      serversphere-db:
        condition: service_healthy

  serversphere-db:
    image: postgres:18-alpine
    container_name: serversphere-db
    restart: unless-stopped
    environment:
      - POSTGRES_DB=vpsdashboard
      - POSTGRES_USER=vpsadmin
      - POSTGRES_PASSWORD=change-me
    volumes:
      - pg-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vpsadmin -d vpsdashboard"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pg-data:
  serversphere-data:
```

Jalankan:

```bash
docker compose up -d
```

Buka `http://server-ip:8080`, login `admin` / `change-me`.

## Clone & Build Sendiri

Kalo mau ngoprek kode atau butuh custom build:

```bash
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere

cp .env.example .env
# edit .env kalo perlu

docker compose up -d --build
```

## Environment Variables

| Variable | Default | Wajib? |
|----------|---------|--------|
| `DASHBOARD_USER` | `admin` | optional |
| `DASHBOARD_PASS` | `change-me` | wajib diganti |
| `SECRET_KEY` | auto-generate | wajib diganti |
| `POSTGRES_PASSWORD` | `change-me` | wajib diganti |
| `DASHBOARD_PORT` | `8080` | optional |
| `POSTGRES_DB` | `vpsdashboard` | optional |
| `POSTGRES_USER` | `vpsadmin` | optional |
| `POSTGRES_HOST` | `serversphere-db` | optional |
| `POSTGRES_PORT` | `5432` | optional |

## SSH Key Setup

Volume `~/.ssh:/root/.ssh:ro` di docker-compose mount keys dari host. Pas add VPS, isi **SSH Key File Path** dengan path di container, misal `/root/.ssh/id_ed25519`.

## Yang Perlu Diingat

- **Ganti password** default abis pertama login
- Jangan expose port 8080 langsung ke publik — reverse proxy pake Nginx/Caddy + Cloudflare Tunnel lebih aman
- Data PostgreSQL disimpan di volume `pg-data`, backup pake `pg_dump`
