# 🔍 Pemecahan Masalah

## Docker Issues

```bash
# Container gak mau start
docker compose logs app
docker compose up -d --build
```

## SSH Issues

```bash
# Test SSH dari host
ssh user@vps-ip

# Cek port
nc -zv vps-ip 22

# Cek key di-mount?
docker compose exec app ls -la /root/.ssh/
```

## Login Issues

```bash
# Reset admin password di .env, restart
docker compose restart app
```

## Dashboard Issues

```bash
# VPS offline? Cek koneksi
docker compose exec app ping vps-ip

# Terminal gak connect? Cek log
docker compose logs app | grep terminal
```

## Reset Total

```bash
docker compose down -v
docker compose up -d --build
```
