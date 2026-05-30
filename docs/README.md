# ServerSphere

**Manage semua VPS dari satu dashboard.** SSH terminal, container manager, resource monitoring, RBAC — semua dari browser tanpa install client atau agent di VPS.

Ini lahir dari masalah gue sendiri: manage 15+ server di Linode, Vultr, DO, sama server lokal. Buka SSH satu-satu itu males banget, apalagi kalo cuma mau ngecek uptime atau restart container. Ditambah kalo ada tim yang perlu akses — kasih SSH key? Gak aman. Bikin VPN? Ribet.

ServerSphere jawabannya: **satu dashboard, semua server, open source.**

## Cocok buat siapa?

- **DevOps** — manage 5-50 VPS tanpa buka terminal 50 kali
- **Sysadmin** — SSH + monitor tanpa install client di laptop
- **Team Lead** — kasih akses terbatas per VPS ke anggota tim

## Fitur Utama

- **Multi-VPS overview** — status online/offline, IP, resource usage sekilas
- **SSH terminal via WebSocket** — xterm.js, full interactive, bisa `apt`, `top`, `vim`
- **Container management** — list, start, stop, restart dari dashboard
- **System logs viewer** — syslog, auth, kernel, docker, nginx — gak perlu SSH buat liat log
- **Resource monitoring** — CPU, RAM, Disk, Load Average
- **User management + RBAC** — Admin / Operator / Viewer, per-VPS access
- **Audit trail** — siapa ngapain, dari mana, kapan

## Jalanin

```bash
# Pake image dari GHCR
docker compose up -d
```

Lihat [Installation](/installation) buat detail konfigurasi.

## Tech Stack

**Backend:** FastAPI, SQLAlchemy, Paramiko  
**Database:** PostgreSQL 18  
**Frontend:** Vanilla JS, xterm.js  
**Deploy:** Docker Compose  
**Auth:** Session-based + future OIDC support

---

[Quick Start →](/quickstart) · [Installation →](/installation) · [API Docs →](/api) · [GitHub →](https://github.com/edsuwarna/serversphere)
