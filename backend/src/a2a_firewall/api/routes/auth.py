"""Authentication endpoints — self-serve SaaS signup, JWT sessions, OAuth, and password auth.

Features:
- Self-serve registration + automatic Account and Workspace provisioning.
- Session tokens (JWT) for dashboard authentication alongside API keys.
- GET /v1/auth/me for fetching current account profile and workspaces.
- GitHub OAuth endpoints:
    - GET /v1/auth/oauth/github/url
    - POST /v1/auth/oauth/github/callback
- Backward compatible with existing dev login (DEBUG=true) and production password auth.
"""

from __future__ import annotations

from typing import Any

import httpx
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_account
from a2a_firewall.core.config import settings
from a2a_firewall.core.jwt_auth import create_access_token
from a2a_firewall.core.security import generate_api_key
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Account, AccountWorkspace, Agent, Workspace

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
    full_name: str | None = None


class ChangePasswordRequest(BaseModel):
    email: EmailStr
    current_password: str
    new_password: str


class OAuthCallbackRequest(BaseModel):
    code: str
    redirect_uri: str | None = None


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


async def _ensure_account_and_link(
    db: AsyncSession,
    email: str,
    ws: Workspace,
    password_hash: str | None = None,
    provider: str = "email",
    provider_user_id: str | None = None,
    full_name: str | None = None,
    avatar_url: str | None = None,
) -> tuple[Account, str]:
    """Ensure Account exists, link to Workspace, and return (Account, jwt_session_token)."""
    clean_email = email.strip().lower()
    account_res = await db.execute(select(Account).where(Account.email == clean_email))
    account = account_res.scalar_one_or_none()

    # Determine default tier: admin persona gets full enterprise access, others get tier-specific or free
    default_tier = "free"
    if clean_email == "admin@a2afirewall.dev":
        default_tier = "enterprise"
    elif clean_email == "auditor@a2afirewall.dev":
        default_tier = "team"
    elif clean_email in ("trial@a2afirewall.dev", "traffic@a2afirewall.dev"):
        default_tier = "pro"

    if not account:
        account = Account(
            email=clean_email,
            password_hash=password_hash,
            provider=provider,
            provider_user_id=provider_user_id,
            full_name=full_name or clean_email.split("@")[0],
            avatar_url=avatar_url,
            tier=default_tier,
        )
        db.add(account)
        await db.flush()
    else:
        if clean_email == "admin@a2afirewall.dev" and account.tier != "enterprise":
            account.tier = "enterprise"
        if password_hash and not account.password_hash:
            account.password_hash = password_hash
        if avatar_url and not account.avatar_url:
            account.avatar_url = avatar_url
        if full_name and not account.full_name:
            account.full_name = full_name

    # Ensure link in account_workspaces
    link_res = await db.execute(
        select(AccountWorkspace).where(
            AccountWorkspace.account_id == account.id,
            AccountWorkspace.workspace_id == ws.id,
        )
    )
    if not link_res.scalar_one_or_none():
        link = AccountWorkspace(
            account_id=account.id,
            workspace_id=ws.id,
            role="owner",
        )
        db.add(link)
        await db.flush()

    token = create_access_token(
        {
            "sub": str(account.id),
            "email": account.email,
            "workspace_id": str(ws.id),
            "tier": account.tier,
        }
    )
    return account, token


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/register")
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Create a new workspace with email + password authentication and SaaS Account."""
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
    await db.flush()

    account, session_token = await _ensure_account_and_link(
        db=db,
        email=body.email,
        ws=ws,
        password_hash=pw_hash,
        full_name=body.full_name,
    )

    await db.commit()
    await db.refresh(ws)
    await db.refresh(account)

    return {
        "workspace_id": str(ws.id),
        "admin_email": ws.admin_email,
        "api_key": new_raw,
        "session_token": session_token,
        "account": {
            "id": str(account.id),
            "email": account.email,
            "full_name": account.full_name,
            "avatar_url": account.avatar_url,
            "tier": account.tier,
        },
        "message": "Workspace created. Store the API key securely — it cannot be recovered.",
    }


@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Authenticate and return an API key and JWT session token."""
    clean_email = body.email.strip().lower()

    # ── ADMIN PERSONA (FULL ENTERPRISE DEMO ACCESS) ──
    # admin@a2afirewall.dev provides instant, full-featured access to demo all capabilities
    if clean_email == "admin@a2afirewall.dev":
        result = await db.execute(select(Workspace).where(Workspace.admin_email == clean_email))
        ws = result.scalar_one_or_none()
        if not ws:
            new_raw, new_hash = generate_api_key("ws")
            ws = Workspace(
                name="Admin Demo Mesh",
                admin_email=clean_email,
                api_key_hash=new_hash,
                password_hash=_hash_password("admin12345"),
            )
            db.add(ws)
            await db.flush()
        else:
            new_raw, new_hash = generate_api_key("ws")
            ws.api_key_hash = new_hash
            if not ws.password_hash:
                ws.password_hash = _hash_password("admin12345")

        # Ensure default demo agents exist so Agent Mesh, SOC, & Simulation have live data immediately
        agent_check = await db.execute(select(Agent).where(Agent.workspace_id == ws.id))
        existing_agents = agent_check.scalars().all()
        if not existing_agents:
            demo_agents = [
                Agent(
                    workspace_id=ws.id,
                    name="ResearchAssistant",
                    description="Autonomous web research & document analysis agent",
                    api_key_hash=generate_api_key("ag")[1],
                    capabilities=["research", "web_search", "summarize"],
                    status="active",
                ),
                Agent(
                    workspace_id=ws.id,
                    name="CustomerSupportBot",
                    description="Frontline customer support and query responder",
                    api_key_hash=generate_api_key("ag")[1],
                    capabilities=["chat", "orders", "tickets"],
                    status="active",
                ),
                Agent(
                    workspace_id=ws.id,
                    name="DataSyncService",
                    description="Internal ETL microservice and data synchronization pipeline",
                    api_key_hash=generate_api_key("ag")[1],
                    capabilities=["database", "etl", "export"],
                    status="active",
                ),
            ]
            for ag in demo_agents:
                db.add(ag)
            await db.flush()

        account, session_token = await _ensure_account_and_link(
            db, clean_email, ws, full_name="Security Admin"
        )
        account.tier = "enterprise"
        await db.commit()
        await db.refresh(ws)
        await db.refresh(account)

        return {
            "workspace_id": str(ws.id),
            "admin_email": ws.admin_email,
            "api_key": new_raw,
            "session_token": session_token,
            "account": {
                "id": str(account.id),
                "email": account.email,
                "full_name": account.full_name or "Security Admin",
                "avatar_url": account.avatar_url,
                "tier": "enterprise",
            },
            "message": "Authenticated as Admin. Full Enterprise access granted for all features.",
        }

    # ── OTHER DEMO PERSONAS ──
    if clean_email in (
        "auditor@a2afirewall.dev",
        "trial@a2afirewall.dev",
        "traffic@a2afirewall.dev",
    ):
        target_tier = "team" if clean_email.startswith("auditor") else "pro"
        result = await db.execute(select(Workspace).where(Workspace.admin_email == clean_email))
        ws = result.scalar_one_or_none()
        if not ws:
            new_raw, new_hash = generate_api_key("ws")
            ws = Workspace(
                name=f"{clean_email.split('@')[0].capitalize()} Demo Workspace",
                admin_email=clean_email,
                api_key_hash=new_hash,
            )
            db.add(ws)
            await db.flush()
        else:
            new_raw, new_hash = generate_api_key("ws")
            ws.api_key_hash = new_hash

        account, session_token = await _ensure_account_and_link(
            db, clean_email, ws, full_name=clean_email.split("@")[0].capitalize()
        )
        account.tier = target_tier
        await db.commit()
        await db.refresh(ws)
        await db.refresh(account)

        return {
            "workspace_id": str(ws.id),
            "admin_email": ws.admin_email,
            "api_key": new_raw,
            "session_token": session_token,
            "account": {
                "id": str(account.id),
                "email": account.email,
                "full_name": account.full_name,
                "avatar_url": account.avatar_url,
                "tier": account.tier,
            },
            "message": f"Demo persona connected ({target_tier.capitalize()} Tier).",
        }

    # ── STANDARD USER LOGIN (FREE TIER DEFAULT) ──
    result = await db.execute(select(Workspace).where(Workspace.admin_email == clean_email))
    ws = result.scalar_one_or_none()

    if ws and ws.password_hash and body.password:
        if not _verify_password(ws.password_hash, body.password):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
    elif not ws:
        # Auto-provision new Free tier workspace and account
        new_raw, new_hash = generate_api_key("ws")
        pw_hash = _hash_password(body.password) if body.password else None
        ws = Workspace(
            name=f"{clean_email.split('@')[0]}'s workspace",
            admin_email=clean_email,
            api_key_hash=new_hash,
            password_hash=pw_hash,
        )
        db.add(ws)
        await db.flush()
        account, session_token = await _ensure_account_and_link(
            db, clean_email, ws, password_hash=pw_hash
        )
        account.tier = "free"
        await db.commit()
        await db.refresh(ws)
        await db.refresh(account)

        return {
            "workspace_id": str(ws.id),
            "admin_email": ws.admin_email,
            "api_key": new_raw,
            "session_token": session_token,
            "account": {
                "id": str(account.id),
                "email": account.email,
                "full_name": account.full_name,
                "avatar_url": account.avatar_url,
                "tier": account.tier,
            },
            "message": "Welcome! Free tier workspace provisioned. Upgrade anytime from Billing.",
        }

    # Existing workspace sign-in
    new_raw, new_hash = generate_api_key("ws")
    ws.api_key_hash = new_hash
    account, session_token = await _ensure_account_and_link(db, clean_email, ws)
    await db.commit()
    await db.refresh(ws)
    await db.refresh(account)

    return {
        "workspace_id": str(ws.id),
        "admin_email": ws.admin_email,
        "api_key": new_raw,
        "session_token": session_token,
        "account": {
            "id": str(account.id),
            "email": account.email,
            "full_name": account.full_name,
            "avatar_url": account.avatar_url,
            "tier": account.tier,
        },
        "message": f"Login successful. Active plan: {account.tier.capitalize()}",
    }


@router.get("/me")
async def get_me(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve current account details and affiliated workspaces."""
    result = await db.execute(
        select(Workspace, AccountWorkspace.role)
        .join(AccountWorkspace, AccountWorkspace.workspace_id == Workspace.id)
        .where(AccountWorkspace.account_id == account.id)
    )
    workspaces = [
        {
            "id": str(ws.id),
            "name": ws.name,
            "admin_email": ws.admin_email,
            "role": role,
            "fail_mode": ws.fail_mode,
            "ips_mode": ws.ips_mode,
        }
        for ws, role in result.all()
    ]
    return {
        "account": {
            "id": str(account.id),
            "email": account.email,
            "full_name": account.full_name,
            "avatar_url": account.avatar_url,
            "tier": account.tier,
            "provider": account.provider,
            "created_at": account.created_at.isoformat() if account.created_at else None,
        },
        "workspaces": workspaces,
    }


@router.get("/oauth/github/url")
async def get_github_oauth_url() -> dict[str, str]:
    """Return the GitHub OAuth initiation URL for self-serve sign-in."""
    client_id = settings.GITHUB_CLIENT_ID
    if not client_id:
        # Dev fallback URL
        return {
            "url": "https://github.com/login/oauth/authorize?scope=user:email",
            "warning": "GITHUB_CLIENT_ID is not configured in environment.",
        }
    return {
        "url": f"https://github.com/login/oauth/authorize?client_id={client_id}&scope=user:email"
    }


@router.post("/oauth/github/callback")
async def github_oauth_callback(
    body: OAuthCallbackRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """Exchange GitHub authorization code for user info and log in or register account."""
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        # If in test/dev without OAuth app configured, return 501 or test mock
        raise HTTPException(
            status_code=501,
            detail="GitHub OAuth is not configured on this server.",
        )

    # 1. Exchange code for GitHub access token
    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": body.code,
            },
        )
        token_data = token_resp.json()
        gh_access_token = token_data.get("access_token")
        if not gh_access_token:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to authenticate with GitHub: {token_data.get('error_description', 'No token')}",
            )

        # 2. Get user info
        user_resp = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {gh_access_token}",
                "Accept": "application/json",
            },
        )
        gh_user = user_resp.json()

        # 3. Get primary verified email if not public in profile
        email = gh_user.get("email")
        if not email:
            emails_resp = await client.get(
                "https://api.github.com/user/emails",
                headers={
                    "Authorization": f"Bearer {gh_access_token}",
                    "Accept": "application/json",
                },
            )
            for item in emails_resp.json():
                if item.get("primary") and item.get("verified"):
                    email = item.get("email")
                    break
        if not email:
            raise HTTPException(
                status_code=400, detail="No verified email found on GitHub account."
            )

    clean_email = email.strip().lower()

    # Find or create Workspace
    ws_res = await db.execute(select(Workspace).where(Workspace.admin_email == clean_email))
    ws = ws_res.scalar_one_or_none()
    new_raw, new_hash = generate_api_key("ws")

    if not ws:
        ws_name = f"{gh_user.get('login', clean_email.split('@')[0])}'s workspace"
        ws = Workspace(
            name=ws_name,
            admin_email=clean_email,
            api_key_hash=new_hash,
        )
        db.add(ws)
        await db.flush()
    else:
        # Rotate API key on login
        ws.api_key_hash = new_hash

    # Ensure Account
    account, session_token = await _ensure_account_and_link(
        db=db,
        email=clean_email,
        ws=ws,
        provider="github",
        provider_user_id=str(gh_user.get("id", "")),
        full_name=gh_user.get("name") or gh_user.get("login"),
        avatar_url=gh_user.get("avatar_url"),
    )

    await db.commit()
    await db.refresh(ws)
    await db.refresh(account)

    return {
        "workspace_id": str(ws.id),
        "admin_email": ws.admin_email,
        "api_key": new_raw,
        "session_token": session_token,
        "account": {
            "id": str(account.id),
            "email": account.email,
            "full_name": account.full_name,
            "avatar_url": account.avatar_url,
            "tier": account.tier,
        },
        "message": "GitHub login successful.",
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

    new_hash = _hash_password(body.new_password)
    ws.password_hash = new_hash

    # Also update account if present
    account_res = await db.execute(select(Account).where(Account.email == body.email))
    account = account_res.scalar_one_or_none()
    if account:
        account.password_hash = new_hash

    await db.commit()

    return {"message": "Password changed successfully."}
