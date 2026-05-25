# 🔒 Keamanan

## Access Control

- Password di-hash pake bcrypt
- Session via secure cookies
- Ganti default password pas pertama login

### RBAC

| Role | Permissions |
|------|-------------|
| **admin** | Full access: manage servers, users, SSH |
| **operator** | SSH access di assigned VPS |
| **viewer** | Read-only: status, resources, logs |

## Network Security

- **Port 8080 jangan di-expose ke public internet**
- Pake reverse proxy (Nginx) + HTTPS kalo perlu akses remote
- Restrict akses via security group / firewall

## SSH Security

- SSH keys di-mount read-only dari host
- Password SSH gak disimpan di database
- Setiap sesi terminal adalah SSH session independen

## Best Practices

1. Ganti default admin password segera
2. Pake SECRET_KEY yang kuat
3. Mount SSH key spesifik, bukan seluruh ~/.ssh
4. Pake HTTPS dengan reverse proxy
5. Audit user dan akses VPS secara berkala
