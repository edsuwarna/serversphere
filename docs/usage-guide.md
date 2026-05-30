# Usage Guide

## Dashboard
Setelah login, lu liat semua server dalam bentuk cards — status (hijau/merah), IP, CPU, RAM, Disk.

## SSH Terminal
Klik icon terminal di card server. Terminal full beneran — bisa `apt update`, `top`, `vim`, apa aja.
- Buka banyak tab buat server beda
- Copy-paste pake Ctrl+Shift+C / Ctrl+Shift+V
- Ukuran terminal bisa diresize

## Container Management
Buka tab Containers di dashboard:
- **List** — liat semua container (name, image, status, ports)
- **Start/Stop/Restart/Remove** — dari tombol aja
- **Logs** — liat real-time logs per container
- **Stats** — CPU & Memory per container

## System Logs
Tab Logs → pilih jenis log:
- Syslog — `/var/log/syslog`
- Auth — `/var/log/auth.log`
- Kernel — `dmesg`
- Docker — `docker logs`
- Nginx — `/var/log/nginx/*.log`

## Resource Monitoring
Setiap server card nunjukkin:
- **CPU** — progress bar + persentase
- **RAM** — used / total
- **Disk** — pemakaian partition root
- **Load Average** — 1, 5, 15 menit

## User Management
Admin bisa:
1. **Buat user** — nama, password, role
2. **Assign VPS** — pilih server mana yang bisa diakses
3. **Edit role** — naikin/turunin level
4. **Hapus user** — cabut akses

## Quick Commands
Tombol preset di halaman VPS detail:
- `df -h` — cek disk
- `free -h` — cek RAM
- `uptime` — uptime server
- `docker ps` — container list

Klik tinggal jalan, gak perlu ngetik manual.
