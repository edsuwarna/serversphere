# ServerSphere — Multi-Server Management

A single-page web dashboard for managing multiple VPS servers via SSH.

## What is ServerSphere?

ServerSphere is a **web-based multi-server management dashboard** that lets you:

- View all your VPS servers in one place with online/offline status
- SSH into any server directly from your browser (WebSocket terminal)
- Manage Docker containers across all VPS
- Monitor CPU, RAM, Disk, and Load in real-time
- Control access with role-based permissions (Admin, Operator, Viewer)

## Who Is It For?

| Segment | Use Case |
|---------|----------|
| **DevOps Engineer** | Manage 5-50 VPS from a single dashboard |
| **System Admin** | SSH, monitor, and debug servers without client tools |
| **Team Lead** | Give team members restricted access per-VPS |

## Tech Stack

- **Backend:** FastAPI (Python), SQLAlchemy, Paramiko (SSH)
- **Database:** PostgreSQL 16
- **Frontend:** Vanilla JS, xterm.js, CSS dark theme
- **Deployment:** Docker Compose (app + database)
