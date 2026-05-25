"""
Database module - PostgreSQL via SQLAlchemy for VPS Dashboard.
"""
import os
import uuid
import time
import hashlib
from typing import List, Optional
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, Boolean, Float, Text, DateTime, ForeignKey, Table, text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session

# ─── Config ──────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://vpsadmin:change-me@db:5432/vpsdashboard")

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ─── Models ──────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(String(32), primary_key=True)
    username = Column(String(128), unique=True, nullable=False, index=True)
    password_hash = Column(String(128), nullable=False)
    display_name = Column(String(256), default="")
    role = Column(String(32), default="viewer")  # admin, operator, viewer
    is_active = Column(Boolean, default=True)
    created_at = Column(Float, default=time.time)

    vps_access_entries = relationship("UserVPSAccess", back_populates="user", cascade="all, delete-orphan")
    group_access_entries = relationship("UserGroupAccess", back_populates="user", cascade="all, delete-orphan")


class VPS(Base):
    __tablename__ = "vps"

    id = Column(String(32), primary_key=True)
    name = Column(String(256), nullable=False)
    host = Column(String(256), nullable=False)
    port = Column(Integer, default=22)
    username = Column(String(128), default="root")
    password = Column(Text, nullable=True)
    key_file = Column(Text, nullable=True)
    tags = Column(Text, default="[]")  # JSON-encoded list
    group_name = Column("group", String(128), default="default")

    access_entries = relationship("UserVPSAccess", back_populates="vps", cascade="all, delete-orphan")


class UserVPSAccess(Base):
    __tablename__ = "user_vps_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    vps_id = Column(String(32), ForeignKey("vps.id", ondelete="CASCADE"), nullable=False, index=True)

    user = relationship("User", back_populates="vps_access_entries")
    vps = relationship("VPS", back_populates="access_entries")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(32), primary_key=True)
    user_id = Column(String(32), ForeignKey("users.id"), nullable=True)
    username = Column(String(128))
    action = Column(String(64), nullable=False)  # login, logout, vps_create, vps_update, vps_delete, container_start, container_stop, container_restart, user_create, user_update, user_delete, exec_command, terminal_connect
    resource_type = Column(String(32))  # vps, container, user, system
    resource_id = Column(String(64))
    details = Column(Text)  # JSON string with extra info
    ip_address = Column(String(45))
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


class SSHKey(Base):
    __tablename__ = "ssh_keys"

    id = Column(String(32), primary_key=True)
    name = Column(String(256), nullable=False)
    key_file = Column(Text, nullable=True)  # path to private key file on the dashboard host (optional if content pasted)
    private_key = Column(Text, nullable=True)  # pasted private key content (PEM format)
    public_key = Column(Text, nullable=True)  # optional: store public key content for reference
    fingerprint = Column(String(128), nullable=True)  # ssh-keygen fingerprint
    key_type = Column(String(32), nullable=True)  # 'file', 'pasted', or 'both'
    created_by = Column(String(32), ForeignKey("users.id"), nullable=True)
    created_at = Column(Float, default=time.time)


class VPGroup(Base):
    __tablename__ = "vps_groups"

    id = Column(String(32), primary_key=True)
    name = Column(String(128), unique=True, nullable=False, index=True)
    description = Column(Text, default="")
    created_at = Column(Float, default=time.time)
    created_by = Column(String(32), ForeignKey("users.id"), nullable=True)


class UserGroupAccess(Base):
    __tablename__ = "user_group_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id = Column(String(32), ForeignKey("vps_groups.id", ondelete="CASCADE"), nullable=False, index=True)

    user = relationship("User", back_populates="group_access_entries")
    group = relationship("VPGroup")


class GitHubToken(Base):
    __tablename__ = "github_tokens"

    id = Column(String(32), primary_key=True)
    name = Column(String(256), nullable=False)
    token = Column(Text, nullable=False)  # GitHub PAT (encrypted in future)
    github_user = Column(String(128), nullable=True)  # GitHub username/org
    created_by = Column(String(32), ForeignKey("users.id"), nullable=True)
    created_at = Column(Float, default=time.time)


class GitHubRepo(Base):
    __tablename__ = "github_repos"

    id = Column(String(32), primary_key=True)
    full_name = Column(String(256), nullable=False, unique=True)  # owner/repo
    token_id = Column(String(32), ForeignKey("github_tokens.id", ondelete="SET NULL"), nullable=True)  # NULL for public repos
    branch = Column(String(256), nullable=True)  # default branch to filter (optional)
    added_by = Column(String(32), ForeignKey("users.id"), nullable=True)
    added_at = Column(Float, default=time.time)


class PersistentSession(Base):
    """Persistent sessions stored in DB (survives restarts)."""
    __tablename__ = "sessions"

    id = Column(String(64), primary_key=True)
    user_id = Column(String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    username = Column(String(128))
    role = Column(String(32))
    expires = Column(Float, nullable=False)
    created_at = Column(Float, default=time.time)
    last_active = Column(Float, default=time.time)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(512), nullable=True)


# ─── Helpers ─────────────────────────────────────────────────

def init_db():
    """Create all tables and run migrations."""
    Base.metadata.create_all(bind=engine)
    # Migration: add new columns to ssh_keys if they don't exist
    try:
        with engine.connect() as conn:
            # Check if private_key column exists
            result = conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='ssh_keys' AND column_name='private_key'"
            ))
            if not result.fetchone():
                conn.execute(text("ALTER TABLE ssh_keys ADD COLUMN private_key TEXT"))
                conn.execute(text("ALTER TABLE ssh_keys ADD COLUMN key_type VARCHAR(32)"))
                conn.execute(text("UPDATE ssh_keys SET key_type = 'file' WHERE key_file IS NOT NULL"))
                conn.commit()
                print("[Migration] Added private_key and key_type columns to ssh_keys")
            # Make key_file nullable if it isn't already
            conn.execute(text("ALTER TABLE ssh_keys ALTER COLUMN key_file DROP NOT NULL"))
            conn.commit()
    except Exception as e:
        print(f"[Migration] ssh_keys migration skipped (may already exist): {e}")

    # Migration: make github_repos.token_id nullable for public repos
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE github_repos ALTER COLUMN token_id DROP NOT NULL"))
            conn.commit()
            print("[Migration] Made github_repos.token_id nullable for public repos")
    except Exception as e:
        print(f"[Migration] github_repos.token_id nullable (may already be): {e}")


def get_db():
    """FastAPI dependency that yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    """Hash a password using SHA-256."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def seed_default_admin(username: str, password: str):
    """Create default admin user if no users exist."""
    db = SessionLocal()
    try:
        existing = db.query(User).first()
        if not existing:
            admin = User(
                id=str(uuid.uuid4())[:8],
                username=username,
                password_hash=hash_password(password),
                display_name="Administrator",
                role="admin",
                is_active=True,
                created_at=time.time(),
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()


def get_user_vps_access(db: Session, user_id: str) -> List[str]:
    """Get list of VPS IDs the user has access to."""
    entries = db.query(UserVPSAccess).filter(UserVPSAccess.user_id == user_id).all()
    return [e.vps_id for e in entries]


def set_user_vps_access(db: Session, user_id: str, vps_ids: List[str]):
    """Set VPS access list for a user. Replaces all existing entries."""
    # Remove existing entries
    db.query(UserVPSAccess).filter(UserVPSAccess.user_id == user_id).delete()
    # Add new entries
    for vps_id in vps_ids:
        entry = UserVPSAccess(user_id=user_id, vps_id=vps_id)
        db.add(entry)
    db.commit()


def get_user_group_ids(db: Session, user_id: str) -> List[str]:
    """Get list of group IDs the user belongs to."""
    entries = db.query(UserGroupAccess).filter(UserGroupAccess.user_id == user_id).all()
    return [e.group_id for e in entries]


def get_user_group_names(db: Session, user_id: str) -> List[str]:
    """Get list of group NAMES the user belongs to."""
    group_ids = get_user_group_ids(db, user_id)
    if not group_ids:
        return []
    groups = db.query(VPGroup).filter(VPGroup.id.in_(group_ids)).all()
    return [g.name for g in groups]


def set_user_group_access(db: Session, user_id: str, group_ids: List[str]):
    """Set group memberships for a user. Replaces all existing entries."""
    db.query(UserGroupAccess).filter(UserGroupAccess.user_id == user_id).delete()
    for gid in group_ids:
        entry = UserGroupAccess(user_id=user_id, group_id=gid)
        db.add(entry)
    db.commit()


def get_effective_vps_access(db: Session, user_id: str) -> List[str]:
    """Get effective VPS access = direct VPS assignments + VPS via group memberships."""
    direct = set(get_user_vps_access(db, user_id))
    group_names = get_user_group_names(db, user_id)
    if group_names:
        group_vps = db.query(VPS).filter(VPS.group_name.in_(group_names)).all()
        for v in group_vps:
            direct.add(v.id)
    return list(direct)
