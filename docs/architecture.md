# Architecture

```
Browser (SPA)  ←→  FastAPI (Python)  ←→  PostgreSQL
                     ├── REST API
                     └── WebSocket (SSH)
                             └── Paramiko (SSH client)
```

## Backend

FastAPI app di `backend/main.py` nyediain:
- **REST API** — CRUD VPS, users, auth, audit logs
- **WebSocket** — SSH terminal session (tiap client dapet session sendiri)
- **Middleware** — auth session, CORS, logging

## Database

PostgreSQL pake SQLAlchemy ORM. Tabel:

| Table | Isi |
|-------|-----|
| `users` | User accounts (hashed password, role) |
| `vps` | VPS configs (host, port, user, key path) |
| `user_vps_access` | Junction — per-user VPS access |
| `audit_logs` | Semua aktivitas user |

## Frontend

Single-page app pake vanilla JS. File statis diserve langsung dari FastAPI (`/frontend/`).

Komunikasi:
- REST → fetch API buat CRUD
- WebSocket → xterm.js buat SSH terminal
- Session → cookie-based (httponly)

## Container

Dua container:
- **serversphere** — Python FastAPI + frontend (port 8080)
- **serversphere-db** — PostgreSQL 18

Mount points:
- `~/.ssh:/root/.ssh:ro` — SSH keys dari host
- `pg-data:/var/lib/postgresql` — data DB persistent
