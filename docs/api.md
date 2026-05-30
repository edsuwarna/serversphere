# API Documentation

Base URL: `http://server-ip:8080`

## Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/login` | No | Login, dapetin session |
| POST | `/api/logout` | Yes | Logout |
| GET | `/api/me` | Yes | Current user info |

Login body:
```json
{ "username": "admin", "password": "change-me" }
```

Response: session cookie (httponly).

## VPS

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/vps` | Yes | List semua VPS |
| POST | `/api/vps` | Yes | Tambah VPS baru |
| GET | `/api/vps/{id}` | Yes | Detail VPS |
| PUT | `/api/vps/{id}` | Yes | Edit VPS |
| DELETE | `/api/vps/{id}` | Admin | Hapus VPS |
| GET | `/api/vps/{id}/status` | Yes | Status online/offline |
| GET | `/api/vps/{id}/resources` | Yes | CPU, RAM, Disk, Load |

Tambah VPS body:
```json
{
  "name": "web-prod-01",
  "host": "192.168.1.100",
  "port": 22,
  "username": "root",
  "key_path": "/root/.ssh/id_ed25519"
}
```

## Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users` | Admin | List users |
| POST | `/api/users` | Admin | Create user |
| PUT | `/api/users/{id}` | Admin | Edit user |
| DELETE | `/api/users/{id}` | Admin | Hapus user |

## Audit Logs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/audit-logs` | Yes | List logs (filter: user, action, date) |

## WebSocket

| Path | Description |
|------|-------------|
| `/ws/terminal/{vps_id}` | SSH terminal session |

Connect pake browser WebSocket API, kirim input, terima output.
