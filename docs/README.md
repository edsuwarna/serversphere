# ServerSphere

**Manage all your VPS from a single dashboard.** SSH terminal, container manager, resource monitoring, RBAC — all from your browser without installing any client or agent on your VPS.

I run several side projects, each with its own VPS. Every time I need to SSH in, I have to remember which IP belongs to which project. When multiple people need access, I'm adding SSH keys one by one to every server. Audit logs? Basically non-existent. Need to install Docker on all servers or reboot a few? Gotta run the same command on each one manually.

There are other tools out there — but most of them are way too complex for what I need. I just wanted something that fits *my* use case, nothing more. So I built ServerSphere. With a little help from AI, of course 😁

## Who is it for?

- **DevOps** — manage 5-50 VPS without opening 50 terminal tabs
- **Sysadmins** — SSH + monitor without installing anything on your laptop
- **Team Leads** — give limited VPS access to team members

## Features

- **Multi-VPS overview** — online/offline status, IP, resource usage at a glance
- **SSH terminal via WebSocket** — xterm.js, fully interactive — `apt`, `top`, `vim` right from your browser
- **Container management** — list, start, stop, restart containers from the dashboard
- **System logs viewer** — syslog, auth, kernel, docker, nginx — no SSH needed to check logs
- **Resource monitoring** — CPU, RAM, Disk, Load Average
- **User management + RBAC** — Admin / Operator / Viewer, per-VPS access control
- **SSO via OIDC** — Google Workspace, Microsoft Entra ID, Keycloak, Authentik, GitHub, GitLab, and more
- **Audit trail** — who did what, from where, and when

## Run it

```bash
# Use the image from GHCR
docker compose up -d
```

See [Quick Start](docs.html?page=quickstart) for detailed instructions.
