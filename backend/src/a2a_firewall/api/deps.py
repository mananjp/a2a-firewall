from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.core.config import settings
from a2a_firewall.core.jwt_auth import decode_access_token
from a2a_firewall.core.security import generate_api_key, hash_api_key
from a2a_firewall.db.database import execute_query_safe, get_db
from a2a_firewall.db.models import Account, AccountWorkspace, Agent, APIKeyRecord, Workspace


async def get_current_agent(
    authorization: str = Header(...),
    x_session_token: str | None = Header(None, alias="X-Session-Token"),
    x_workspace_key: str | None = Header(None, alias="X-Workspace-Key"),
    x_workspace_id: str | None = Header(None, alias="X-Workspace-Id"),
    x_agent_id: str | None = Header(None, alias="X-Agent-Id"),
    db: AsyncSession = Depends(get_db),
) -> Agent:
    """Resolve active agent via direct agent key, or fallback to workspace / session auth.

    This enables both:
    1. Direct autonomous AI agents calling inspection routes via their Agent API key (agt_...).
    2. Dashboard playground / sandbox / integrations calling inspection routes via
       Workspace API key (ws_...) or JWT session token.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth header")
    raw_key = authorization.removeprefix("Bearer ").strip()
    key_hash = hash_api_key(raw_key)

    # 1. Direct Agent API key lookup (fast path for agents & SDK)
    result = await db.execute(select(Agent).where(Agent.api_key_hash == key_hash))
    agent = result.scalar_one_or_none()
    if agent:
        if agent.status == "suspended":
            raise HTTPException(status_code=403, detail="Agent suspended")
        return agent

    # Normalize optional headers for direct function calls and tests
    tok_session = x_session_token if isinstance(x_session_token, str) else None
    key_workspace = x_workspace_key if isinstance(x_workspace_key, str) else None
    id_workspace = x_workspace_id if isinstance(x_workspace_id, str) else None
    id_agent = x_agent_id if isinstance(x_agent_id, str) else None

    # 2. Flexible resolution via Workspace or JWT session token (for Dashboard & Integrations)
    try:
        ws = await get_current_workspace(
            authorization=authorization,
            x_session_token=tok_session,
            x_workspace_key=key_workspace,
            x_workspace_id=id_workspace,
            db=db,
        )
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid API key") from None

    # 2a. If a specific agent was requested via X-Agent-Id
    if id_agent:
        try:
            ag_uuid = uuid.UUID(id_agent)
            ag_res = await db.execute(
                select(Agent).where(Agent.id == ag_uuid, Agent.workspace_id == ws.id)
            )
            specific = ag_res.scalar_one_or_none()
            if specific:
                if specific.status == "suspended":
                    raise HTTPException(status_code=403, detail="Agent suspended")
                return specific
        except (ValueError, TypeError):
            pass

    # 2b. Use first active agent in this workspace
    agent_res = await db.execute(
        select(Agent)
        .where(Agent.workspace_id == ws.id, Agent.status != "suspended")
        .order_by(Agent.created_at.asc())
    )
    agent = agent_res.scalars().first()
    if agent:
        return agent

    # 2c. Auto-provision a default agent if the workspace doesn't have one yet
    _, auto_hash = generate_api_key("ag")
    agent = Agent(
        workspace_id=ws.id,
        name="WorkspaceDefaultAgent",
        description="Auto-provisioned default agent for workspace & dashboard operations",
        api_key_hash=auto_hash,
        capabilities=["all"],
        status="active",
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
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
    result = await execute_query_safe(
        db, select(Workspace).where(Workspace.api_key_hash == key_hash)
    )
    ws = result.scalar_one_or_none()
    if isinstance(ws, Workspace):
        if x_workspace_id:
            try:
                if ws.id != uuid.UUID(x_workspace_id):
                    raise HTTPException(
                        status_code=403, detail="Workspace API key does not match X-Workspace-Id"
                    )
            except ValueError:
                raise HTTPException(
                    status_code=400, detail="Invalid X-Workspace-Id header format"
                ) from None
        return ws

    # 2. Try X-Workspace-Key if provided
    if x_workspace_key:
        x_hash = hash_api_key(x_workspace_key.strip())
        result = await execute_query_safe(
            db, select(Workspace).where(Workspace.api_key_hash == x_hash)
        )
        ws = result.scalar_one_or_none()
        if isinstance(ws, Workspace):
            if x_workspace_id:
                try:
                    if ws.id != uuid.UUID(x_workspace_id):
                        raise HTTPException(
                            status_code=403,
                            detail="Workspace API key does not match X-Workspace-Id",
                        )
                except ValueError:
                    raise HTTPException(
                        status_code=400, detail="Invalid X-Workspace-Id header format"
                    ) from None
            return ws

    # 3. Try decoding JWT session token (from X-Session-Token or raw_token)
    tokens_to_decode = []
    if x_session_token:
        tokens_to_decode.append(x_session_token.removeprefix("Bearer ").strip())
    tokens_to_decode.append(raw_token)

    for tok in tokens_to_decode:
        payload = decode_access_token(tok)
        if payload and ("sub" in payload or "email" in payload or "workspace_id" in payload):
            account_id: uuid.UUID | None = None
            if "sub" in payload and payload["sub"]:
                try:
                    account_id = uuid.UUID(payload["sub"])
                except (ValueError, TypeError):
                    account_id = None

            if not account_id and payload.get("email"):
                acc_by_email = await db.execute(
                    select(Account).where(Account.email == payload["email"])
                )
                acc_obj = acc_by_email.scalar_one_or_none()
                if acc_obj:
                    account_id = acc_obj.id

            # 3a. Explicit X-Workspace-Id header (scoped and validated to membership)
            if x_workspace_id:
                try:
                    ws_uuid = uuid.UUID(x_workspace_id)
                except (ValueError, TypeError):
                    raise HTTPException(
                        status_code=400, detail="Invalid X-Workspace-Id header format"
                    ) from None

                if account_id:
                    mem = await db.execute(
                        select(AccountWorkspace).where(
                            AccountWorkspace.account_id == account_id,
                            AccountWorkspace.workspace_id == ws_uuid,
                        )
                    )
                    if not mem.scalar_one_or_none():
                        raise HTTPException(
                            status_code=403, detail="Account does not belong to this workspace"
                        )
                    ws_res = await db.execute(select(Workspace).where(Workspace.id == ws_uuid))
                    ws = ws_res.scalar_one_or_none()
                    if ws:
                        return ws
                    raise HTTPException(status_code=404, detail="Workspace not found")
                else:
                    raise HTTPException(
                        status_code=403, detail="Account does not belong to this workspace"
                    )

            # 3b. Explicit workspace_id from JWT payload (verified against AccountWorkspace)
            if "workspace_id" in payload and payload["workspace_id"]:
                try:
                    ws_id = uuid.UUID(payload["workspace_id"])
                    if account_id:
                        mem = await db.execute(
                            select(AccountWorkspace).where(
                                AccountWorkspace.account_id == account_id,
                                AccountWorkspace.workspace_id == ws_id,
                            )
                        )
                        if mem.scalar_one_or_none():
                            ws_res = await db.execute(
                                select(Workspace).where(Workspace.id == ws_id)
                            )
                            ws = ws_res.scalar_one_or_none()
                            if ws:
                                return ws
                    else:
                        ws_res = await db.execute(select(Workspace).where(Workspace.id == ws_id))
                        ws = ws_res.scalar_one_or_none()
                        if ws:
                            return ws
                except (ValueError, TypeError):
                    pass

            # 3c. Join via AccountWorkspace (fallback to first owned/joined workspace)
            if account_id:
                try:
                    result = await db.execute(
                        select(Workspace)
                        .join(AccountWorkspace, AccountWorkspace.workspace_id == Workspace.id)
                        .where(AccountWorkspace.account_id == account_id)
                        .order_by(AccountWorkspace.created_at.asc())
                    )
                    ws = result.scalars().first()
                    if isinstance(ws, Workspace):
                        return ws
                except (ValueError, TypeError):
                    pass

            # 3d. Lookup by admin_email
            email = payload.get("email")
            if email:
                ws_by_email = await db.execute(
                    select(Workspace).where(Workspace.admin_email == email)
                )
                ws_obj = ws_by_email.scalar_one_or_none()
                if isinstance(ws_obj, Workspace):
                    return ws_obj

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
            if x_workspace_id:
                try:
                    if ws.id != uuid.UUID(x_workspace_id):
                        raise HTTPException(
                            status_code=403, detail="API key does not match X-Workspace-Id"
                        )
                except ValueError:
                    raise HTTPException(
                        status_code=400, detail="Invalid X-Workspace-Id header format"
                    ) from None
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
            if x_workspace_id:
                try:
                    if ws.id != uuid.UUID(x_workspace_id):
                        raise HTTPException(
                            status_code=403, detail="Agent key does not match X-Workspace-Id"
                        )
                except ValueError:
                    raise HTTPException(
                        status_code=400, detail="Invalid X-Workspace-Id header format"
                    ) from None
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
                if email == "admin@a2afirewall.dev" and settings.ENABLE_DEMO_PERSONAS:
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
            tier = (
                "enterprise"
                if (ws.admin_email == "admin@a2afirewall.dev" and settings.ENABLE_DEMO_PERSONAS)
                else "free"
            )
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
                    raise HTTPException(
                        status_code=400, detail="Invalid X-Workspace-Id header format"
                    ) from None
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
                    raise HTTPException(status_code=404, detail="Workspace not found")
                raise HTTPException(
                    status_code=403, detail="Account does not belong to this workspace"
                )
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
        except HTTPException:
            raise
        except Exception:
            pass

    key_hash = hash_api_key(raw_key)

    # 2. Try direct legacy Workspace API key
    result = await db.execute(select(Workspace).where(Workspace.api_key_hash == key_hash))
    ws = result.scalar_one_or_none()
    if ws:
        if x_workspace_id:
            try:
                if ws.id != uuid.UUID(x_workspace_id):
                    raise HTTPException(
                        status_code=403, detail="Workspace API key does not match X-Workspace-Id"
                    )
            except ValueError:
                raise HTTPException(
                    status_code=400, detail="Invalid X-Workspace-Id header format"
                ) from None
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
            if x_workspace_id:
                try:
                    if ws.id != uuid.UUID(x_workspace_id):
                        raise HTTPException(
                            status_code=403, detail="API key does not match X-Workspace-Id"
                        )
                except ValueError:
                    raise HTTPException(
                        status_code=400, detail="Invalid X-Workspace-Id header format"
                    ) from None
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
            if x_workspace_id:
                try:
                    if ws.id != uuid.UUID(x_workspace_id):
                        raise HTTPException(
                            status_code=403, detail="Agent key does not match X-Workspace-Id"
                        )
                except ValueError:
                    raise HTTPException(
                        status_code=400, detail="Invalid X-Workspace-Id header format"
                    ) from None
            return ws

    raise HTTPException(status_code=401, detail="Invalid workspace, API, or session key")
