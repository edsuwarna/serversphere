# Quick Start

You need Docker & Docker Compose on your server. Takes about 2 minutes.

## 1. Download & Run

Create a `docker-compose.yml` (see [Installation](docs.html?page=installation)) or clone the repo:

```bash
git clone https://github.com/edsuwarna/serversphere.git
cd serversphere
docker compose up -d
```

## 2. Login

Open `http://server-ip:8080`
- Username: `admin`
- Password: `change-me`

## 3. Add a VPS

- Click **Add VPS**
- Enter the IP/hostname, SSH user, and select an SSH key
- If successful, the server appears in the list with a green status indicator

## 4. Try the Features

- Click the terminal icon to SSH directly from your browser
- Open the **Containers** tab to view/start/stop containers on your VPS
- Check **Usage Guide** for detailed walkthroughs
