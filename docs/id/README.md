# ServerSphere — Multi-Server Management 🌐

Dashboard web untuk manage banyak VPS via SSH dari satu tempat.

## Apa itu ServerSphere?

ServerSphere adalah **dashboard multi-server berbasis web** yang memungkinkan:

- Lihat semua VPS dalam satu tempat dengan status online/offline
- SSH ke server langsung dari browser (WebSocket terminal)
- Manage container Docker di semua VPS
- Monitor CPU, RAM, Disk, Load secara real-time
- Kontrol akses dengan role-based permissions (Admin, Operator, Viewer)

## Tech Stack

- **Backend:** FastAPI (Python), SQLAlchemy, Paramiko (SSH)
- **Database:** PostgreSQL 16
- **Frontend:** Vanilla JS, xterm.js, CSS dark theme
- **Deployment:** Docker Compose (app + database)
