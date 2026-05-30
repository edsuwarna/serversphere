# Installation

There are two ways to run ServerSphere: use the pre-built Docker image from GHCR (recommended) or build it yourself.

## Using Docker Image (Recommended)

Create a `docker-compose.yml` on your server:

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

Run it:

```bash
docker compose up -d
```

Open `http://server-ip:8080`, login with `admin` / `change-me`.

## Clone & Build

If you want to customize the code or need a custom build:

```bash
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere

cp .env.example .env
# edit .env if needed

docker compose up -d --build
```

## Environment Variables

| Variable | Default | Required |
|----------|---------|----------|
| `DASHBOARD_USER` | `admin` | optional |
| `DASHBOARD_PASS` | `change-me` | **must change** |
| `SECRET_KEY` | auto-generated | **must change** |
| `POSTGRES_PASSWORD` | `change-me` | **must change** |
| `DASHBOARD_PORT` | `8080` | optional |
| `POSTGRES_DB` | `vpsdashboard` | optional |
| `POSTGRES_USER` | `vpsadmin` | optional |
| `POSTGRES_HOST` | `serversphere-db` | optional |
| `POSTGRES_PORT` | `5432` | optional |

## SSH Key Setup

The volume `~/.ssh:/root/.ssh:ro` in docker-compose mounts your host SSH keys into the container. When adding a VPS, enter the **SSH Key File Path** as it appears inside the container, e.g., `/root/.ssh/id_ed25519`.

## Important Notes

- **Change the default password** immediately after first login
- Don't expose port 8080 directly to the public — use a reverse proxy (Nginx/Caddy) or Cloudflare Tunnel for better security
- PostgreSQL data is stored in the `pg-data` volume — back it up using `pg_dump`
