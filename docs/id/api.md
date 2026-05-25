# 🔌 Referensi API

## Autentikasi

### POST /api/login
```json
Request: { "username": "admin", "password": "change-me" }
Response: { "success": true, "user": { "id": 1, "username": "admin", "role": "admin" } }
```

## VPS

### GET /api/vps
Daftar semua VPS.

### POST /api/vps
Tambah VPS baru.
```json
Request: { "name": "web-01", "host": "192.168.1.10", "port": 22, "user": "root" }
```

## Users

### GET /api/users
Daftar semua user (admin only).

### POST /api/users
Tambah user baru.
```json
Request: { "username": "operator1", "password": "secret", "role": "operator" }
```

## WebSocket

### WS /api/terminal/{vps_id}
Buka sesi SSH terminal interaktif.
