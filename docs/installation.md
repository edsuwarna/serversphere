# 📦 Installation

## Docker Compose (Recommended)

```bash
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere

# Configure
cp .env.example .env
nano .env

# Launch
docker compose up -d --build

# Check logs
docker compose logs -f
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_USER` | `admin` | Initial admin username |
| `DASHBOARD_PASS` | `change-me` | Initial admin password |
| `DASHBOARD_PORT` | `8080` | Port to expose |
| `SECRET_KEY` | `change-this-...` | Session secret |
| `POSTGRES_DB` | `vpsdashboard` | Database name |
| `POSTGRES_USER` | `vpsadmin` | Database user |
| `POSTGRES_PASSWORD` | `change-me` | Database password |

## Manual (Without Docker)

```bash
# Install PostgreSQL
# Create database and user matching .env values

# Install Python dependencies
pip install fastapi uvicorn sqlalchemy paramiko psycopg2-binary

# Run
cd backend
uvicorn main:app --host 0.0.0.0 --port 8080
```

## SSH Key Setup

The dashboard mounts `~/.ssh` from the host as read-only:

```yaml
# docker-compose.yml
volumes:
  - ~/.ssh:/root/.ssh:ro
```

When adding a VPS, set the **SSH Key File Path** to `/root/.ssh/your_key`.
