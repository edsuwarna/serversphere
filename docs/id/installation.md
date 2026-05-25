# 📦 Instalasi

## Docker Compose (Rekomendasi)

```bash
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere
cp .env.example .env
nano .env
docker compose up -d --build
docker compose logs -f
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_USER` | `admin` | Username admin awal |
| `DASHBOARD_PASS` | `change-me` | Password admin awal |
| `DASHBOARD_PORT` | `8080` | Port yang di-expose |
| `SECRET_KEY` | `change-this-...` | Session secret |
| `POSTGRES_DB` | `vpsdashboard` | Nama database |
| `POSTGRES_USER` | `vpsadmin` | User database |
| `POSTGRES_PASSWORD` | `change-me` | Password database |

## SSH Key Setup

SSH keys di-mount dari host sebagai read-only. Pas nambah VPS, set **SSH Key File Path** ke `/root/.ssh/your_key`.
