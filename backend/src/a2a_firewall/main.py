from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from a2a_firewall.api.routes import (
    agents,
    auth,
    demo,
    firewall,
    policies,
    review,
    schemas,
    stats,
    tasks,
    violations,
    workspaces,
)
from a2a_firewall.core.config import settings
from a2a_firewall.core.rate_limit import check_workspace
from a2a_firewall.core.rate_limit import configure as configure_rate_limit
from a2a_firewall.core.security import hash_api_key
from a2a_firewall.core.telemetry import setup_telemetry
from a2a_firewall.db.database import AsyncSessionLocal
from a2a_firewall.db.models import Agent, Workspace

app = FastAPI(title="A2A Firewall", version="0.1.0")

# Initialize rate limiters from settings BEFORE middleware setup.
if settings.RATE_LIMIT_ENABLED:
    configure_rate_limit(
        workspace_max_per_min=settings.WORKSPACE_RATE_LIMIT_PER_MIN,
        agent_max_per_min=settings.AGENT_INSPECT_RATE_LIMIT_PER_MIN,
    )


@app.middleware("http")
async def workspace_rate_limit_middleware(request: Request, call_next: Any) -> Any:
    """Per-workspace API rate limit. Skipped on /health and /docs.

    Resolves the Bearer token's workspace_id once per request. If the route
    doesn't carry a Bearer token (e.g. unauthenticated /v1/workspaces/register),
    the limit is keyed on the source IP.
    """
    if not settings.RATE_LIMIT_ENABLED:
        return await call_next(request)
    if not request.url.path.startswith("/v1/"):
        return await call_next(request)

    auth_header = request.headers.get("authorization", "")
    key: str | None = None
    if request.client is not None:
        key = f"ip:{request.client.host}"

    if auth_header.startswith("Bearer "):
        raw_key = auth_header.removeprefix("Bearer ").strip()
        key_hash = hash_api_key(raw_key)
        # Try workspace first (workspace key), fall back to agent, fall back to IP.
        async with AsyncSessionLocal() as session:
            ws = await session.execute(select(Workspace).where(Workspace.api_key_hash == key_hash))
            ws_row = ws.scalar_one_or_none()
            if ws_row is not None:
                key = f"ws:{ws_row.id}"
            else:
                ag = await session.execute(select(Agent).where(Agent.api_key_hash == key_hash))
                ag_row = ag.scalar_one_or_none()
                if ag_row is not None:
                    key = f"ws:{ag_row.workspace_id}"

    allowed, count = check_workspace(key if key is not None else "anon")
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={
                "error": {
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": "Workspace rate limit exceeded",
                    "details": {
                        "current_count": count,
                        "limit_per_min": settings.WORKSPACE_RATE_LIMIT_PER_MIN,
                    },
                }
            },
        )
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

setup_telemetry(app)

app.include_router(workspaces.router, prefix="/v1/workspaces", tags=["workspaces"])
app.include_router(auth.router, prefix="/v1/auth", tags=["auth"])
app.include_router(agents.router, prefix="/v1/agents", tags=["agents"])
app.include_router(schemas.router, prefix="/v1/schemas", tags=["schemas"])
app.include_router(firewall.router, prefix="/v1/firewall", tags=["firewall"])
app.include_router(tasks.router, prefix="/v1/tasks", tags=["tasks"])
app.include_router(violations.router, prefix="/v1/violations", tags=["violations"])
app.include_router(review.router, prefix="/v1/review", tags=["review"])
app.include_router(policies.router, prefix="/v1/policies", tags=["policies"])
app.include_router(stats.router, prefix="/v1/stats", tags=["stats"])
app.include_router(demo.router, prefix="/v1/demo", tags=["demo"])


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok"}
