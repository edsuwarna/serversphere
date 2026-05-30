# Configuration

## Environment Variables

Create a `.env` file next to your `docker-compose.yml`:

```env
# Admin login
DASHBOARD_USER=admin
DASHBOARD_PASS=change-this

# Web server
DASHBOARD_PORT=8080
SECRET_KEY=use-a-long-random-string

# PostgreSQL
POSTGRES_DB=vpsdashboard
POSTGRES_USER=vpsadmin
POSTGRES_PASSWORD=change-this-too
POSTGRES_HOST=serversphere-db
POSTGRES_PORT=5432
```

If you prefer not to use `.env`, you can set these directly under `environment:` in your `docker-compose.yml`.

## Add VPS

From the dashboard: click **Add VPS** → fill in:

| Field | Example | Required |
|-------|---------|----------|
| Name | web-prod-01 | optional |
| Host | 192.168.1.100 or server.example.com | required |
| SSH Port | 22 | optional |
| SSH User | root | required |
| SSH Key Path | /root/.ssh/id_ed25519 | required |

The SSH key must exist on the host and be mounted into the container (see `volumes` in `docker-compose.yml`).

## OIDC / SSO

ServerSphere supports **OpenID Connect** for single sign-on. Quick setup:

```env
OIDC_ENABLED=true
OIDC_NAME="Google Workspace"
OIDC_DISCOVERY_URL=https://accounts.google.com/.well-known/openid-configuration
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
```

> 📖 Full guide: [OIDC / SSO Documentation](docs.html?page=oidc)

## RBAC

| Role | View VPS | Manage VPS | SSH | Command | User |
|------|----------|------------|-----|---------|------|
| **admin** | ✅ All | ✅ | ✅ | ✅ | ✅ |
| **operator** | ✅ Assigned | ❌ | ✅ | ✅ | ❌ |
| **viewer** | ✅ Assigned | ❌ | ❌ | ❌ | ❌ |

If VPS access is empty, the user can access all servers.
