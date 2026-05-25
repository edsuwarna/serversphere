# 🔍 Troubleshooting

## Docker Issues

### Container won't start

```bash
# Check logs
docker compose logs app

# Rebuild
docker compose up -d --build

# Check port conflicts
sudo lsof -i :8080
```

### Database connection failed

```bash
# Check if DB is healthy
docker compose ps

# Restart DB
docker compose restart db

# Check DB logs
docker compose logs db
```

## SSH Issues

### "Connection refused"

```bash
# Test SSH from the host machine
ssh user@vps-ip

# Check SSH port
nc -zv vps-ip 22

# Verify VPS credentials in dashboard
```

### "Permission denied (publickey)"

```bash
# Check if key exists on host
ls -la ~/.ssh/

# Test key
ssh -i ~/.ssh/id_ed25519 user@vps-ip

# Key mounted in container?
docker compose exec app ls -la /root/.ssh/
```

## Login Issues

### Can't log in

```bash
# Reset admin password
# Set in .env and restart:
DASHBOARD_USER=admin
DASHBOARD_PASS=newpassword
docker compose restart app
```

### "Session expired"

- Clear browser cookies/cache
- Re-login
- Check `SECRET_KEY` in `.env` (changing it invalidates sessions)

## Dashboard Issues

### VPS showing offline

```bash
# SSH from dashboard terminal (if available)
# Check network from app container
docker compose exec app ping vps-ip

# Verify SSH key permissions
docker compose exec app ls -la /root/.ssh/
```

### Terminal not connecting

```bash
# Check WebSocket endpoint
# Browser DevTools → Network → WS messages

# Check app logs
docker compose logs app | grep terminal
```

## Reset Everything

```bash
# Stop and remove volumes
docker compose down -v

# Fresh start
docker compose up -d --build
```
