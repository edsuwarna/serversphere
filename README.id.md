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
docker compose up -d
# Buka http://your-server-ip:8080
```

## Image Docker

Tersedia di [GitHub Container Registry](https://github.com/users/edsuwarna/packages/container/package/serversphere).

```yaml
image: ghcr.io/edsuwarna/serversphere:TAG
```

| Tag | Nunjuk ke | Dipasang oleh | Kapan pakenya |
|-----|-----------|---------------|--------------|
| `latest` | Rilis stabil terbaru | Release workflow | Production — versi stabil paling baru |
| `stable` | Sama kayak `latest` | Release workflow | Production — alias eksplisit `latest` |
| `0.1.0` | Rilis ini | Release workflow | Pin ke versi tertentu |
| `edge` | Commit terakhir di `main` | Main-build workflow | Testing / staging — fitur terbaru |
| `sha-xxxxxxx` | Commit spesifik | Main-build workflow | Rollback / debugging |

> **💡 Tips:** Pake `ghcr.io/edsuwarna/serversphere:stable` di production. Selalu nunjuk ke rilis stabil tanpa ke-*overwrite* sama build dari main.

## Tech

**Backend:** FastAPI, SQLAlchemy, Paramiko · **DB:** PostgreSQL 18 · **Frontend:** Vanilla JS, xterm.js · **Deploy:** Docker Compose

📖 **[Dokumentasi Lengkap → serversphere.pages.dev](https://serversphere.pages.dev)**

🇬🇧 [English](README.md)
