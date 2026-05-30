# Development

## Prerequisites
- Python 3.9+
- PostgreSQL 16+
- Docker (optional)

## Local Setup

```bash
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere

pip install -r backend/requirements.txt
createdb vpsdashboard
```

## Project Structure

```
serversphere/
├── backend/
│   ├── main.py              # FastAPI routes + WebSocket
│   ├── database.py          # SQLAlchemy connection
│   ├── vps_manager.py       # SSH logic via Paramiko
│   ├── frontend/
│   │   ├── index.html       # SPA dashboard
│   │   ├── css/style.css    # Styles (Amber theme)
│   │   └── js/app.js        # Client logic
│   └── requirements.txt
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── docs/
```

## Run Locally

```bash
cd backend
cp ../.env.example ../.env
# edit .env, pastiin PostgreSQL jalan

uvicorn main:app --reload --host 0.0.0.0 --port 8080
```

## Dependencies Kunci

- **FastAPI** — Web framework + async
- **SQLAlchemy** — ORM
- **Paramiko** — SSH client
- **xterm.js** — Terminal emulator (frontend)
- **psycopg2-binary** — PostgreSQL driver

## Testing

Manual test: jalanin server → buka browser → tes fitur (add VPS, terminal, containers, RBAC).
