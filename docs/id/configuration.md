# ⚙️ Konfigurasi

## Environment Variables (.env)

```
DASHBOARD_USER=admin
DASHBOARD_PASS=change-me
DASHBOARD_PORT=8080
SECRET_KEY=change-this-to-a-random-string
POSTGRES_DB=vpsdashboard
POSTGRES_USER=vpsadmin
POSTGRES_PASSWORD=change-me
```

## Nambah VPS

1. Klik **"Add VPS"**
2. Isi: Name, Host, SSH Port, SSH User, SSH Key Path
3. Simpan

## RBAC Configuration

| Role | View VPS | Manage VPS | SSH Terminal | Manage Users |
|------|----------|------------|--------------|--------------|
| **admin** | ✅ All | ✅ | ✅ | ✅ |
| **operator** | ✅ Assigned | ❌ | ✅ | ❌ |
| **viewer** | ✅ Assigned | ❌ | ❌ | ❌ |
