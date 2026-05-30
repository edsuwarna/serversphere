# ServerSphere 🌐

**Multi-server management dashboard from your browser.** SSH terminal, container management, resource monitoring, RBAC — zero agent, zero client tools.

This started as a personal frustration: managing 15+ VPS across Linode, Vultr, DigitalOcean, and a local server. SSH into each one just to check uptime? `tail -f` logs from separate terminals? Give team members SSH keys to production servers? There had to be a better way.

ServerSphere is that way. **A single web dashboard that talks to all your servers via SSH.** No agents to install, no new protocols to learn. And it's open source — no subscriptions needed.

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
