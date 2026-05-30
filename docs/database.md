# Database Schema

ServerSphere pake PostgreSQL 18.

## Table: `users`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PRIMARY KEY | Unique ID |
| `username` | VARCHAR(100) UNIQUE NOT NULL | Login username |
| `password_hash` | VARCHAR(255) NOT NULL | bcrypt hash |
| `role` | VARCHAR(20) NOT NULL DEFAULT 'viewer' | admin / operator / viewer |
| `created_at` | TIMESTAMP DEFAULT NOW() | |

## Table: `vps`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PRIMARY KEY | Unique ID |
| `name` | VARCHAR(100) NOT NULL | Nama server |
| `host` | VARCHAR(255) NOT NULL | IP atau hostname |
| `port` | INTEGER DEFAULT 22 | SSH port |
| `user` | VARCHAR(100) NOT NULL | SSH user |
| `key_path` | VARCHAR(255) | Path SSH key |
| `created_at` | TIMESTAMP DEFAULT NOW() | |

## Table: `user_vps_access`

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | INTEGER REFERENCES users(id) ON DELETE CASCADE | User |
| `vps_id` | INTEGER REFERENCES vps(id) ON DELETE CASCADE | VPS |

Primary key: (`user_id`, `vps_id`)

## Access Logic

- **Admin** — liat semua VPS (gak perlu `user_vps_access`)
- **Operator/Viewer** — cuma liat VPS yang tercatat di `user_vps_access`
- Kalo daftar akses kosong — user bisa akses SEMUA VPS (fallback)
