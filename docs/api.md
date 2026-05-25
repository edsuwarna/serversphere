# 🔌 API Reference

ServerSphere exposes a REST API for managing servers, users, and authentication.

## Authentication

All API endpoints (except login) require a session cookie.

### POST /api/login

Authenticate and get a session.

```json
Request:
{ "username": "admin", "password": "change-me" }

Response:
{ "success": true, "user": { "id": 1, "username": "admin", "role": "admin" } }
```

### POST /api/logout

End the current session.

---

## VPS

### GET /api/vps

List all VPS servers.

```json
Response:
[{ "id": 1, "name": "web-01", "host": "192.168.1.10", "port": 22, "status": "online", "user": "root" }]
```

### POST /api/vps

Add a new VPS server.

```json
Request:
{ "name": "web-01", "host": "192.168.1.10", "port": 22, "user": "root", "key_path": "/root/.ssh/id_ed25519" }
```

### DELETE /api/vps/{id}

Remove a VPS server.

---

## Users

### GET /api/users

List all users (admin only).

### POST /api/users

Create a new user.

```json
Request:
{ "username": "operator1", "password": "secret", "role": "operator", "vps_ids": [1, 2] }
```

### PUT /api/users/{id}

Update user role or VPS access.

### DELETE /api/users/{id}

Delete a user.

---

## WebSocket

### WS /api/terminal/{vps_id}

Open an interactive SSH terminal session.

Connect to `ws://host:8080/api/terminal/{vps_id}` with the session cookie.
The WebSocket streams terminal I/O bidirectionally.
