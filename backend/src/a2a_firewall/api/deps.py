from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.core.jwt_auth import decode_access_token
from a2a_firewall.core.security import hash_api_key
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import Account, AccountWorkspace, Agent, APIKeyRecord, Workspace


async def get_current_agent(
    authorization: str = Header(...), db: AsyncSession = Depends(get_db)
) -> Agent:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth header")
    raw_key = authorization.removeprefix("Bearer ").strip()
    key_hash = hash_api_key(raw_key)
    result = await db.execute(select(Agent).where(Agent.api_key_hash == key_hash))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=401, detail="Invalid API key")
    if agent.status == "suspended":
        raise HTTPException(status_code=403, detail="Agent suspended")
    return agent


async def get_current_workspace(
    authorization: str = Header(...),
    x_session_token: str | None = Header(None, alias="X-Session-Token"),
    x_workspace_key: str | None = Header(None, alias="X-Workspace-Key"),
    x_workspace_id: str | None = Header(None, alias="X-Workspace-Id"),
    db: AsyncSession = Depends(get_db),
) -> Workspace:
    """Resolve active workspace via Bearer API key, X-Workspace-Key, or JWT session token."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth header")
    raw_token = authorization.removeprefix("Bearer ").strip()

    # 1. Try raw_token as legacy/primary Workspace API key (fastest & most reliable)
    key_hash = hash_api_key(raw_token)
    result = await db.execute(select(Workspace).where(Workspace.api_key_hash == key_hash))
    ws = result.scalar_one_or_none()
    if ws:
        return ws

    # 2. Try X-Workspace-Key if provided
    if x_workspace_key:
        x_hash = hash_api_key(x_workspace_key.strip())
        result = await db.execute(select(Workspace).where(Workspace.api_key_hash == x_hash))
        ws = result.scalar_one_or_none()
        if ws:
            return ws

    # 3. Try decoding JWT session token (from X-Session-Token or raw_token)
    tokens_to_decode = []
    if x_session_token:
        tokens_to_decode.append(x_session_token.removeprefix("Bearer ").strip())
    tokens_to_decode.append(raw_token)

    for tok in tokens_to_decode:
        payload = decode_access_token(tok)
        if payload and ("sub" in payload or "email" in payload or "workspace_id" in payload):
            # 3a. Explicit workspace_id from JWT payload
            if "workspace_id" in payload and payload["workspace_id"]:
                try:
                    ws_id = uuid.UUID(payload["workspace_id"])
                    ws_res = await db.execute(select(Workspace).where(Workspace.id == ws_id))
                    ws = ws_res.scalar_one_or_none()
                    if ws:
                        return ws
                except (ValueError, TypeError):
                    pass

            # 3b. Explicit X-Workspace-Id header
            if x_workspace_id:
                try:
                    ws_uuid = uuid.UUID(x_workspace_id)
                    ws_res = await db.execute(select(Workspace).where(Workspace.id == ws_uuid))
                    ws = ws_res.scalar_one_or_none()
                    if ws:
                        return ws
                except (ValueError, TypeError):
                    pass

            # 3c. Join via AccountWorkspace
            if "sub" in payload and payload["sub"]:
                try:
                    account_id = uuid.UUID(payload["sub"])
                    result = await db.execute(
                        select(Workspace)
                        .join(AccountWorkspace, AccountWorkspace.workspace_id == Workspace.id)
                        .where(AccountWorkspace.account_id == account_id)
                        .order_by(AccountWorkspace.created_at.asc())
                    )
                    ws = result.scalars().first()
                    if ws:
                        return ws
                except (ValueError, TypeError):
                    pass

            # 3d. Lookup by admin_email
            email = payload.get("email")
            if email:
                acc_by_email = await db.execute(
                    select(Workspace).where(Workspace.admin_email == email)
                )
                ws = acc_by_email.scalar_one_or_none()
                if ws:
                    return ws

    # 4. Try fine-grained APIKeyRecord
    result_key = await db.execute(
        select(APIKeyRecord).where(
            APIKeyRecord.key_hash == key_hash,
            APIKeyRecord.is_revoked.is_(False),
        )
    )
    api_key_record = result_key.scalar_one_or_none()
    if api_key_record:
        if api_key_record.expires_at and api_key_record.expires_at < datetime.now(UTC):
            raise HTTPException(status_code=401, detail="API key has expired")
        api_key_record.last_used_at = datetime.now(UTC)
        await db.commit()
        ws_res = await db.execute(
            select(Workspace).where(Workspace.id == api_key_record.workspace_id)
        )
        ws = ws_res.scalar_one_or_none()
        if ws:
            return ws

    # 5. Try Agent API key
    result_agent = await db.execute(select(Agent).where(Agent.api_key_hash == key_hash))
    agent = result_agent.scalar_one_or_none()
    if agent:
        if agent.status == "suspended":
            raise HTTPException(status_code=403, detail="Agent suspended")
        ws_res = await db.execute(select(Workspace).where(Workspace.id == agent.workspace_id))
        ws = ws_res.scalar_one_or_none()
        if ws:
            return ws

    raise HTTPException(status_code=401, detail="Invalid workspace key")


async def get_current_account(
    authorization: str = Header(...),
    x_session_token: str | None = Header(None, alias="X-Session-Token"),
    x_workspace_key: str | None = Header(None, alias="X-Workspace-Key"),
    db: AsyncSession = Depends(get_db),
) -> Account:
    """Authenticate a dashboard user via JWT session token, falling back to workspace API key."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth header")
    token = authorization.removeprefix("Bearer ").strip()

    # 1. Try decoding as JWT session token from X-Session-Token or Authorization header
    tokens_to_decode = []
    if x_session_token:
        tokens_to_decode.append(x_session_token.removeprefix("Bearer ").strip())
    tokens_to_decode.append(token)

    for tok in tokens_to_decode:
        payload = decode_access_token(tok)
        if payload and ("sub" in payload or "email" in payload):
            if "sub" in payload and payload["sub"]:
                try:
                    account_id = uuid.UUID(payload["sub"])
                    result = await db.execute(select(Account).where(Account.id == account_id))
                    account = result.scalar_one_or_none()
                    if account:
                        return account
                except (ValueError, TypeError):
                    pass

            email = payload.get("email")
            if email:
                acc_by_email = await db.execute(select(Account).where(Account.email == email))
                account = acc_by_email.scalar_one_or_none()
                if account:
                    return account
                if email == "admin@a2afirewall.dev":
                    account = Account(
                        email="admin@a2afirewall.dev",
                        full_name="Security Admin",
                        tier="enterprise",
                    )
                    db.add(account)
                    await db.commit()
                    return account

    # 2. Try looking up workspace by API key (token or x_workspace_key) and resolving linked account
    keys_to_try = [token]
    if x_workspace_key and x_workspace_key != token:
        keys_to_try.append(x_workspace_key.strip())

    for k in keys_to_try:
        key_hash = hash_api_key(k)
        ws_result = await db.execute(select(Workspace).where(Workspace.api_key_hash == key_hash))
        ws = ws_result.scalar_one_or_none()
        if ws:
            # Check linked account in account_workspaces
            link_result = await db.execute(
                select(Account)
                .join(AccountWorkspace, AccountWorkspace.account_id == Account.id)
                .where(AccountWorkspace.workspace_id == ws.id)
                .order_by(AccountWorkspace.created_at.asc())
            )
            account = link_result.scalars().first()
            if account:
                return account

            # Fall back to account by admin_email
            acc_by_email = await db.execute(select(Account).where(Account.email == ws.admin_email))
            account = acc_by_email.scalar_one_or_none()
            if account:
                return account

            # Auto-create account for this workspace admin if none exists yet
            tier = "enterprise" if ws.admin_email == "admin@a2afirewall.dev" else "free"
            account = Account(
                email=ws.admin_email,
                full_name=ws.admin_email.split("@")[0],
                tier=tier,
            )
            db.add(account)
            await db.flush()
            link = AccountWorkspace(account_id=account.id, workspace_id=ws.id, role="owner")
            db.add(link)
            await db.commit()
            return account

    raise HTTPException(status_code=401, detail="Invalid or expired session token")


async def get_current_workspace_for_account(
    account: Account = Depends(get_current_account),
    x_workspace_id: str | None = Header(None, alias="X-Workspace-Id"),
    db: AsyncSession = Depends(get_db),
) -> Workspace:
    """Resolve the active workspace for an authenticated account."""
    if x_workspace_id:
        try:
            ws_uuid = uuid.UUID(x_workspace_id)
        except ValueError:
            raise HTTPException(
                status_code=400, detail="Invalid X-Workspace-Id header format"
            ) from None

        membership = await db.execute(
            select(AccountWorkspace).where(
                AccountWorkspace.account_id == account.id,
                AccountWorkspace.workspace_id == ws_uuid,
            )
        )
        if not membership.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Account does not belong to this workspace")
        ws_res = await db.execute(select(Workspace).where(Workspace.id == ws_uuid))
        ws = ws_res.scalar_one_or_none()
        if ws:
            return ws
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Default to first workspace owned or joined
    result = await db.execute(
        select(Workspace)
        .join(AccountWorkspace, AccountWorkspace.workspace_id == Workspace.id)
        .where(AccountWorkspace.account_id == account.id)
        .order_by(AccountWorkspace.created_at.asc())
    )
    ws = result.scalars().first()
    if not ws:
        raise HTTPException(status_code=404, detail="No workspace found for this account")
    return ws


async def get_current_workspace_flexible(
    authorization: str = Header(...),
    x_workspace_id: str | None = Header(None, alias="X-Workspace-Id"),
    db: AsyncSession = Depends(get_db),
) -> Workspace:
    """Accept workspace key, APIKeyRecord, agent key, or JWT session token, returning the Workspace."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth header")
    raw_key = authorization.removeprefix("Bearer ").strip()

    # 1. Try JWT session token
    payload = decode_access_token(raw_key)
    if payload and "sub" in payload:
        try:
            account_id = uuid.UUID(payload["sub"])
            if x_workspace_id:
                try:
                    ws_uuid = uuid.UUID(x_workspace_id)
                except ValueError:
                    ws_uuid = None
                if ws_uuid:
                    mem = await db.execute(
                        select(AccountWorkspace).where(
                            AccountWorkspace.account_id == account_id,
                            AccountWorkspace.workspace_id == ws_uuid,
                        )
                    )
                    if mem.scalar_one_or_none():
                        ws_res = await db.execute(select(Workspace).where(Workspace.id == ws_uuid))
                        ws = ws_res.scalar_one_or_none()
                        if ws:
                            return ws
            # Fall back to first workspace
            result = await db.execute(
                select(Workspace)
                .join(AccountWorkspace, AccountWorkspace.workspace_id == Workspace.id)
                .where(AccountWorkspace.account_id == account_id)
                .order_by(AccountWorkspace.created_at.asc())
            )
            ws = result.scalars().first()
            if ws:
                return ws
        except Exception:
            pass

    key_hash = hash_api_key(raw_key)

    # 2. Try direct legacy Workspace API key
    result = await db.execute(select(Workspace).where(Workspace.api_key_hash == key_hash))
    ws = result.scalar_one_or_none()
    if ws:
        return ws

    # 3. Try fine-grained APIKeyRecord
    result_key = await db.execute(
        select(APIKeyRecord).where(
            APIKeyRecord.key_hash == key_hash,
            APIKeyRecord.is_revoked.is_(False),
        )
    )
    api_key_record = result_key.scalar_one_or_none()
    if api_key_record:
        # Check expiration if set
        if api_key_record.expires_at and api_key_record.expires_at < datetime.now(UTC):
            raise HTTPException(status_code=401, detail="API key has expired")
        # Update last_used_at
        api_key_record.last_used_at = datetime.now(UTC)
        await db.commit()
        ws_res = await db.execute(
            select(Workspace).where(Workspace.id == api_key_record.workspace_id)
        )
        ws = ws_res.scalar_one_or_none()
        if ws:
            return ws

    # 4. Try Agent API key
    result_agent = await db.execute(select(Agent).where(Agent.api_key_hash == key_hash))
    agent = result_agent.scalar_one_or_none()
    if agent:
        if agent.status == "suspended":
            raise HTTPException(status_code=403, detail="Agent suspended")
        ws_res = await db.execute(select(Workspace).where(Workspace.id == agent.workspace_id))
        ws = ws_res.scalar_one_or_none()
        if ws:
            return ws

    raise HTTPException(status_code=401, detail="Invalid workspace, API, or session key")
