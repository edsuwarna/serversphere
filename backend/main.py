"""
VPS Dashboard - FastAPI Backend
Multi-VPS management with SSH terminal, containers, monitoring, and RBAC.
"""
import os
import asyncio
import uuid
import json
import time
import secrets
import hashlib
import bcrypt
from typing import Optional, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, Depends, Response
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime

import httpx
from vps_manager import VPSManager, VPSConfig, SSHConnectionPool
from database import (
    init_db, get_db, SessionLocal,
    User as UserModel, VPS as VPSModel, UserVPSAccess, AuditLog as AuditLogModel,
    SSHKey as SSHKeyModel,
    VPGroup as VPGroupModel, UserGroupAccess as UserGroupAccessModel,
    GitHubToken as GitHubTokenModel, GitHubRepo as GitHubRepoModel,
    PersistentSession as PersistentSessionModel,
    seed_default_admin, get_user_vps_access, set_user_vps_access,
    hash_password as db_hash_password,
    get_user_group_ids, get_user_group_names, set_user_group_access, get_effective_vps_access,
)

# ─── Config ──────────────────────────────────────────────────
SESSION_SECRET = os.environ.get("SECRET_KEY", "change-me-to-random-secret")
DASHBOARD_USER = os.environ.get("DASHBOARD_USER", "changeme")
DASHBOARD_PASS = os.environ.get("DASHBOARD_PASS", "changeme")

app = FastAPI(title="VPS Dashboard", version="2.1.0")
app.add_middleware(CORSMiddleware, allow_origins=[], allow_methods=["*"], allow_headers=["*"], allow_credentials=True)
# SECURITY: Restrict allow_origins to your deployment domain in production, e.g.:
# allow_origins=["https://your-domain.com"],

manager = VPSManager()

# ─── Rate Limiting ──────────────────────────────────────────
_login_attempts = {}  # ip -> [timestamp, ...]

def check_rate_limit(ip: str, max_attempts: int = 5, window: int = 300) -> bool:
    """Check if IP is rate limited. Returns True if allowed."""
    now = time.time()
    if ip not in _login_attempts:
        _login_attempts[ip] = []
    # Clean old entries
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < window]
    if len(_login_attempts[ip]) >= max_attempts:
        return False
    _login_attempts[ip].append(now)
    return True

# ─── Persistent Session Management ──────────────────────────

def create_session(user_model, request: Request = None, remember: bool = False) -> str:
    """Create a persistent session stored in DB."""
    token = secrets.token_hex(32)
    duration = 86400 * 7 if remember else 86400  # 7 days or 1 day
    db = SessionLocal()
    try:
        sess = PersistentSessionModel(
            id=token,
            user_id=user_model.id,
            username=user_model.username,
            role=user_model.role,
            expires=time.time() + duration,
            created_at=time.time(),
            last_active=time.time(),
            ip_address=request.client.host if request and hasattr(request, 'client') and request.client else None,
            user_agent=request.headers.get("user-agent", "")[:512] if request else None,
        )
        db.add(sess)
        db.commit()
        return token
    except:
        db.rollback()
        return token  # fallback: return token even if DB fails
    finally:
        db.close()

def get_session(token: str) -> dict:
    """Get session from DB. Returns None if invalid/expired."""
    if not token:
        return None
    db = SessionLocal()
    try:
        sess = db.query(PersistentSessionModel).filter(PersistentSessionModel.id == token).first()
        if not sess:
            return None
        if sess.expires <= time.time():
            db.delete(sess)
            db.commit()
            return None
        # Update last_active
        sess.last_active = time.time()
        db.commit()
        return {
            "user": sess.username,
            "user_id": sess.user_id,
            "role": sess.role,
            "expires": sess.expires,
        }
    except:
        return None
    finally:
        db.close()

def delete_session(token: str):
    """Remove session from DB."""
    if not token:
        return
    db = SessionLocal()
    try:
        sess = db.query(PersistentSessionModel).filter(PersistentSessionModel.id == token).first()
        if sess:
            db.delete(sess)
            db.commit()
    except:
        db.rollback()
    finally:
        db.close()

def cleanup_expired_sessions():
    """Clean up expired sessions."""
    db = SessionLocal()
    try:
        db.query(PersistentSessionModel).filter(PersistentSessionModel.expires <= time.time()).delete()
        db.commit()
    except:
        db.rollback()
    finally:
        db.close()

# ─── Legacy in-memory session as fallback ───────────────────
_sessions = {}  # kept for backward compat with WS auth etc.

# Simple invite token store
_invites = {}


# ─── Audit Logging Helper ──────────────────────────────────

def audit_log(request, action, resource_type=None, resource_id=None, details=None):
    """Create an audit log entry. Checks both in-memory and DB persistent sessions."""
    db = SessionLocal()
    try:
        token = request.cookies.get("session") if hasattr(request, 'cookies') else None
        user_id = None
        username = "anonymous"
        if token:
            # Try legacy in-memory session first
            if token in _sessions:
                sess = _sessions[token]
                user_id = sess.get("user_id")
                user = db.query(UserModel).filter(UserModel.id == user_id).first()
                if user:
                    username = user.username
            else:
                # Try persistent DB session
                from database import PersistentSessionModel as PSM
                db_sess = db.query(PSM).filter(PSM.id == token).first()
                if db_sess and db_sess.expires > time.time():
                    user_id = db_sess.user_id
                    user = db.query(UserModel).filter(UserModel.id == user_id).first()
                    if user:
                        username = user.username

        log = AuditLogModel(
            id=str(uuid.uuid4())[:12],
            user_id=user_id,
            username=username,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=json.dumps(details) if details else None,
            ip_address=request.client.host if hasattr(request, 'client') and request.client else None,
        )
        db.add(log)
        db.commit()
    except:
        db.rollback()
    finally:
        db.close()


# ─── Bulk Operation Helpers ───────────────────────────────────

async def _run_on_vps(vps_id: str, command: str, timeout: int, user: dict) -> dict:
    """Run a command on a single VPS (for parallel bulk execution)."""
    import time as _time
    start = _time.time()
    try:
        vps_config = get_vps_and_check_access(vps_id, user)
        result = await manager.ssh_pool.execute_async(vps_config, command, timeout)
        elapsed_ms = int((_time.time() - start) * 1000)
        return {
            "vps_id": vps_id,
            "vps_name": vps_config.name,
            "success": result["success"],
            "output": result.get("stdout", ""),
            "error": result.get("stderr", ""),
            "exit_code": result.get("exit_code", -1),
            "exec_time_ms": elapsed_ms,
        }
    except HTTPException as e:
        return {"vps_id": vps_id, "success": False, "error": str(e.detail), "exec_time_ms": int((_time.time() - start) * 1000)}
    except Exception as e:
        return {"vps_id": vps_id, "success": False, "error": str(e)[:300], "exec_time_ms": int((_time.time() - start) * 1000)}


# ─── Startup ─────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    init_db()
    seed_default_admin(DASHBOARD_USER, DASHBOARD_PASS)
    cleanup_expired_sessions()


# ═══════════════════════════════════════════════════════════════
#  USER MANAGEMENT & RBAC
# ═══════════════════════════════════════════════════════════════

def hash_password(password: str) -> str:
    """Hash a password using bcrypt (with automatic salt)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its bcrypt hash.
    Falls back to SHA-256 for legacy hashes (migration path)."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, AttributeError):
        # Legacy SHA-256 fallback
        return hashlib.sha256(password.encode("utf-8")).hexdigest() == password_hash


# ─── User Dict Helper ────────────────────────────────────────

def _user_to_dict(user_model: UserModel, db: Session = None) -> dict:
    """Convert a UserModel to a dict with effective vps_access list."""
    direct_vps = []
    group_ids = []
    group_names = []
    effective_vps = []
    if db:
        direct_vps = get_user_vps_access(db, user_model.id)
        group_ids = get_user_group_ids(db, user_model.id)
        group_names = get_user_group_names(db, user_model.id)
        effective_vps = get_effective_vps_access(db, user_model.id)
    return {
        "id": user_model.id,
        "username": user_model.username,
        "password_hash": user_model.password_hash,
        "display_name": user_model.display_name,
        "role": user_model.role,
        "vps_access": effective_vps,         # EFFECTIVE (direct + groups)
        "direct_vps_access": direct_vps,     # direct VPS assignments only
        "group_access": group_ids,           # group IDs
        "group_names": group_names,          # group names for display
        "is_active": user_model.is_active,
        "created_at": user_model.created_at,
    }


# ─── RBAC Helpers ─────────────────────────────────────────────

# Permission levels: admin > operator > viewer
ROLE_LEVELS = {"admin": 3, "operator": 2, "viewer": 1}


def role_has_access(user_role: str, required_role: str) -> bool:
    """Check if user's role meets or exceeds the required role level."""
    return ROLE_LEVELS.get(user_role, 0) >= ROLE_LEVELS.get(required_role, 0)


def check_vps_access(user: dict, vps_id: str) -> bool:
    """Check if user has access to a specific VPS.
    Admin always has access. Empty vps_access list means NO access (must be explicitly granted)."""
    if user["role"] == "admin":
        return True
    access_list = user.get("vps_access", [])
    if not access_list:
        return False  # CHANGED: empty list = NO access, not all access
    return vps_id in access_list


# ─── Auth Middleware ──────────────────────────────────────────

def get_current_user(request: Request) -> dict:
    """Get current user from session. Raises 401 if not authenticated.
    Checks persistent DB sessions first, falls back to legacy in-memory."""
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Try persistent DB session first
    sess = get_session(token)
    if sess:
        db = SessionLocal()
        try:
            user_model = db.query(UserModel).filter(UserModel.id == sess["user_id"]).first()
            if not user_model or not user_model.is_active:
                delete_session(token)
                raise HTTPException(status_code=401, detail="User not found or inactive")
            # Sync into legacy store for WebSocket compatibility
            _sessions[token] = sess
            return _user_to_dict(user_model, db)
        finally:
            db.close()

    # Fallback: legacy in-memory session
    if token not in _sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    sess = _sessions[token]
    if sess["expires"] <= time.time():
        del _sessions[token]
        raise HTTPException(status_code=401, detail="Session expired")
    db = SessionLocal()
    try:
        user_model = db.query(UserModel).filter(UserModel.id == sess["user_id"]).first()
        if not user_model or not user_model.is_active:
            del _sessions[token]
            raise HTTPException(status_code=401, detail="User not found or inactive")
        return _user_to_dict(user_model, db)
    finally:
        db.close()


def require_role(*roles: str):
    """Dependency factory: require one of the specified roles."""
    def checker(request: Request):
        user = get_current_user(request)
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker


def check_auth(request: Request) -> bool:
    token = request.cookies.get("session")
    if not token:
        return False
    # Try persistent session first
    sess = get_session(token)
    if sess:
        db = SessionLocal()
        try:
            user_model = db.query(UserModel).filter(UserModel.id == sess.get("user_id", "")).first()
            if user_model and user_model.is_active:
                _sessions[token] = sess  # sync to legacy
                return True
        finally:
            db.close()
        return False
    # Legacy fallback
    if token in _sessions:
        sess = _sessions[token]
        if sess["expires"] > time.time():
            db = SessionLocal()
            try:
                user_model = db.query(UserModel).filter(UserModel.id == sess.get("user_id", "")).first()
                if user_model and user_model.is_active:
                    return True
            finally:
                db.close()
        if token in _sessions:
            del _sessions[token]
    return False


def require_auth(request: Request):
    if not check_auth(request):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return get_current_user(request)


def get_vps_and_check_access(vps_id: str, user: dict):
    """Get VPS config and verify user has access. Returns VPS or raises."""
    db = SessionLocal()
    try:
        vps_model = db.query(VPSModel).filter(VPSModel.id == vps_id).first()
        if not vps_model:
            raise HTTPException(status_code=404, detail="VPS not found")
        if not check_vps_access(user, vps_id):
            raise HTTPException(status_code=403, detail="Access denied to this VPS")
        # Convert to VPSConfig for SSH operations
        vps = VPSConfig(
            id=vps_model.id,
            name=vps_model.name,
            host=vps_model.host,
            port=vps_model.port,
            username=vps_model.username,
            password=vps_model.password,
            key_file=vps_model.key_file,
            tags=json.loads(vps_model.tags) if vps_model.tags else [],
            group=vps_model.group_name,
        )
        return vps
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════
#  AUTH ROUTES
# ═══════════════════════════════════════════════════════════════

class LoginForm(BaseModel):
    username: str
    password: str
    remember: bool = False


@app.post("/api/auth/login")
async def login(form: LoginForm, request: Request, response: JSONResponse):
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        audit_log(request, "login_rate_limited", resource_type="system", details={"ip": client_ip})
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again in 5 minutes.")

    db = SessionLocal()
    try:
        user_model = db.query(UserModel).filter(UserModel.username == form.username).first()
        if user_model and user_model.is_active and verify_password(form.password, user_model.password_hash):
            # Reset rate limit on successful login
            _login_attempts.pop(client_ip, None)

            # Create persistent session
            token = create_session(user_model, request, remember=form.remember)

            # Also keep in-memory for backward compat
            _sessions[token] = {
                "user": user_model.username,
                "user_id": user_model.id,
                "role": user_model.role,
                "expires": time.time() + (86400 * 7 if form.remember else 86400),
            }

            resp = JSONResponse({
                "success": True,
                "user": user_model.username,
                "role": user_model.role,
                "display_name": user_model.display_name,
            })
            max_age = 86400 * 7 if form.remember else 86400
            resp.set_cookie("session", token, httponly=True, max_age=max_age, samesite="lax")
            audit_log(request, "login", resource_type="system", details={"username": form.username})
            return resp
    finally:
        db.close()
    raise HTTPException(status_code=401, detail="Invalid credentials")


@app.post("/api/auth/logout")
async def logout(request: Request):
    token = request.cookies.get("session")
    if token:
        # Remove from DB
        delete_session(token)
        # Remove from legacy store
        if token in _sessions:
            del _sessions[token]
    audit_log(request, "logout", resource_type="system")
    response = JSONResponse({"success": True})
    response.delete_cookie("session")
    return response


@app.get("/api/auth/check")
async def auth_check(request: Request):
    if check_auth(request):
        token = request.cookies.get("session")
        sess = _sessions[token]
        db = SessionLocal()
        try:
            user_model = db.query(UserModel).filter(UserModel.id == sess["user_id"]).first()
            if user_model:
                return {
                    "authenticated": True,
                    "user": user_model.username,
                    "role": user_model.role,
                    "display_name": user_model.display_name,
                }
        finally:
            db.close()
    return {"authenticated": False}


@app.get("/api/auth/me")
async def auth_me(request: Request):
    """Return current user info with role, permissions, and effective VPS access."""
    user = get_current_user(request)
    permissions = {
        "can_manage_users": user["role"] == "admin",
        "can_manage_vps": user["role"] == "admin",
        "can_run_commands": user["role"] in ("admin", "operator"),
        "can_use_terminal": user["role"] in ("admin", "operator"),
        "can_manage_containers": user["role"] in ("admin", "operator"),
        "can_view_resources": True,
    }
    db = SessionLocal()
    try:
        # effective_vps is already computed in _user_to_dict
        vps_list = db.query(VPSModel).all()
        accessible_vps = [v.id for v in vps_list if check_vps_access(user, v.id)]
    finally:
        db.close()
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "role": user["role"],
        "vps_access": user["vps_access"],            # effective
        "direct_vps_access": user["direct_vps_access"],
        "group_access": user["group_access"],
        "group_names": user["group_names"],
        "is_active": user["is_active"],
        "created_at": user["created_at"],
        "permissions": permissions,
        "accessible_vps": accessible_vps,
    }


# ═══════════════════════════════════════════════════════════════
#  USER MANAGEMENT ROUTES (Admin Only)
# ═══════════════════════════════════════════════════════════════

class UserCreateForm(BaseModel):
    username: str
    password: str
    display_name: str = ""
    role: str = "viewer"
    vps_access: list = []
    is_active: bool = True


class UserUpdateForm(BaseModel):
    display_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    vps_access: Optional[list] = None
    is_active: Optional[bool] = None


class VPSUpdateForm(BaseModel):
    """Form for updating VPS — all fields optional for partial updates."""
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    key_file: Optional[str] = None
    tags: Optional[list] = None
    group: Optional[str] = None


class VPSAccessForm(BaseModel):
    vps_access: list


def _safe_user(user_model: UserModel, db: Session = None) -> dict:
    """Return user dict without sensitive fields, with effective access."""
    direct_vps = []
    group_ids = []
    group_names = []
    effective_vps = []
    if db:
        direct_vps = get_user_vps_access(db, user_model.id)
        group_ids = get_user_group_ids(db, user_model.id)
        group_names = get_user_group_names(db, user_model.id)
        effective_vps = get_effective_vps_access(db, user_model.id)
    return {
        "id": user_model.id,
        "username": user_model.username,
        "display_name": user_model.display_name,
        "role": user_model.role,
        "vps_access": effective_vps,
        "direct_vps_access": direct_vps,
        "group_access": group_ids,
        "group_names": group_names,
        "is_active": user_model.is_active,
        "created_at": user_model.created_at,
    }


@app.get("/api/users")
async def list_users(request: Request):
    """List all users. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        users = db.query(UserModel).all()
        return [_safe_user(u, db) for u in users]
    finally:
        db.close()


@app.post("/api/users")
async def create_user(form: UserCreateForm, request: Request):
    """Create a new user. Admin only."""
    user = require_role("admin")(request)
    if form.role not in ("admin", "operator", "viewer"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be admin, operator, or viewer")
    db = SessionLocal()
    try:
        # Check if username exists
        existing = db.query(UserModel).filter(UserModel.username == form.username).first()
        if existing:
            raise HTTPException(status_code=409, detail="Username already exists")
        new_user = UserModel(
            id=str(uuid.uuid4())[:8],
            username=form.username,
            password_hash=hash_password(form.password),
            display_name=form.display_name or form.username,
            role=form.role,
            is_active=form.is_active,
            created_at=time.time(),
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        # Set VPS access
        if form.vps_access:
            set_user_vps_access(db, new_user.id, form.vps_access)
        audit_log(request, "user_create", resource_type="user", resource_id=new_user.id, details={"username": form.username, "role": form.role})
        return {"success": True, "user": _safe_user(new_user, db)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.put("/api/users/{user_id}")
async def update_user(user_id: str, form: UserUpdateForm, request: Request):
    """Update a user. Admin only."""
    current_user = require_role("admin")(request)
    db = SessionLocal()
    try:
        target = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        # Prevent the last admin from being demoted or deactivated
        if form.display_name is not None:
            target.display_name = form.display_name
        if form.password is not None and form.password:
            target.password_hash = hash_password(form.password)
        if form.role is not None:
            if form.role not in ("admin", "operator", "viewer"):
                raise HTTPException(status_code=400, detail="Invalid role")
            # Check if demoting the last admin
            if target.role == "admin" and form.role != "admin":
                admins = db.query(UserModel).filter(UserModel.role == "admin", UserModel.is_active == True).all()
                if len(admins) <= 1:
                    raise HTTPException(status_code=400, detail="Cannot demote the last active admin")
            target.role = form.role
        if form.is_active is not None:
            if target.role == "admin" and not form.is_active:
                admins = db.query(UserModel).filter(UserModel.role == "admin", UserModel.is_active == True).all()
                if len(admins) <= 1:
                    raise HTTPException(status_code=400, detail="Cannot deactivate the last active admin")
            target.is_active = form.is_active
        if form.vps_access is not None:
            set_user_vps_access(db, target.id, form.vps_access)
        db.commit()
        db.refresh(target)
        audit_log(request, "user_update", resource_type="user", resource_id=target.id, details={"username": target.username, "role": target.role})
        return {"success": True, "user": _safe_user(target, db)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, request: Request):
    """Delete a user. Admin only."""
    current_user = require_role("admin")(request)
    db = SessionLocal()
    try:
        target = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        # Prevent deleting the last admin
        if target.role == "admin":
            admins = db.query(UserModel).filter(UserModel.role == "admin", UserModel.is_active == True).all()
            if len(admins) <= 1:
                raise HTTPException(status_code=400, detail="Cannot delete the last active admin")
        # Invalidate any active sessions for the deleted user
        tokens_to_remove = [t for t, s in _sessions.items() if s.get("user_id") == user_id]
        for t in tokens_to_remove:
            del _sessions[t]
        # Delete user (cascade will remove UserVPSAccess entries)
        deleted_username = target.username
        db.delete(target)
        db.commit()
        audit_log(request, "user_delete", resource_type="user", resource_id=user_id, details={"username": deleted_username})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.put("/api/users/{user_id}/access")
async def set_user_access(user_id: str, form: VPSAccessForm, request: Request):
    """Set VPS access list for a user. Admin only."""
    current_user = require_role("admin")(request)
    db = SessionLocal()
    try:
        target = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        set_user_vps_access(db, user_id, form.vps_access)
        db.refresh(target)
        return {"success": True, "user": _safe_user(target, db)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/users/invite")
async def invite_user(request: Request):
    """Generate an invite token for a new user. Admin only."""
    user = require_role("admin")(request)
    body = await request.json()
    token = str(uuid.uuid4())[:16]
    _invites[token] = {
        "role": body.get("role", "viewer"),
        "created_by": user["id"],
        "expires": time.time() + 86400 * 7,  # 7 days
    }
    return {"token": token, "url": f"/invite/{token}"}


# ═══════════════════════════════════════════════════════════════
#  VPS TEST CONNECTION (Admin Only)
# ═══════════════════════════════════════════════════════════════

@app.post("/api/vps/test-connection")
async def test_vps_connection(request: Request):
    """Test SSH connection before adding VPS. Admin only."""
    user = require_role("admin")(request)
    body = await request.json()
    vps = VPSConfig(
        id="test",
        name="test",
        host=body["host"],
        port=body.get("port", 22),
        username=body.get("username", "root"),
        password=body.get("password"),
        key_file=body.get("key_file"),
    )
    return manager.test_connection(vps)


# ═══════════════════════════════════════════════════════════════
#  VPS CRUD (with RBAC)
# ═══════════════════════════════════════════════════════════════

class VPSCreateForm(BaseModel):
    name: str
    host: str
    port: int = 22
    username: str = "root"
    password: Optional[str] = None
    key_file: Optional[str] = None
    tags: list = []
    group: str = "default"


def _vps_model_to_dict(vps_model: VPSModel) -> dict:
    """Convert VPS model to API response dict."""
    return {
        "id": vps_model.id,
        "name": vps_model.name,
        "host": vps_model.host,
        "port": vps_model.port,
        "username": vps_model.username,
        "tags": json.loads(vps_model.tags) if vps_model.tags else [],
        "group": vps_model.group_name,
        "has_password": bool(vps_model.password),
        "has_key": bool(vps_model.key_file),
    }


def _vps_model_to_config(vps_model: VPSModel) -> VPSConfig:
    """Convert VPS model to VPSConfig for SSH operations."""
    return VPSConfig(
        id=vps_model.id,
        name=vps_model.name,
        host=vps_model.host,
        port=vps_model.port,
        username=vps_model.username,
        password=vps_model.password,
        key_file=vps_model.key_file,
        tags=json.loads(vps_model.tags) if vps_model.tags else [],
        group=vps_model.group_name,
    )


@app.get("/api/vps")
async def list_vps(request: Request):
    """List VPS. operator+viewer can list, filtered by access.
    Online status is checked via separate /api/vps/{id}/test endpoint."""
    user = require_auth(request)
    db = SessionLocal()
    try:
        vps_list = db.query(VPSModel).all()
        result = []
        for v in vps_list:
            # Filter by VPS access
            if not check_vps_access(user, v.id):
                continue
            info = _vps_model_to_dict(v)
            info["online"] = None  # Status checked separately
            result.append(info)
        return result
    finally:
        db.close()


@app.post("/api/vps")
async def add_vps(form: VPSCreateForm, request: Request):
    """Add VPS. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        vps_id = str(uuid.uuid4())[:8]
        vps_model = VPSModel(
            id=vps_id,
            name=form.name,
            host=form.host,
            port=form.port,
            username=form.username,
            password=form.password,
            key_file=form.key_file,
            tags=json.dumps(form.tags),
            group_name=form.group,
        )
        db.add(vps_model)
        db.commit()
        audit_log(request, "vps_create", resource_type="vps", resource_id=vps_id, details={"name": form.name, "host": form.host})
        return {"success": True, "id": vps_id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


@app.put("/api/vps/{vps_id}")
async def update_vps(vps_id: str, form: VPSUpdateForm, request: Request):
    """Update VPS with partial update support. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        existing = db.query(VPSModel).filter(VPSModel.id == vps_id).first()
        if not existing:
            raise HTTPException(status_code=404, detail="VPS not found")
        updated_fields = {}
        if form.name is not None:
            existing.name = form.name
            updated_fields["name"] = form.name
        if form.host is not None:
            existing.host = form.host
            updated_fields["host"] = form.host
        if form.port is not None:
            existing.port = form.port
            updated_fields["port"] = form.port
        if form.username is not None:
            existing.username = form.username
            updated_fields["username"] = form.username
        if form.password is not None:
            existing.password = form.password
        if form.key_file is not None:
            existing.key_file = form.key_file
        if form.tags is not None:
            existing.tags = json.dumps(form.tags)
            updated_fields["tags"] = form.tags
        if form.group is not None:
            existing.group_name = form.group
            updated_fields["group"] = form.group
        db.commit()
        # Close SSH pool connection for this VPS if any field changed
        if updated_fields:
            manager.ssh_pool.close(vps_id)
        audit_log(request, "vps_update", resource_type="vps", resource_id=vps_id, details=updated_fields if updated_fields else {"info": "no fields changed"})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


@app.delete("/api/vps/{vps_id}")
async def delete_vps(vps_id: str, request: Request):
    """Delete VPS. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        vps_model = db.query(VPSModel).filter(VPSModel.id == vps_id).first()
        if not vps_model:
            raise HTTPException(status_code=404, detail="VPS not found")
        deleted_name = vps_model.name
        db.delete(vps_model)
        db.commit()
        manager.ssh_pool.close(vps_id)
        audit_log(request, "vps_delete", resource_type="vps", resource_id=vps_id, details={"name": deleted_name})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════
#  VPS Details & Resources (operator+viewer with access)
# ═══════════════════════════════════════════════════════════════

@app.get("/api/vps/{vps_id}/info")
async def vps_info(vps_id: str, request: Request):
    """Get VPS system info. operator+viewer with access."""
    user = require_auth(request)
    vps = get_vps_and_check_access(vps_id, user)
    info = manager.get_system_info(vps)
    return info


@app.get("/api/vps/{vps_id}/resources")
async def vps_resources(vps_id: str, request: Request):
    """Get VPS resource usage. operator+viewer with access."""
    user = require_auth(request)
    vps = get_vps_and_check_access(vps_id, user)
    resources = manager.get_resource_usage(vps)
    return resources


@app.get("/api/vps/{vps_id}/test")
async def vps_test(vps_id: str, request: Request):
    """Test VPS connection. operator+viewer with access."""
    user = require_auth(request)
    vps = get_vps_and_check_access(vps_id, user)
    return manager.test_connection(vps)


@app.post("/api/vps/status")
async def vps_batch_status(request: Request):
    """Check online status for multiple VPS at once. Body: {"ids": ["id1", "id2"]}"""
    import asyncio
    user = require_auth(request)
    body = await request.json()
    vps_ids = body.get("ids", [])
    results = {}
    for vid in vps_ids:
        if not check_vps_access(user, vid):
            continue
        vps = manager.get_vps(vid)
        if vps:
            # Run in thread to not block
            loop = asyncio.get_event_loop()
            status = await loop.run_in_executor(None, manager.test_connection, vps)
            results[vid] = status.get("connected", False)
    return results


# ─── Bulk Operations: Run commands on multiple VPS ────────────

@app.post("/api/vps/bulk/command")
async def bulk_command(request: Request):
    """Run command on multiple VPS in parallel. operator+admin only.
    Body: {"vps_ids": ["id1","id2"], "command": "uptime", "timeout": 30}
    Returns per-VPS results with exec_time_ms."""
    user = get_current_user(request)
    if user["role"] not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Bulk commands require operator+ role")

    body = await request.json()
    vps_ids = body.get("vps_ids", [])
    command = body.get("command", "")
    timeout = min(body.get("timeout", 30), 120)

    if not vps_ids:
        raise HTTPException(status_code=400, detail="No VPS IDs provided")
    if not command.strip():
        raise HTTPException(status_code=400, detail="Command is required")

    results = await asyncio.gather(*[_run_on_vps(vid, command, timeout, user) for vid in vps_ids])

    audit_log(request, "bulk_command", resource_type="vps",
              resource_id=",".join(vps_ids[:5]),
              details={"count": len(vps_ids), "cmd": command[:100]})

    success_count = sum(1 for r in results if r["success"])
    total_time = sum(r.get("exec_time_ms", 0) for r in results)

    return {
        "results": results,
        "summary": {
            "total": len(results),
            "success": success_count,
            "failed": len(results) - success_count,
            "total_time_ms": total_time,
        }
    }


# ═══════════════════════════════════════════════════════════════
#  Containers (view: operator+viewer, actions: operator+ only)
# ═══════════════════════════════════════════════════════════════

@app.get("/api/vps/{vps_id}/containers")
async def list_containers(vps_id: str, request: Request):
    """List containers. operator+viewer with access."""
    user = require_auth(request)
    vps = get_vps_and_check_access(vps_id, user)
    return manager.get_containers(vps)


@app.get("/api/vps/{vps_id}/containers/{container_id}/stats")
async def container_stats(vps_id: str, container_id: str, request: Request):
    """Get container stats. operator+viewer with access."""
    user = require_auth(request)
    vps = get_vps_and_check_access(vps_id, user)
    return manager.get_container_stats(vps, container_id)


@app.get("/api/vps/{vps_id}/containers/{container_id}/logs")
async def container_logs(vps_id: str, container_id: str, tail: int = 100, request: Request = None):
    """Get container logs. operator+viewer with access."""
    user = require_auth(request)
    vps = get_vps_and_check_access(vps_id, user)
    logs = manager.get_container_logs(vps, container_id, tail)
    return PlainTextResponse(logs)


class ContainerAction(BaseModel):
    action: str  # start, stop, restart, remove


@app.post("/api/vps/{vps_id}/containers/{container_id}/action")
async def container_action(vps_id: str, container_id: str, body: ContainerAction, request: Request):
    """Container actions (start/stop/restart/remove). operator+ only, not viewer."""
    user = get_current_user(request)
    if not role_has_access(user["role"], "operator"):
        raise HTTPException(status_code=403, detail="Insufficient permissions. Operator role required.")
    vps = get_vps_and_check_access(vps_id, user)
    actions = {
        "start": f"docker start {container_id}",
        "stop": f"docker stop {container_id}",
        "restart": f"docker restart {container_id}",
        "remove": f"docker rm -f {container_id}",
    }
    cmd = actions.get(body.action)
    if not cmd:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")
    r = manager.ssh_pool.execute(vps, cmd, timeout=30)
    if r["success"]:
        audit_log(request, f"container_{body.action}", resource_type="container", resource_id=container_id, details={"vps_id": vps_id})
        return {"success": True, "output": r["stdout"]}
    return {"success": False, "error": r["stderr"]}


# ═══════════════════════════════════════════════════════════════
#  VPS Logs (operator+viewer with access)
# ═══════════════════════════════════════════════════════════════

@app.get("/api/vps/{vps_id}/logs")
async def vps_logs(vps_id: str, log_type: str = "syslog", tail: int = 100, request: Request = None):
    """Get VPS logs. operator+viewer with access."""
    user = require_auth(request)
    vps = get_vps_and_check_access(vps_id, user)
    logs = manager.get_vps_logs(vps, log_type, tail)
    return PlainTextResponse(logs)


# ═══════════════════════════════════════════════════════════════
#  Quick Command (operator+ only, not viewer)
# ═══════════════════════════════════════════════════════════════

class QuickCommand(BaseModel):
    command: str


@app.post("/api/vps/{vps_id}/exec")
async def exec_command(vps_id: str, body: QuickCommand, request: Request):
    """Execute command on VPS. operator+ only, not viewer."""
    user = get_current_user(request)
    if not role_has_access(user["role"], "operator"):
        raise HTTPException(status_code=403, detail="Insufficient permissions. Operator role required.")
    vps = get_vps_and_check_access(vps_id, user)
    r = manager.ssh_pool.execute(vps, body.command, timeout=30)
    audit_log(request, "exec_command", resource_type="vps", resource_id=vps_id, details={"command": body.command})
    return r


# ═══════════════════════════════════════════════════════════════
#  WebSocket Terminal (operator+ only, not viewer)
# ═══════════════════════════════════════════════════════════════

@app.websocket("/ws/terminal/{vps_id}")
async def websocket_terminal(websocket: WebSocket, vps_id: str):
    """SSH terminal WebSocket. operator+ only (not viewer)."""
    await websocket.accept()

    # Authenticate via cookie header
    # WebSocket doesn't support Depends, so we extract session manually
    cookie_header = websocket.headers.get("cookie", "")
    token = None
    for part in cookie_header.split(";"):
        part = part.strip()
        if part.startswith("session="):
            token = part[len("session="):]
            break

    if not token or token not in _sessions:
        await websocket.send_json({"error": "Not authenticated"})
        await websocket.close()
        return

    sess = _sessions[token]
    if sess["expires"] <= time.time():
        del _sessions[token]
        await websocket.send_json({"error": "Session expired"})
        await websocket.close()
        return

    db = SessionLocal()
    try:
        user_model = db.query(UserModel).filter(UserModel.id == sess["user_id"]).first()
        if not user_model or not user_model.is_active:
            await websocket.send_json({"error": "User not found or inactive"})
            await websocket.close()
            return

        # Build user dict with vps_access
        user = _user_to_dict(user_model, db)

        # Check role: operator+ only
        if not role_has_access(user["role"], "operator"):
            await websocket.send_json({"error": "Insufficient permissions. Operator role required."})
            await websocket.close()
            return

        # Check VPS access
        if not check_vps_access(user, vps_id):
            await websocket.send_json({"error": "Access denied to this VPS"})
            await websocket.close()
            return

        vps_model = db.query(VPSModel).filter(VPSModel.id == vps_id).first()
        if not vps_model:
            await websocket.send_json({"error": "VPS not found"})
            await websocket.close()
            return

        vps = _vps_model_to_config(vps_model)
    finally:
        db.close()

    # Create a mock request object for audit logging
    class _WSRequest:
        def __init__(self, ws, token_str, user_obj):
            self.cookies = {"session": token_str}
            self.client = type('obj', (object,), {'host': None})()
    ws_req = _WSRequest(websocket, token, user)

    channel = None
    try:
        channel = manager.ssh_pool.create_channel(vps)
        audit_log(ws_req, "terminal_connect", resource_type="vps", resource_id=vps_id, details={"host": vps.host})
        await websocket.send_json({"type": "connected", "message": f"Connected to {vps.name} ({vps.host})"})

        async def send_output():
            """Read from SSH channel and send to WebSocket."""
            while True:
                if channel.recv_ready():
                    data = channel.recv(4096)
                    if data:
                        await websocket.send_bytes(data)
                elif channel.exit_status_ready():
                    break
                await asyncio.sleep(0.01)

        async def recv_input():
            """Read from WebSocket and send to SSH channel."""
            while True:
                try:
                    data = await websocket.receive_text()
                    msg = json.loads(data)
                    if msg.get("type") == "input":
                        channel.send(msg["data"])
                    elif msg.get("type") == "resize":
                        channel.resize_pty(msg.get("cols", 80), msg.get("rows", 24))
                except WebSocketDisconnect:
                    break
                except Exception:
                    break

        await asyncio.gather(send_output(), recv_input())
    except Exception as e:
        try:
            await websocket.send_json({"error": str(e)})
        except:
            pass
    finally:
        if channel:
            try:
                channel.close()
            except:
                pass


# ═══════════════════════════════════════════════════════════════
#  AUDIT LOGS (Admin Only)
# ═══════════════════════════════════════════════════════════════

@app.get("/api/audit-logs")
async def get_audit_logs(request: Request, limit: int = 100, offset: int = 0, action: str = None, user: str = None):
    """Get audit logs. Admin only."""
    require_role("admin")(request)
    db = SessionLocal()
    try:
        query = db.query(AuditLogModel).order_by(AuditLogModel.timestamp.desc())
        if action:
            query = query.filter(AuditLogModel.action == action)
        if user:
            query = query.filter(AuditLogModel.username.contains(user))
        total = query.count()
        logs = query.offset(offset).limit(limit).all()
        result = []
        for log in logs:
            result.append({
                "id": log.id,
                "username": log.username,
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "details": json.loads(log.details) if log.details else None,
                "ip_address": log.ip_address,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
            })
        return {"total": total, "logs": result}
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════
#  SSH KEY MANAGEMENT (Admin Only)
# ═══════════════════════════════════════════════════════════════

@app.get("/api/ssh-keys")
async def list_ssh_keys(request: Request):
    """List all SSH keys. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        keys = db.query(SSHKeyModel).order_by(SSHKeyModel.created_at.desc()).all()
        return [{
            "id": k.id,
            "name": k.name,
            "key_file": k.key_file,
            "key_type": k.key_type or "file",
            "has_private_key": bool(k.private_key),
            "public_key": k.public_key[:80] + "..." if k.public_key and len(k.public_key) > 80 else k.public_key,
            "fingerprint": k.fingerprint,
            "created_by": k.created_by,
            "created_at": k.created_at,
        } for k in keys]
    finally:
        db.close()


@app.post("/api/ssh-keys")
async def add_ssh_key(request: Request):
    """Add a new SSH key. Admin only. Supports file path, pasted content, or both."""
    user = require_role("admin")(request)
    body = await request.json()
    name = body.get("name", "").strip()
    key_type = body.get("key_type", "file")  # 'file', 'pasted', or 'both'
    key_file = (body.get("key_file") or "").strip() or None
    private_key = (body.get("private_key") or "").strip() or None
    public_key = (body.get("public_key") or "").strip() or None

    if not name:
        raise HTTPException(status_code=400, detail="Key name is required")

    # Validate: at least a private key file path or pasted private key content must be provided
    if key_type == "file" and not key_file:
        raise HTTPException(status_code=400, detail="Private key file path is required for file mode")
    if key_type == "pasted" and not private_key:
        raise HTTPException(status_code=400, detail="Private key content is required for paste mode")
    if key_type == "both" and not key_file and not private_key:
        raise HTTPException(status_code=400, detail="At least a key file path or pasted key content is required")
    # For 'public_only' type, only public key is required
    if key_type == "public_only" and not public_key:
        raise HTTPException(status_code=400, detail="Public key content is required")

    # Auto-detect: if pasted private key, write to temp file for SSH use
    effective_key_file = key_file
    if private_key and not key_file:
        import tempfile, os
        key_dir = "/tmp/serversphere-keys"
        os.makedirs(key_dir, exist_ok=True)
        safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
        tmp_path = os.path.join(key_dir, f"{safe_name}_id_rsa")
        with open(tmp_path, "w") as f:
            f.write(private_key)
        os.chmod(tmp_path, 0o600)
        effective_key_file = tmp_path

    db = SessionLocal()
    try:
        # Check for duplicate name
        existing = db.query(SSHKeyModel).filter(SSHKeyModel.name == name).first()
        if existing:
            raise HTTPException(status_code=409, detail="SSH key with this name already exists")

        key_id = str(uuid.uuid4())[:8]
        key_entry = SSHKeyModel(
            id=key_id,
            name=name,
            key_file=effective_key_file,
            private_key=private_key,
            public_key=public_key,
            fingerprint=body.get("fingerprint"),
            key_type=key_type,
            created_by=user["id"],
            created_at=time.time(),
        )
        db.add(key_entry)
        db.commit()
        audit_log(request, "sshkey_create", resource_type="ssh_key", resource_id=key_id, details={"name": name, "key_type": key_type})
        return {"success": True, "id": key_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.delete("/api/ssh-keys/{key_id}")
async def delete_ssh_key(key_id: str, request: Request):
    """Delete an SSH key. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        key_entry = db.query(SSHKeyModel).filter(SSHKeyModel.id == key_id).first()
        if not key_entry:
            raise HTTPException(status_code=404, detail="SSH key not found")
        deleted_name = key_entry.name
        db.delete(key_entry)
        db.commit()
        audit_log(request, "sshkey_delete", resource_type="ssh_key", resource_id=key_id, details={"name": deleted_name})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/ssh-keys/{key_id}/fingerprint")
async def get_ssh_key_fingerprint(key_id: str, request: Request):
    """Get the fingerprint of an SSH key by running ssh-keygen. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        key_entry = db.query(SSHKeyModel).filter(SSHKeyModel.id == key_id).first()
        if not key_entry:
            raise HTTPException(status_code=404, detail="SSH key not found")
        # Run ssh-keygen to get fingerprint
        import subprocess
        key_path = os.path.expanduser(key_entry.key_file)
        if not os.path.exists(key_path):
            return {"fingerprint": None, "error": "Key file not found on disk"}
        result = subprocess.run(
            ["ssh-keygen", "-lf", key_path],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            fp = result.stdout.strip()
            key_entry.fingerprint = fp
            db.commit()
            return {"fingerprint": fp}
        return {"fingerprint": None, "error": result.stderr.strip()}
    except HTTPException:
        raise
    except Exception as e:
        return {"fingerprint": None, "error": str(e)}
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════
#  GROUPS MANAGEMENT (Admin Only)
# ═══════════════════════════════════════════════════════════════

@app.get("/api/groups")
async def list_groups(request: Request):
    """List all groups with VPS count and member count. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        groups = db.query(VPGroupModel).order_by(VPGroupModel.created_at.desc()).all()
        result = []
        for g in groups:
            # Count VPS in this group
            vps_count = db.query(VPSModel).filter(VPSModel.group_name == g.name).count()
            # Count members
            member_count = db.query(UserGroupAccessModel).filter(UserGroupAccessModel.group_id == g.id).count()
            # Get member details
            member_entries = db.query(UserGroupAccessModel).filter(UserGroupAccessModel.group_id == g.id).all()
            member_ids = [m.user_id for m in member_entries]
            members = []
            for uid in member_ids:
                u = db.query(UserModel).filter(UserModel.id == uid).first()
                if u:
                    members.append({"id": u.id, "username": u.username, "display_name": u.display_name, "role": u.role})
            # Get VPS in this group
            group_vps = db.query(VPSModel).filter(VPSModel.group_name == g.name).all()
            vps_list = [{"id": v.id, "name": v.name, "host": v.host} for v in group_vps]
            result.append({
                "id": g.id,
                "name": g.name,
                "description": g.description,
                "created_at": g.created_at,
                "created_by": g.created_by,
                "vps_count": vps_count,
                "member_count": member_count,
                "members": members,
                "vps_list": vps_list,
            })
        return result
    finally:
        db.close()


@app.post("/api/groups")
async def create_group(request: Request):
    """Create a new group. Admin only."""
    user = require_role("admin")(request)
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required")
    db = SessionLocal()
    try:
        existing = db.query(VPGroupModel).filter(VPGroupModel.name == name).first()
        if existing:
            raise HTTPException(status_code=409, detail="Group with this name already exists")
        group_id = str(uuid.uuid4())[:8]
        group = VPGroupModel(
            id=group_id,
            name=name,
            description=body.get("description", ""),
            created_at=time.time(),
            created_by=user["id"],
        )
        db.add(group)
        db.commit()
        audit_log(request, "group_create", resource_type="group", resource_id=group_id, details={"name": name})
        return {"success": True, "id": group_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.put("/api/groups/{group_id}")
async def update_group(group_id: str, request: Request):
    """Update a group name/description. Admin only."""
    user = require_role("admin")(request)
    body = await request.json()
    db = SessionLocal()
    try:
        group = db.query(VPGroupModel).filter(VPGroupModel.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        old_name = group.name
        new_name = body.get("name", "").strip()
        if new_name and new_name != old_name:
            # Check for duplicate name
            existing = db.query(VPGroupModel).filter(VPGroupModel.name == new_name, VPGroupModel.id != group_id).first()
            if existing:
                raise HTTPException(status_code=409, detail="Group name already exists")
            # Update all VPS with old group name
            db.query(VPSModel).filter(VPSModel.group_name == old_name).update({"group_name": new_name})
            group.name = new_name
        if "description" in body:
            group.description = body["description"]
        db.commit()
        audit_log(request, "group_update", resource_type="group", resource_id=group_id, details={"old_name": old_name, "new_name": new_name or old_name})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.delete("/api/groups/{group_id}")
async def delete_group(group_id: str, request: Request):
    """Delete a group. Does NOT delete VPS, only removes the grouping. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        group = db.query(VPGroupModel).filter(VPGroupModel.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        deleted_name = group.name
        db.delete(group)  # cascade removes UserGroupAccess entries
        db.commit()
        audit_log(request, "group_delete", resource_type="group", resource_id=group_id, details={"name": deleted_name})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.get("/api/groups/{group_id}")
async def get_group(group_id: str, request: Request):
    """Get group details with members and VPS. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        group = db.query(VPGroupModel).filter(VPGroupModel.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        # Members
        member_entries = db.query(UserGroupAccessModel).filter(UserGroupAccessModel.group_id == group.id).all()
        members = []
        for m in member_entries:
            u = db.query(UserModel).filter(UserModel.id == m.user_id).first()
            if u:
                members.append({"id": u.id, "username": u.username, "display_name": u.display_name, "role": u.role})
        # VPS
        group_vps = db.query(VPSModel).filter(VPSModel.group_name == group.name).all()
        vps_list = [{"id": v.id, "name": v.name, "host": v.host} for v in group_vps]
        return {
            "id": group.id,
            "name": group.name,
            "description": group.description,
            "created_at": group.created_at,
            "members": members,
            "vps_list": vps_list,
            "vps_count": len(vps_list),
            "member_count": len(members),
        }
    finally:
        db.close()


@app.put("/api/users/{user_id}/group-access")
async def set_user_groups(user_id: str, request: Request):
    """Set group memberships for a user. Admin only. Body: {"group_ids": ["id1", "id2"]}"""
    current_user = require_role("admin")(request)
    body = await request.json()
    group_ids = body.get("group_ids", [])
    db = SessionLocal()
    try:
        target = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        set_user_group_access(db, target.id, group_ids)
        audit_log(request, "user_group_update", resource_type="user", resource_id=target.id, details={"username": target.username, "groups": group_ids})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()




# ─── Token Management (Admin Only) ────────────────────────────

@app.get("/api/github/tokens")
async def list_github_tokens(request: Request):
    """List all GitHub tokens (masked). Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        tokens = db.query(GitHubTokenModel).all()
        return [
            {
                "id": t.id,
                "name": t.name,
                "token_masked": "••••" + t.token[-4:] if len(t.token) >= 4 else "••••",
                "github_user": t.github_user,
                "created_at": t.created_at,
            }
            for t in tokens
        ]
    finally:
        db.close()


@app.post("/api/github/tokens")
async def add_github_token(request: Request):
    """Add a new GitHub PAT. Admin only. Body: { name, token, github_user? }"""
    user = require_role("admin")(request)
    body = await request.json()
    name = body.get("name", "").strip()
    token = body.get("token", "").strip()
    github_user = body.get("github_user", "").strip()
    if not name or not token:
        raise HTTPException(status_code=400, detail="Name and token are required")
    db = SessionLocal()
    try:
        new_token = GitHubTokenModel(
            id=str(uuid.uuid4())[:8],
            name=name,
            token=token,
            github_user=github_user or None,
            created_by=user["id"],
            created_at=time.time(),
        )
        db.add(new_token)
        db.commit()
        db.refresh(new_token)
        audit_log(request, "github_token_create", resource_type="github_token", resource_id=new_token.id, details={"name": name})
        return {"success": True, "id": new_token.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.delete("/api/github/tokens/{token_id}")
async def delete_github_token(token_id: str, request: Request):
    """Delete a GitHub token and all repos using it. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        token_obj = db.query(GitHubTokenModel).filter(GitHubTokenModel.id == token_id).first()
        if not token_obj:
            raise HTTPException(status_code=404, detail="Token not found")
        # Delete repos using this token (cascade should handle it, but explicit)
        db.query(GitHubRepoModel).filter(GitHubRepoModel.token_id == token_id).delete()
        db.delete(token_obj)
        db.commit()
        audit_log(request, "github_token_delete", resource_type="github_token", resource_id=token_id, details={"name": token_obj.name})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/github/tokens/{token_id}/test")
async def test_github_token(token_id: str, request: Request):
    """Test a GitHub token by calling /user endpoint. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        token_obj = db.query(GitHubTokenModel).filter(GitHubTokenModel.id == token_id).first()
        if not token_obj:
            raise HTTPException(status_code=404, detail="Token not found")
    finally:
        db.close()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"token {token_obj.token}",
                    "Accept": "application/vnd.github+json",
                },
            )
        if resp.status_code == 200:
            data = resp.json()
            return {
                "valid": True,
                "username": data.get("login", ""),
                "name": data.get("name", ""),
                "scopes": resp.headers.get("X-OAuth-Scopes", ""),
            }
        else:
            return {"valid": False, "status": resp.status_code, "detail": resp.text[:200]}
    except httpx.TimeoutException:
        return {"valid": False, "detail": "Request timed out"}
    except Exception as e:
        return {"valid": False, "detail": str(e)}


# ─── Repository Management (Admin Only) ───────────────────────

@app.get("/api/github/repos")
async def list_github_repos(request: Request):
    """List all tracked repos with token info. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        repos = db.query(GitHubRepoModel).all()
        result = []
        for r in repos:
            token_obj = db.query(GitHubTokenModel).filter(GitHubTokenModel.id == r.token_id).first() if r.token_id else None
            result.append({
                "id": r.id,
                "full_name": r.full_name,
                "token_id": r.token_id,
                "token_name": token_obj.name if token_obj else ("Public" if not r.token_id else "Unknown"),
                "is_public": r.token_id is None,
                "branch": r.branch,
                "added_at": r.added_at,
            })
        return result
    finally:
        db.close()


@app.post("/api/github/repos")
async def add_github_repo(request: Request):
    """Add a repo to track. Admin only. Body: { full_name, token_id?, branch?, is_public? }"""
    user = require_role("admin")(request)
    body = await request.json()
    full_name = body.get("full_name", "").strip()
    token_id = body.get("token_id", "").strip() or None
    branch = body.get("branch", "").strip() or None
    is_public = body.get("is_public", False)

    if not full_name:
        raise HTTPException(status_code=400, detail="full_name is required")
    if not is_public and not token_id:
        raise HTTPException(status_code=400, detail="token_id is required for private repos")

    # Validate repo format (owner/repo)
    if "/" not in full_name or full_name.count("/") != 1:
        raise HTTPException(status_code=400, detail="Repository must be in owner/repo format")

    # For public repos, verify the repo exists and is public
    if is_public:
        fallback = _get_any_token()
        headers = _build_gh_headers(fallback)
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{full_name}",
                headers=headers,
            )
            if resp.status_code == 404:
                raise HTTPException(status_code=404, detail="Repository not found or is private")
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="GitHub API error")
            repo_data = resp.json()
            if repo_data.get("private"):
                raise HTTPException(status_code=400, detail="Repository is private — please use a token instead")
            # Use default branch if none specified
            if not branch:
                branch = repo_data.get("default_branch")

    if token_id:
        db_check = SessionLocal()
        try:
            token_obj = db_check.query(GitHubTokenModel).filter(GitHubTokenModel.id == token_id).first()
            if not token_obj:
                raise HTTPException(status_code=404, detail="Token not found")
        finally:
            db_check.close()

    db = SessionLocal()
    try:
        # Check for duplicate
        existing = db.query(GitHubRepoModel).filter(GitHubRepoModel.full_name == full_name).first()
        if existing:
            raise HTTPException(status_code=409, detail="Repo already tracked")
        new_repo = GitHubRepoModel(
            id=str(uuid.uuid4())[:8],
            full_name=full_name,
            token_id=token_id,
            branch=branch,
            added_by=user["id"],
            added_at=time.time(),
        )
        db.add(new_repo)
        db.commit()
        db.refresh(new_repo)
        audit_log(request, "github_repo_add", resource_type="github_repo", resource_id=new_repo.id, details={"full_name": full_name, "is_public": is_public})
        return {"success": True, "id": new_repo.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.delete("/api/github/repos/{repo_id}")
async def delete_github_repo(repo_id: str, request: Request):
    """Remove a repo from tracking. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        repo = db.query(GitHubRepoModel).filter(GitHubRepoModel.id == repo_id).first()
        if not repo:
            raise HTTPException(status_code=404, detail="Repo not found")
        db.delete(repo)
        db.commit()
        audit_log(request, "github_repo_remove", resource_type="github_repo", resource_id=repo_id, details={"full_name": repo.full_name})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.patch("/api/github/repos/{repo_id}")
async def update_github_repo(repo_id: str, request: Request):
    """Update a tracked repo's branch. Admin only. Body: { branch? }"""
    require_role("admin")(request)
    body = await request.json()
    branch = body.get("branch", "").strip() or None

    db = SessionLocal()
    try:
        repo = db.query(GitHubRepoModel).filter(GitHubRepoModel.id == repo_id).first()
        if not repo:
            raise HTTPException(status_code=404, detail="Repo not found")
        repo.branch = branch
        db.commit()
        audit_log(request, "github_repo_update", resource_type="github_repo", resource_id=repo_id, details={"full_name": repo.full_name, "branch": branch})
        return {"success": True, "branch": branch}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


def _get_any_token():
    """Get any available GitHub token from DB (fallback for public repo API calls to avoid 403 rate limits)."""
    db = SessionLocal()
    try:
        return db.query(GitHubTokenModel).first()
    finally:
        db.close()


def _build_gh_headers(token_obj=None):
    """Build GitHub API headers. Uses token if provided, otherwise no auth."""
    headers = {"Accept": "application/vnd.github+json"}
    if token_obj:
        headers["Authorization"] = f"token {token_obj.token}"
    return headers


# ─── Browse GitHub via Token (Admin Only) ─────────────────────

@app.get("/api/github/browse/{token_id}/repos")
async def browse_github_repos(token_id: str, request: Request):
    """List repositories accessible by a token. Admin only."""
    require_role("admin")(request)
    db = SessionLocal()
    try:
        token_obj = db.query(GitHubTokenModel).filter(GitHubTokenModel.id == token_id).first()
        if not token_obj:
            raise HTTPException(status_code=404, detail="Token not found")
    finally:
        db.close()

    async with httpx.AsyncClient(timeout=15.0) as client:
        repos = []
        page = 1
        while True:
            resp = await client.get(
                f"https://api.github.com/user/repos",
                headers={"Authorization": f"token {token_obj.token}"},
                params={"per_page": 100, "page": page, "sort": "updated", "direction": "desc"},
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="GitHub API error")
            data = resp.json()
            if not data:
                break
            for r in data:
                repos.append({
                    "full_name": r["full_name"],
                    "private": r.get("private", False),
                    "default_branch": r.get("default_branch", "main"),
                    "updated_at": r.get("updated_at", ""),
                })
            if len(data) < 100:
                break
            page += 1
        return repos


@app.get("/api/github/browse/{token_id}/repos/{owner}/{repo:path}/branches")
async def browse_github_branches(token_id: str, owner: str, repo: str, request: Request):
    """List branches for a repo via token. Admin only."""
    require_role("admin")(request)
    db = SessionLocal()
    try:
        token_obj = db.query(GitHubTokenModel).filter(GitHubTokenModel.id == token_id).first()
        if not token_obj:
            raise HTTPException(status_code=404, detail="Token not found")
    finally:
        db.close()

    full_name = f"{owner}/{repo}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{full_name}/branches",
            headers={"Authorization": f"token {token_obj.token}"},
            params={"per_page": 100},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="GitHub API error")
        branches = []
        for b in resp.json():
            branches.append({
                "name": b["name"],
                "default": b["name"] == "main" or b["name"] == "master",
            })
        return branches


@app.get("/api/github/public/repos/{owner}/{repo:path}/branches")
async def browse_public_github_branches(owner: str, repo: str, request: Request):
    """List branches for a public repo. Uses any available token as fallback to avoid rate limits. Admin only."""
    require_role("admin")(request)
    full_name = f"{owner}/{repo}"
    fallback_token = _get_any_token()
    headers = _build_gh_headers(fallback_token)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{full_name}/branches",
            headers=headers,
            params={"per_page": 100},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"GitHub API error ({resp.status_code})")
        branches = []
        for b in resp.json():
            branches.append({
                "name": b["name"],
                "default": b["name"] == "main" or b["name"] == "master",
            })
        return branches


@app.get("/api/github/public/repos/{owner}/{repo:path}/info")
async def browse_public_github_repo_info(owner: str, repo: str, request: Request):
    """Get info about a public repo (verify it exists). Uses fallback token if available. Admin only."""
    require_role("admin")(request)
    full_name = f"{owner}/{repo}"
    fallback_token = _get_any_token()
    headers = _build_gh_headers(fallback_token)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{full_name}",
            headers=headers,
        )
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Repository not found or is private")
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"GitHub API error ({resp.status_code})")
        data = resp.json()
        return {
            "full_name": data["full_name"],
            "private": data.get("private", False),
            "default_branch": data.get("default_branch", "main"),
            "description": data.get("description", ""),
            "stars": data.get("stargazers_count", 0),
        }


# ─── Workflow Runs (Admin Only) ────────────────────────────────

@app.get("/api/github/actions")
async def get_github_actions(request: Request):
    """Get latest workflow runs for ALL tracked repos. Admin only."""
    user = require_role("admin")(request)
    db = SessionLocal()
    try:
        repos = db.query(GitHubRepoModel).all()
    finally:
        db.close()

    results = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        for repo in repos:
            # Get token if available (public repos may not have one)
            token_obj = None
            if repo.token_id:
                db2 = SessionLocal()
                try:
                    token_obj = db2.query(GitHubTokenModel).filter(GitHubTokenModel.id == repo.token_id).first()
                finally:
                    db2.close()

            # For public repos without token, use any available token as fallback
            # GitHub Actions API requires auth even for public repos
            if not token_obj:
                token_obj = _get_any_token()

            headers = _build_gh_headers(token_obj)

            url = f"https://api.github.com/repos/{repo.full_name}/actions/runs?per_page=5"
            if repo.branch:
                url += f"&branch={repo.branch}"
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    results.append({
                        "repo": repo.full_name,
                        "branch": repo.branch,
                        "error": f"GitHub API returned {resp.status_code}",
                        "runs": [],
                    })
                    continue
                data = resp.json()
                runs = []
                for run in data.get("workflow_runs", []):
                    commit_msg = ""
                    head_commit = run.get("head_commit")
                    if head_commit:
                        commit_msg = head_commit.get("message", "").split("\n")[0]
                    runs.append({
                        "id": run.get("id"),
                        "name": run.get("name", run.get("path", "").split("/")[-1].replace(".yml", "")),
                        "status": run.get("status"),
                        "conclusion": run.get("conclusion"),
                        "branch": run.get("head_branch"),
                        "commit": (run.get("head_sha") or "")[:7],
                        "commit_message": commit_msg,
                        "actor": run.get("actor", {}).get("login", "") if run.get("actor") else "",
                        "started_at": run.get("run_started_at") or run.get("created_at"),
                        "updated_at": run.get("updated_at"),
                        "html_url": run.get("html_url"),
                    })
                results.append({
                    "repo": repo.full_name,
                    "branch": repo.branch,
                    "runs": runs,
                })
            except httpx.TimeoutException:
                results.append({
                    "repo": repo.full_name,
                    "branch": repo.branch,
                    "error": "Request timed out",
                    "runs": [],
                })
            except Exception as e:
                results.append({
                    "repo": repo.full_name,
                    "branch": repo.branch,
                    "error": str(e),
                    "runs": [],
                })

    return {"repos": results}


# ═══════════════════════════════════════════════════════════════
#  Serve Frontend
# ═══════════════════════════════════════════════════════════════
frontend_path = os.path.join(os.path.dirname(__file__), "frontend")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
