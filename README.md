# ServerSphere 🌐

**Multi-server management dashboard from your browser.** SSH terminal, container management, resource monitoring, RBAC — zero agent, zero client tools.

I run a few side projects, each with their own VPS. Nothing crazy — but every time I SSH in, I have to remember which IP belongs to which project. When multiple people need access, I'm adding public keys one by one to every server. Audit logs? Non-existent. Need to install Docker on all servers or reboot a few? Gotta run the same command on each one manually.

There are tools out there — but most are way too complex for what I need. So I built ServerSphere. With a little help from AI, of course 😁

## What it does

- **Multi-VPS overview** — see all servers, their status, IPs, and resource usage at a glance
- **SSH terminal** — full interactive terminal via WebSocket (xterm.js). Works with `apt`, `top`, `vim` — anything you'd do in a regular SSH session
- **Container management** — list, start, stop, restart, remove Docker containers across any VPS
- **System logs** — browse syslog, auth, kernel, docker, nginx logs from the dashboard
- **Resource monitoring** — CPU, RAM, Disk, Load Average with real-time updates
- **RBAC** — Admin, Operator, Viewer roles with per-VPS access control
- **Audit trail** — complete log of who did what, from where, and when

## Quick start

```bash
# Docker compose — 2 minutes, done
docker compose up -d
```

Open `http://your-server:8080` and you're in.

## For who?

| You | Why ServerSphere |
|-----|------------------|
| **DevOps** | Manage 5-50 VPS from one dashboard. No more 50 terminal tabs. |
| **Sysadmin** | SSH + monitoring without installing anything on your laptop. |
| **Team Lead** | Give limited VPS access to team members. See everything in audit logs. |

## Tech

**Backend:** FastAPI, SQLAlchemy, Paramiko  
**Database:** PostgreSQL 18  
**Frontend:** Vanilla JS, xterm.js  
**Deploy:** Docker Compose

## Documentation

Full docs at **[serversphere.pages.dev](https://serversphere.pages.dev)**

[Installation →](https://serversphere.pages.dev/docs.html?page=installation) · [Quick Start →](https://serversphere.pages.dev/docs.html?page=quickstart) · [API Docs →](https://serversphere.pages.dev/docs.html?page=api) · [GitHub →](https://github.com/edsuwarna/serversphere)

---

Built by [Endang Suwarna](https://github.com/edsuwarna) — because SSH-ing into 15 servers one by one is a waste of life. MIT License.
