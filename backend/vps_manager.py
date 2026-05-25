"""
VPS Manager - SSH connection pooling and command execution.
Uses PostgreSQL via SQLAlchemy for VPS data persistence.
"""
import asyncio
import paramiko
import os
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
import threading

from database import SessionLocal, VPS as VPSModel, init_db


# ─── Lightweight config object for SSH functions ──────────────

@dataclass
class VPSConfig:
    """Simple dataclass used by SSH connection pool and command execution.
    Constructed from a database row to provide a lightweight, serializable
    object with the same attribute interface the SSH layer expects."""
    id: str
    name: str
    host: str
    port: int = 22
    username: str = "root"
    password: Optional[str] = None
    key_file: Optional[str] = None
    tags: list = field(default_factory=list)
    group: str = "default"

    @classmethod
    def from_db_row(cls, row: VPSModel) -> "VPSConfig":
        """Create a VPSConfig from a SQLAlchemy VPS model instance."""
        return cls(
            id=row.id,
            name=row.name,
            host=row.host,
            port=row.port,
            username=row.username,
            password=row.password,
            key_file=row.key_file,
            tags=row.tags if row.tags else [],
            group=row.group_name,
        )


# ─── SSH Connection Pool (unchanged) ─────────────────────────

class SSHConnectionPool:
    """Manages SSH connections with pooling."""

    def __init__(self):
        self._connections: Dict[str, paramiko.SSHClient] = {}
        self._lock = threading.Lock()

    def get_connection(self, vps: VPSConfig) -> paramiko.SSHClient:
        with self._lock:
            key = vps.id
            if key in self._connections:
                client = self._connections[key]
                transport = client.get_transport()
                if transport and transport.is_active():
                    return client
                else:
                    try:
                        client.close()
                    except:
                        pass
                    del self._connections[key]

            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            connect_kwargs = {
                "hostname": vps.host,
                "port": vps.port,
                "username": vps.username,
                "timeout": 10,
            }
            if vps.key_file and os.path.exists(os.path.expanduser(vps.key_file)):
                connect_kwargs["key_filename"] = os.path.expanduser(vps.key_file)
            elif vps.password:
                connect_kwargs["password"] = vps.password

            client.connect(**connect_kwargs)
            self._connections[key] = client
            return client

    def execute(self, vps: VPSConfig, command: str, timeout: int = 30) -> Dict[str, Any]:
        """Execute a command on a VPS and return the result."""
        try:
            client = self.get_connection(vps)
            stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
            exit_code = stdout.channel.recv_exit_status()
            out = stdout.read().decode("utf-8", errors="replace")
            err = stderr.read().decode("utf-8", errors="replace")
            return {"stdout": out, "stderr": err, "exit_code": exit_code, "success": exit_code == 0}
        except Exception as e:
            # Invalidate cached connection
            with self._lock:
                self._connections.pop(vps.id, None)
            return {"stdout": "", "stderr": str(e), "exit_code": -1, "success": False}

    def execute_async(self, vps: VPSConfig, command: str, timeout: int = 30) -> Dict[str, Any]:
        """Execute command in a thread-safe way for async context."""
        loop = asyncio.get_event_loop()
        return loop.run_in_executor(None, self.execute, vps, command, timeout)

    def create_channel(self, vps: VPSConfig, cols: int = 80, rows: int = 24):
        """Create an interactive SSH channel for terminal."""
        client = self.get_connection(vps)
        transport = client.get_transport()
        if not transport or not transport.is_active():
            with self._lock:
                del self._connections[vps.id]
            client = self.get_connection(vps)
            transport = client.get_transport()

        channel = transport.open_session()
        channel.get_pty("xterm-256color", cols, rows)
        channel.invoke_shell()
        return channel

    def close(self, vps_id: str):
        with self._lock:
            client = self._connections.pop(vps_id, None)
            if client:
                try:
                    client.close()
                except:
                    pass

    def close_all(self):
        with self._lock:
            for client in self._connections.values():
                try:
                    client.close()
                except:
                    pass
            self._connections.clear()


# ─── VPS Manager (PostgreSQL-backed) ─────────────────────────

class VPSManager:
    """Manages VPS configs and high-level operations.
    Persists VPS data in PostgreSQL via SQLAlchemy."""

    def __init__(self):
        self.ssh_pool = SSHConnectionPool()
        init_db()

    # ─── Persistence helpers ─────────────────────────────────

    def _get_session(self):
        """Create a new SQLAlchemy session."""
        return SessionLocal()

    def load_vps_list(self) -> list:
        """Load all VPS entries from the database.
        Returns a list of VPSConfig objects for backward compatibility."""
        session = self._get_session()
        try:
            rows = session.query(VPSModel).all()
            return [VPSConfig.from_db_row(r) for r in rows]
        finally:
            session.close()

    def add_vps(self, vps: VPSConfig) -> bool:
        """Add a new VPS. Returns True on success, False if ID already exists."""
        session = self._get_session()
        try:
            existing = session.query(VPSModel).filter(VPSModel.id == vps.id).first()
            if existing:
                return False
            row = VPSModel(
                id=vps.id,
                name=vps.name,
                host=vps.host,
                port=vps.port,
                username=vps.username,
                password=vps.password,
                key_file=vps.key_file,
                tags=vps.tags,
                group=vps.group,
            )
            session.add(row)
            session.commit()
            return True
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def update_vps(self, vps_id: str, vps: VPSConfig) -> bool:
        """Update an existing VPS. Returns True on success, False if not found."""
        session = self._get_session()
        try:
            row = session.query(VPSModel).filter(VPSModel.id == vps_id).first()
            if not row:
                return False
            row.name = vps.name
            row.host = vps.host
            row.port = vps.port
            row.username = vps.username
            row.password = vps.password
            row.key_file = vps.key_file
            row.tags = vps.tags
            row.group_name = vps.group
            session.commit()
            return True
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def remove_vps(self, vps_id: str) -> bool:
        """Remove a VPS by ID. Returns True on success, False if not found."""
        session = self._get_session()
        try:
            row = session.query(VPSModel).filter(VPSModel.id == vps_id).first()
            if not row:
                return False
            session.delete(row)
            session.commit()
            self.ssh_pool.close(vps_id)
            return True
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def get_vps(self, vps_id: str) -> Optional[VPSConfig]:
        """Get a single VPS by ID. Returns a VPSConfig or None."""
        session = self._get_session()
        try:
            row = session.query(VPSModel).filter(VPSModel.id == vps_id).first()
            if row:
                return VPSConfig.from_db_row(row)
            return None
        finally:
            session.close()

    # ─── Resource Gathering ──────────────────────────────────

    def get_system_info(self, vps: VPSConfig) -> Dict[str, Any]:
        """Get comprehensive system info."""
        scripts = {
            "hostname": "hostname",
            "os": "cat /etc/os-release 2>/dev/null | head -5",
            "uptime": "uptime -p 2>/dev/null || uptime",
            "kernel": "uname -r",
            "cpu_model": "lscpu 2>/dev/null | grep 'Model name' | cut -d: -f2 | xargs",
            "cpu_cores": "nproc",
        }
        results = {}
        for key, cmd in scripts.items():
            r = self.ssh_pool.execute(vps, cmd)
            results[key] = r["stdout"].strip() if r["success"] else "N/A"
        return results

    def get_resource_usage(self, vps: VPSConfig) -> Dict[str, Any]:
        """Get real-time resource usage."""
        script = """
echo '===CPU==='
top -bn1 | head -3
echo '===MEM==='
free -m | grep -E '^(Mem|Swap)'
echo '===DISK==='
df -h --total 2>/dev/null | tail -1
echo '===LOAD==='
cat /proc/loadavg
echo '===NET==='
cat /proc/net/dev | grep -E 'eth|ens|enp|wlan' | awk '{print $1,$2,$10}' | head -5
echo '===PROCS==='
ps aux --sort=-%mem | head -8
"""
        r = self.ssh_pool.execute(vps, script, timeout=15)
        if not r["success"]:
            return {"error": r["stderr"]}

        raw = r["stdout"]
        sections = {}
        current = None
        for line in raw.split("\n"):
            if line.startswith("===") and line.endswith("==="):
                current = line.strip("= ").lower()
                sections[current] = []
            elif current:
                sections[current].append(line)

        # Parse CPU
        cpu_data = sections.get("cpu", [])
        cpu_usage = "N/A"
        for line in cpu_data:
            if "%Cpu" in line or "CPU:" in line:
                parts = line.split(",")
                for p in parts:
                    if "id" in p:
                        try:
                            idle = float(p.strip().split()[0])
                            cpu_usage = round(100 - idle, 1)
                        except:
                            pass

        # Parse Memory
        mem_data = sections.get("mem", [])
        mem_info = {}
        for line in mem_data:
            parts = line.split()
            if "Mem:" in line and len(parts) >= 3:
                mem_info = {
                    "total_mb": int(parts[1]),
                    "used_mb": int(parts[2]),
                    "free_mb": int(parts[3]) if len(parts) > 3 else 0,
                    "available_mb": int(parts[6]) if len(parts) > 6 else int(parts[3]) if len(parts) > 3 else 0,
                }
                if mem_info["total_mb"] > 0:
                    mem_info["percent"] = round(mem_info["used_mb"] / mem_info["total_mb"] * 100, 1)

        # Parse Disk
        disk_data = sections.get("disk", [])
        disk_info = {}
        if disk_data:
            parts = disk_data[0].split()
            if len(parts) >= 6:
                disk_info = {
                    "total": parts[1],
                    "used": parts[2],
                    "available": parts[3],
                    "percent": parts[4].replace("%", ""),
                }

        # Parse Load
        load_data = sections.get("load", [])
        load_avg = load_data[0].split()[:3] if load_data else ["0", "0", "0"]

        # Parse Processes
        proc_data = sections.get("procs", [])

        return {
            "cpu_percent": cpu_usage,
            "memory": mem_info,
            "disk": disk_info,
            "load_avg": load_avg,
            "network": sections.get("net", []),
            "top_processes": proc_data,
        }

    def get_containers(self, vps: VPSConfig) -> list:
        """Get list of Docker containers."""
        cmd = 'docker ps -a --format \'{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.Size}}\' 2>/dev/null'
        r = self.ssh_pool.execute(vps, cmd)
        if not r["success"]:
            return [{"error": r["stderr"]}]

        containers = []
        for line in r["stdout"].strip().split("\n"):
            if not line.strip():
                continue
            parts = line.split("|")
            if len(parts) >= 5:
                status = parts[3]
                containers.append({
                    "id": parts[0][:12],
                    "name": parts[1],
                    "image": parts[2],
                    "status": status,
                    "state": "running" if "Up" in status else "stopped",
                    "ports": parts[4],
                    "size": parts[5] if len(parts) > 5 else "N/A",
                })
        return containers

    def get_container_stats(self, vps: VPSConfig, container_id: str) -> Dict[str, Any]:
        """Get resource stats for a specific container."""
        cmd = f'docker stats --no-stream --format "{{{{.Container}}}}|{{{{.CPUPerc}}}}|{{{{.MemUsage}}}}|{{{{.MemPerc}}}}|{{{{.NetIO}}}}|{{{{.BlockIO}}}}|{{{{.PIDs}}}}" {container_id} 2>/dev/null'
        r = self.ssh_pool.execute(vps, cmd)
        if not r["success"]:
            return {"error": r["stderr"]}

        parts = r["stdout"].strip().split("|")
        if len(parts) >= 7:
            return {
                "container": parts[0],
                "cpu": parts[1],
                "mem_usage": parts[2],
                "mem_percent": parts[3],
                "net_io": parts[4],
                "block_io": parts[5],
                "pids": parts[6],
            }
        return {"error": "Failed to parse stats"}

    def get_container_logs(self, vps: VPSConfig, container_id: str, tail: int = 100) -> str:
        """Get container logs."""
        cmd = f"docker logs --tail {tail} {container_id} 2>&1"
        r = self.ssh_pool.execute(vps, cmd, timeout=15)
        return r["stdout"] if r["success"] else r["stderr"]

    def get_vps_logs(self, vps: VPSConfig, log_type: str = "syslog", tail: int = 100) -> str:
        """Get VPS system logs."""
        log_cmds = {
            "syslog": f"journalctl -n {tail} --no-pager 2>/dev/null || tail -n {tail} /var/log/syslog",
            "auth": f"journalctl -u sshd -n {tail} --no-pager 2>/dev/null || tail -n {tail} /var/log/auth.log",
            "kernel": f"journalctl -k -n {tail} --no-pager 2>/dev/null || dmesg | tail -n {tail}",
            "docker": f"journalctl -u docker -n {tail} --no-pager 2>/dev/null || tail -n {tail} /var/log/docker.log 2>/dev/null",
            "nginx": f"tail -n {tail} /var/log/nginx/error.log 2>/dev/null && echo '---ACCESS---' && tail -n {tail} /var/log/nginx/access.log 2>/dev/null || echo 'No nginx logs found'",
        }
        cmd = log_cmds.get(log_type, log_cmds["syslog"])
        r = self.ssh_pool.execute(vps, cmd, timeout=15)
        return r["stdout"] if r["success"] else r["stderr"]

    def test_connection(self, vps: VPSConfig) -> Dict[str, Any]:
        """Test SSH connection to a VPS."""
        try:
            # Use a simple TCP socket check first (fast, no SSH handshake)
            import socket as _socket
            sock = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
            sock.settimeout(5)
            result = sock.connect_ex((vps.host, vps.port))
            sock.close()
            if result != 0:
                return {"connected": False, "message": f"Port {vps.port} not reachable"}
            # Port is open, try SSH echo
            r = self.ssh_pool.execute(vps, "echo OK")
            if r["success"] and "OK" in r["stdout"]:
                return {"connected": True, "message": "Connection successful"}
            return {"connected": False, "message": r["stderr"][:200]}
        except Exception as e:
            return {"connected": False, "message": str(e)[:200]}
