# 🗄 Database Schema

ServerSphere uses PostgreSQL 16 with the following schema.

## Table: `users`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PRIMARY KEY | Unique user ID |
| `username` | VARCHAR(100) UNIQUE NOT NULL | Login username |
| `password_hash` | VARCHAR(255) NOT NULL | bcrypt hashed password |
| `role` | VARCHAR(20) NOT NULL DEFAULT 'viewer' | admin, operator, or viewer |
| `created_at` | TIMESTAMP DEFAULT NOW() | Account creation time |

## Table: `vps`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PRIMARY KEY | Unique VPS ID |
| `name` | VARCHAR(100) NOT NULL | Friendly name |
| `host` | VARCHAR(255) NOT NULL | IP or hostname |
| `port` | INTEGER DEFAULT 22 | SSH port |
| `user` | VARCHAR(100) NOT NULL | SSH username |
| `key_path` | VARCHAR(255) | SSH key file path |
| `created_at` | TIMESTAMP DEFAULT NOW() | Added date |

## Table: `user_vps_access`

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | INTEGER REFERENCES users(id) ON DELETE CASCADE | User |
| `vps_id` | INTEGER REFERENCES vps(id) ON DELETE CASCADE | VPS server |

Primary key is (`user_id`, `vps_id`).

## Relationships

```
users ──< user_vps_access >── vps
  │                                │
  │  (has many)                    │  (has many users)
  └── admins see all VPS           └── assigned to operators/viewers
```

## Access Logic

- **admin:** Sees all VPS (no user_vps_access needed)
- **operator/viewer:** Only sees VPS listed in user_vps_access
- **Empty access list for operator/viewer:** Access to ALL VPS (convenience fallback)
