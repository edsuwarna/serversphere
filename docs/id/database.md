# 🗄 Skema Database

ServerSphere pake PostgreSQL 16.

## Table: `users`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PRIMARY KEY | ID user |
| `username` | VARCHAR(100) UNIQUE | Username login |
| `password_hash` | VARCHAR(255) | bcrypt hash |
| `role` | VARCHAR(20) | admin/operator/viewer |

## Table: `vps`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PRIMARY KEY | ID VPS |
| `name` | VARCHAR(100) | Nama server |
| `host` | VARCHAR(255) | IP atau hostname |
| `port` | INTEGER DEFAULT 22 | SSH port |
| `user` | VARCHAR(100) | SSH username |

## Table: `user_vps_access`

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | INTEGER FK | User |
| `vps_id` | INTEGER FK | VPS server |

## Access Logic

- **admin:** Lihat semua VPS
- **operator/viewer:** Hanya lihat VPS yang di-assign
- **Empty access list:** Akses ke SEMUA VPS (fallback)
