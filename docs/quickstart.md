# Quick Start

Butuh Docker & Docker Compose di server. Jalanin 2 menit.

## 1. Download & Jalanin

Buat `docker-compose.yml`, isi dari [Installation](/installation) — atau clone repo:

```bash
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere
docker compose up -d
```

## 2. Login

Buka `http://server-ip:8080`
- Username: `admin`
- Password: `change-me`

## 3. Tambah VPS

- Klik **Add VPS**
- Isi IP/hostname, SSH user, dan pilih SSH key
- Kalo sukses, server muncul di daftar dengan status hijau

## 4. Coba Fitur

- Klik icon terminal buat SSH langsung dari browser
- Tab **Containers** buat liat/start/stop container di VPS
- **Logs** buat liat syslog, auth, docker, nginx
- **Users** buat nambah tim dengan akses terbatas

## Default Credentials

Username: `admin` / Password: `change-me`

**Ganti password pas pertama login.** Jangan pake di production.
