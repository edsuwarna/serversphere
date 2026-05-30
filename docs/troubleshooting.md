# Troubleshooting

## Container Gak Mau Start

```bash
docker compose logs serversphere   # cek error
docker compose up -d --build       # rebuild
sudo lsof -i :8080                 # cek port conflict
```

## Database Connection Failed

```bash
docker compose ps                  # cek status
docker compose logs serversphere-db # cek error DB
docker compose restart serversphere-db
```

## SSH "Connection Refused"

```bash
ssh user@vps-ip                    # test dari host
nc -zv vps-ip 22                   # test port
# cek lagi credentials VPS di dashboard
```

## SSH "Permission Denied (publickey)"

```bash
ls -la ~/.ssh/                     # cek key ada di host
ssh -i ~/.ssh/id_ed25519 user@vps-ip  # test key
docker compose exec serversphere ls -la /root/.ssh/  # cek mount
```

## Gak Bisa Login

Reset password di `.env` atau environment:
```
DASHBOARD_PASS=password-baru
```
Trus `docker compose restart serversphere`.

Kalo session expired: clear cookies browser atau relogin. Ganti `SECRET_KEY` bakal invalidate semua session.

## VPS Status Offline

```bash
docker compose exec serversphere ping vps-ip  # test koneksi
docker compose exec serversphere ls -la /root/.ssh/  # cek key
```

## Terminal Gak Connect

Cek browser DevTools → Network → WS messages. Cek app logs:
```bash
docker compose logs serversphere | grep -i terminal
```

## Reset Total

```bash
docker compose down -v   # stop + hapus volume
docker compose up -d     # fresh start
```
