# Security

## Authentication
- Password di-hash pake bcrypt
- Session pake secure cookies (httponly)
- **Ganti default password** pas pertama login

## RBAC

| Role | Akses |
|------|-------|
| **admin** | Full: VPS, users, SSH, containers, logs |
| **operator** | SSH + command di VPS yang di-assign |
| **viewer** | Read-only: status, resource, logs |

## Network
- **Jangan expose port 8080 langsung ke publik**
- Pake reverse proxy (Nginx/Caddy) + HTTPS kalo perlu akses remote
- Firewall / security group buat batasin akses

## SSH
- SSH key di-mount **read-only** dari host
- Password SSH gak disimpan di database
- Tiap WebSocket terminal = SSH session independen
- Paramiko pake strict host key checking

## Database
- PostgreSQL di container terpisah (gak ke-expose)
- Credentials lewat environment variable
- Connection string gak pernah ke frontend

## Best Practices
1. Ganti default password admin
2. Pake `SECRET_KEY` yang kuat buat session signing
3. Mount key spesifik, bukan seluruh `~/.ssh`
4. Pake HTTPS kalo akses remote
5. Audit user & akses VPS secara berkala
6. Update dependencies (Paramiko, FastAPI)
