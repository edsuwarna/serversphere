# 🏗 Architecture

## System Overview

```
Browser (SPA)  ←→  FastAPI (Python)  ←→  PostgreSQL
                     ├── REST API (VPS CRUD, users, RBAC)
                     └── WebSocket (SSH terminal)
                             └── Paramiko (SSH)
```

## Components

### Frontend (Single Page App)

- **Vanilla JavaScript** — no framework overhead
- **xterm.js** — full terminal emulator in the browser
- **Material Icons** — UI icon set
- **Dark theme** — easy on the eyes for ops work

The frontend is a single `index.html` with embedded CSS/JS, served by FastAPI.

### Backend (FastAPI)

- **REST API** — CRUD for VPS, users, RBAC assignments
- **WebSocket** — real-time SSH terminal sessions
- **SQLAlchemy ORM** — database access and migrations
- **Paramiko** — SSH client for connecting to remote VPS

### Database (PostgreSQL)

Key tables:
- `users` — User accounts with hashed passwords and roles
- `vps` — VPS server configurations (host, port, user, key path)
- `user_vps_access` — Junction table for per-user VPS access

### SSH Connection Flow

```
Browser → WebSocket → FastAPI → Paramiko → Remote VPS SSH
                ↓
        Terminal I/O (stdin/stdout)
```

1. User opens terminal from browser
2. WebSocket connects to FastAPI backend
3. Backend opens Paramiko SSH connection to the target VPS
4. Terminal I/O streams between browser ↔ server ↔ remote VPS

## Deployment Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Browser    │────▶│  Docker Container │────▶│  PostgreSQL  │
│  (xterm.js)  │     │  (FastAPI + SPA)  │     │    (DB)      │
└─────────────┘     └────────┬─────────┘     └──────────────┘
                             │ SSH
                             ▼
                     ┌───────────────┐
                     │  Remote VPS   │
                     │  (Target)     │
                     └───────────────┘
```
