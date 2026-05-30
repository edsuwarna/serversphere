# ServerSphere 🌐

**Dashboard buat manage banyak VPS dari browser.** SSH terminal, container management, monitoring, RBAC — tanpa install agent di server.

Gue punya beberapa side project dengan VPS masing-masing. Tiap SSH harus inget IP mana punya project apa. Kalo ada tim yang perlu akses, add public key satu-satu ke tiap server. Audit log susah. Jalanin command berulang di tiap server males banget.

Tools lain terlalu kompleks. Jadinya bikin sendiri — ServerSphere, open source, dibantu AI 😁

## Fitur

- **Multi-VPS Overview** — status online/offline + resource usage sekilas
- **SSH Terminal** — terminal beneran (xterm.js) dari browser. Bisa `apt`, `top`, `vim`
- **Container Management** — list, start, stop, restart container dari dashboard
- **System Logs** — syslog, auth, kernel, docker, nginx logs — gak perlu SSH
- **Resource Monitoring** — CPU, RAM, Disk, Load Average
- **RBAC** — Admin/Operator/Viewer, akses per-VPS, audit trail

## Jalanin

```bash
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere
docker compose up -d
# Buka http://your-server-ip:8080
```

Atau pake image dari GHCR — langsung `docker compose up -d` pake [docker-compose.yml ini](https://github.com/edsuwarna/serversphere).

## Tech

**Backend:** FastAPI, SQLAlchemy, Paramiko · **DB:** PostgreSQL 18 · **Frontend:** Vanilla JS, xterm.js · **Deploy:** Docker Compose

📖 **[Dokumentasi Lengkap → serversphere.pages.dev](https://serversphere.pages.dev)**

🇬🇧 [English](README.md)
