# 🛠️ Pengembangan

## Prasyarat

- Python 3.9+
- PostgreSQL 16+
- Docker (opsional, buat testing)

## Setup Lokal

```bash
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere
pip install fastapi uvicorn sqlalchemy paramiko psycopg2-binary
```

## Struktur Project

```
serversphere/
├── backend/
│   ├── main.py        ← FastAPI app
│   ├── database.py    ← DB connection
│   ├── models.py      ← SQLAlchemy models
│   └── frontend/      ← SPA dashboard
├── docker-compose.yml ← Production setup
├── Dockerfile         ← App container
└── docs/              ← Dokumentasi
```

## Running Locally

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8080
```
