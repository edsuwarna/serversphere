# 🛠️ Development

## Prerequisites

- Python 3.9+
- PostgreSQL 16+
- Docker (optional, for testing)

## Local Setup

```bash
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere

# Install dependencies
pip install fastapi uvicorn sqlalchemy paramiko psycopg2-binary

# Setup PostgreSQL
createdb vpsdashboard
```

## Project Structure

```
serversphere/
├── backend/
│   ├── main.py           ← FastAPI app (routes, WebSocket)
│   ├── database.py       ← DB connection & session
│   ├── models.py         ← SQLAlchemy models
│   ├── frontend/
│   │   ├── index.html    ← SPA dashboard
│   │   ├── css/style.css ← Styles
│   │   └── js/app.js     ← Client logic
│   └── requirements.txt  ← Python dependencies
├── docker-compose.yml    ← Production setup
├── Dockerfile            ← App container
├── .env.example          ← Config template
└── docs/                 ← Documentation
```

## Running Locally

```bash
cd backend
# Ensure PostgreSQL is running with correct credentials in .env
uvicorn main:app --reload --host 0.0.0.0 --port 8080
```

## Key Dependencies

- **FastAPI** — Web framework with async support
- **SQLAlchemy** — ORM for database operations
- **Paramiko** — SSH client for remote server access
- **xterm.js** — Terminal emulator (frontend)

## Testing

```bash
# Manual: Start server, open browser, test features
# 1. Add a VPS
# 2. Open terminal
# 3. View containers
# 4. Create user with restricted access
```
