# 🔒 Security

## Access Control

### Authentication

- Passwords are hashed with bcrypt before storage
- Sessions are managed via secure cookies
- Default credentials must be changed on first login

### RBAC

Three levels of access:

| Role | Permissions |
|------|-------------|
| **admin** | Full access: manage servers, users, SSH, containers, logs |
| **operator** | SSH access + run commands on assigned VPS |
| **viewer** | Read-only: view status, resources, logs |

## Network Security

- **Dashboard port (8080) should NOT be exposed to the public internet**
- Use a reverse proxy (Nginx) with HTTPS if remote access is needed
- Restrict access via security group / firewall rules

## SSH Security

- SSH keys are mounted **read-only** from the host
- SSH passwords are not stored in the database
- Session isolation: each WebSocket terminal is an independent SSH session
- SSH connections use Paramiko with strict host key checking

## Database Security

- PostgreSQL runs in a separate container (not exposed externally)
- Database credentials are set via environment variables
- Connection string is never exposed to the frontend

## Best Practices

1. **Change default admin password immediately**
2. **Use strong SECRET_KEY** for session signing
3. **Mount only specific SSH keys**, not entire `~/.ssh`
4. **Use HTTPS** with a reverse proxy for remote access
5. **Regularly audit users and their VPS access**
6. **Keep dependencies updated** (especially Paramiko and FastAPI)

## Known Considerations

- SSH keys are stored on the host filesystem (not in the database)
- Terminal sessions are not encrypted end-to-end (WebSocket is local to the server)
- File uploads/downloads are not yet available via the dashboard
