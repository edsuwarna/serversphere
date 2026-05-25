# ⚙️ Configuration

## Environment Variables (.env)

All configuration is done via environment variables in `.env`:

```
# Admin credentials
DASHBOARD_USER=admin
DASHBOARD_PASS=change-me

# Server
DASHBOARD_PORT=8080
SECRET_KEY=change-this-to-a-random-string

# PostgreSQL
POSTGRES_DB=vpsdashboard
POSTGRES_USER=vpsadmin
POSTGRES_PASSWORD=change-me
POSTGRES_HOST=db
POSTGRES_PORT=5432
```

## Adding a VPS Server

Via the dashboard:

1. Click **"Add VPS"**
2. Fill in:
   - **Name** — friendly name (e.g., "web-prod-01")
   - **Host** — IP or hostname
   - **SSH Port** — default 22
   - **SSH User** — e.g., `root`
   - **SSH Key File Path** — e.g., `/root/.ssh/id_ed25519`
3. Click Save

SSH keys must exist on the host machine and be mounted into the container.

## RBAC Configuration

### Roles

| Role | View VPS | Manage VPS | SSH Terminal | Run Commands | Manage Users |
|------|----------|------------|--------------|--------------|--------------|
| **admin** | ✅ All | ✅ | ✅ | ✅ | ✅ |
| **operator** | ✅ Assigned | ❌ | ✅ | ✅ | ❌ |
| **viewer** | ✅ Assigned | ❌ | ❌ | ❌ | ❌ |

### Assigning VPS Access

When creating/editing a user, you can:
- Leave VPS access empty for access to **all VPS**
- Select specific VPS for **restricted access**

## Docker Compose Configuration

```yaml
services:
  app:
    ports:
      - "${DASHBOARD_PORT}:8080"
    volumes:
      - ~/.ssh:/root/.ssh:ro  # SSH keys
      - /var/run/docker.sock:/var/run/docker.sock:ro  # Docker access
    depends_on:
      db:
        condition: service_healthy
```
