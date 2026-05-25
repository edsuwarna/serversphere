# ⚡ Mulai Cepat

Jalanin ServerSphere dalam 2 menit.

## Prasyarat

- **Docker** dan **Docker Compose**
- Server dengan akses SSH (untuk manage VPS remote)

## Launch

```bash
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere
cp .env.example .env
docker compose up -d --build
# Buka http://your-server-ip:8080
# Login: admin / change-me
```

## Selanjutnya

1. **Tambah VPS** — Klik "Add VPS", masukin hostname, SSH user, key
2. **Buka Terminal** — Klik icon terminal untuk SSH ke server
3. **Manage Container** — Lihat, start, stop container dari dashboard
