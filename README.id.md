# ServerSphere - Multi-Server Management 🌐

Dashboard web untuk mengelola banyak VPS via SSH dari satu tempat.

## Fitur

- **VPS Overview** — Lihat status online/offline + resource usage semua server
- **SSH Terminal** — Terminal interaktif (xterm.js) via WebSocket dari browser
- **Container Management** — List, start, stop, restart container Docker
- **System Logs** — Lihat syslog, auth, kernel, docker, nginx logs
- **Resource Monitoring** — CPU, RAM, Disk, Load Average dengan visual bar
- **RBAC** — Admin, Operator, Viewer roles dengan akses per-VPS

## Quick Start

```bash
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere
cp .env.example .env
docker compose up -d
# Buka http://your-server-ip:8080
```

📖 **[Dokumentasi Lengkap → docs/index.html](./docs/index.html)**

🇬🇧 [English](README.md)
