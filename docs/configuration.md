# Configuration

## Environment Variables

Buat file `.env` di samping `docker-compose.yml`:

```env
# Admin login
DASHBOARD_USER=admin
DASHBOARD_PASS=ganti-ini

# Web server
DASHBOARD_PORT=8080
SECRET_KEY=pake-string-random-yang-panjang

# PostgreSQL
POSTGRES_DB=vpsdashboard
POSTGRES_USER=vpsadmin
POSTGRES_PASSWORD=ganti-ini-juga
POSTGRES_HOST=serversphere-db
POSTGRES_PORT=5432
```

Kalo gak pake `.env`, bisa langsung di `environment:` di docker-compose.

## Add VPS

Dari dashboard: **Add VPS** → isi:

| Field | Contoh | Wajib? |
|-------|--------|--------|
| Name | web-prod-01 | optional |
| Host | 192.168.1.100 atau server.example.com | wajib |
| SSH Port | 22 | optional |
| SSH User | root | wajib |
| SSH Key Path | /root/.ssh/id_ed25519 | wajib |

SSH key harus ada di host dan termount ke container (lihat `volumes` di docker-compose).

## OIDC / SSO

ServerSphere supports **OpenID Connect** for single sign-on. Setup:

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

Kalo VPS access kosong, user bisa akses semua server.
