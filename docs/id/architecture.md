# 🏗 Arsitektur

## System Overview

```
Browser (SPA)  ←→  FastAPI (Python)  ←→  PostgreSQL
                     ├── REST API (VPS CRUD, users, RBAC)
                     └── WebSocket (SSH terminal)
                             └── Paramiko (SSH)
```

## Components

### Frontend
- Vanilla JS — tanpa framework
- xterm.js — terminal emulator di browser
- Dark theme — nyaman buat operasional

### Backend
- **FastAPI** — REST API + WebSocket
- **SQLAlchemy ORM** — akses database
- **Paramiko** — SSH client ke remote VPS

### Database (PostgreSQL)
- `users` — Akun user dengan hashed passwords
- `vps` — Konfigurasi server VPS
- `user_vps_access` — Junction table akses per-VPS

### SSH Connection Flow

```
Browser → WebSocket → FastAPI → Paramiko → Remote VPS SSH
```
