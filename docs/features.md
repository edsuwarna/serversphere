# Features

## VPS Overview
Semua server dalam satu halaman. Lihat status online/offline, IP, resource usage, dan container count.

## SSH Terminal
Terminal interaktif dari browser pake xterm.js via WebSocket. Bisa buka banyak tab untuk server berbeda. Copy-paste support, resizable window.

## Container Management
List, start, stop, restart, hapus Docker container dari dashboard. Lihat logs dan resource usage per container.

## System Logs
Akses syslog, auth, kernel, docker, nginx logs langsung dari browser. Gak perlu SSH cuma buat liat log.

## Quick Commands
Tombol preset buat perintah umum: `df -h`, `free -h`, `uptime`, `docker ps`. Bisa tambah sendiri.

## Resource Monitoring
CPU bar, RAM used/total, Disk root partition, Load Average (1/5/15 menit). Update real-time.

## User Management & RBAC

| Role | VPS | SSH | Command | User |
|------|-----|-----|---------|------|
| **Admin** | ✅ All | ✅ | ✅ | ✅ |
| **Operator** | ✅ Assigned | ✅ | ✅ | ❌ |
| **Viewer** | ✅ Assigned | ❌ | ❌ | ❌ |

Assign VPS tertentu ke user, atau kosongin biar akses ke semua VPS.

## Database
PostgreSQL untuk persistent storage — users, VPS configs, audit logs, access control.

## Rencana ke Depan
- Real-time metrics via WebSocket streaming
- Alert thresholds & notifikasi
- Backup automation UI
- Multi-cluster support
