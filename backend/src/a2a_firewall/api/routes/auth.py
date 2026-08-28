"""Authentication endpoints — dev-only email login + production password auth.

DEV MODE (DEBUG=true):
    POST /v1/auth/login — email-only login, auto-provisions workspace, rotates API key.
    This is the original behavior preserved for development convenience.

PRODUCTION MODE (DEBUG=false):
    POST /v1/auth/register — create workspace with email + Argon2id password.
    POST /v1/auth/login — verify password, return rotated API key.
    POST /v1/auth/change-password — change password (requires current password).

All password hashing uses Argon2id via the argon2-cffi backend.
"""

from __future__ import annotations

from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.core.config import settings
from a2a_firewall.core.security import generate_api_key
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Workspace

router = APIRouter()
_ph = PasswordHasher()

# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    email: str
    password: str | None = None  # Optional for dev-mode compat


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    workspace_name: str | None = None


class ChangePasswordRequest(BaseModel):
    email: EmailStr
    current_password: str
    new_password: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

MIN_PASSWORD_LENGTH = 8


def _validate_password(password: str) -> None:
    """Enforce minimum password complexity."""
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
        )


def _hash_password(password: str) -> str:
    """Hash a password with Argon2id."""
    return _ph.hash(password)


def _verify_password(password_hash: str, password: str) -> bool:
    """Verify a password against an Argon2id hash."""
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/register")
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Create a new workspace with email + password authentication.

    Available in both dev and production mode. In production mode this is
    the primary way to create a workspace.
    """
    _validate_password(body.password)

    # Check for existing workspace
    result = await db.execute(select(Workspace).where(Workspace.admin_email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="A workspace with this email already exists.",
        )

    workspace_name = body.workspace_name or f"{body.email.split('@')[0]}'s workspace"
    new_raw, new_hash = generate_api_key("ws")
    pw_hash = _hash_password(body.password)

    ws = Workspace(
        name=workspace_name,
        admin_email=body.email,
        api_key_hash=new_hash,
        password_hash=pw_hash,
    )
    db.add(ws)
    await db.commit()
    await db.refresh(ws)

    return {
        "workspace_id": str(ws.id),
        "admin_email": ws.admin_email,
        "api_key": new_raw,
        "message": "Workspace created. Store the API key securely — it cannot be recovered.",
    }


@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Authenticate and return a (rotated) API key.

    DEV MODE (DEBUG=true): email-only login — no password required.
    Workspace is auto-provisioned on first login.

    PRODUCTION MODE (DEBUG=false): requires email + password.
    """
    # ── DEV MODE: original behavior ──
    if settings.DEBUG and not body.password:
        result = await db.execute(select(Workspace).where(Workspace.admin_email == body.email))
        ws = result.scalar_one_or_none()

        if not ws:
            new_raw, new_hash = generate_api_key("ws")
            ws = Workspace(
                name=body.email.split("@")[0] + "'s workspace",
                admin_email=body.email,
                api_key_hash=new_hash,
            )
            db.add(ws)
            await db.commit()
            await db.refresh(ws)
            return {
                "workspace_id": str(ws.id),
                "admin_email": ws.admin_email,
                "api_key": new_raw,
                "warning": "DEV ONLY: workspace was auto-created on first login.",
            }

        new_raw, new_hash = generate_api_key("ws")
        ws.api_key_hash = new_hash
        await db.commit()
        await db.refresh(ws)
        return {
            "workspace_id": str(ws.id),
            "admin_email": ws.admin_email,
            "api_key": new_raw,
            "warning": "DEV ONLY: key was rotated on login. Use a password-protected flow in prod.",
        }

    # ── PRODUCTION MODE: password required ──
    if not body.password:
        raise HTTPException(
            status_code=422,
            detail="Password is required for production login.",
        )

    result = await db.execute(select(Workspace).where(Workspace.admin_email == body.email))
    ws = result.scalar_one_or_none()

    if not ws or not ws.password_hash:
        # Constant-time-ish: don't reveal whether the email exists
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
        )

    if not _verify_password(ws.password_hash, body.password):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
        )

    # Rotate API key on successful login
    new_raw, new_hash = generate_api_key("ws")
    ws.api_key_hash = new_hash
    await db.commit()
    await db.refresh(ws)

    return {
        "workspace_id": str(ws.id),
        "admin_email": ws.admin_email,
        "api_key": new_raw,
        "message": "Login successful. API key has been rotated.",
    }


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """Change workspace password. Requires the current password."""
    _validate_password(body.new_password)

    result = await db.execute(select(Workspace).where(Workspace.admin_email == body.email))
    ws = result.scalar_one_or_none()

    if not ws or not ws.password_hash:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or current password.",
        )

    if not _verify_password(ws.password_hash, body.current_password):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or current password.",
        )

    ws.password_hash = _hash_password(body.new_password)
    await db.commit()

    return {"message": "Password changed successfully."}
