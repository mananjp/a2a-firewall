from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from a2a_firewall.api.routes import (
    agents,
    audit,
    auth,
    compliance,
    cve,
    delegation,
    demo,
    firewall,
    identity,
    ips,
    network,
    policies,
    rbac,
    retention,
    review,
    schemas,
    scim,
    simulation,
    soc,
    spend,
    stats,
    tasks,
    telemetry,
    violations,
    workspaces,
)
from a2a_firewall.core.config import settings
from a2a_firewall.core.network_security import check_ip_allowlist, extract_client_ip
from a2a_firewall.core.rate_limit import check_workspace
from a2a_firewall.core.rate_limit import configure as configure_rate_limit
from a2a_firewall.core.security import hash_api_key
from a2a_firewall.core.telemetry import setup_telemetry
from a2a_firewall.db.database import AsyncSessionLocal
from a2a_firewall.db.models import Agent, Workspace

logger = logging.getLogger("a2a_firewall")

app = FastAPI(title="A2A Firewall", version="0.2.0")

# Initialize rate limiters from settings BEFORE middleware setup.
if settings.RATE_LIMIT_ENABLED:
    configure_rate_limit(
        workspace_max_per_min=settings.WORKSPACE_RATE_LIMIT_PER_MIN,
        agent_max_per_min=settings.AGENT_INSPECT_RATE_LIMIT_PER_MIN,
        backend=settings.RATE_LIMIT_BACKEND,
    )
    logger.info("Rate limiter: backend=%s", settings.RATE_LIMIT_BACKEND)


@app.middleware("http")
async def security_and_rate_limit_middleware(request: Request, call_next: Any) -> Any:
    """Per-workspace API rate limit & IP allowlist enforcement. Skipped on /health and /docs."""
    path = request.url.path
    if not (path.startswith("/v1/") or path.startswith("/scim/v2/")):
        return await call_next(request)

    # Exclude open registration & dev auth from IP allowlist blocking
    is_public_endpoint = path in (
        "/v1/workspaces/register",
        "/v1/auth/register",
        "/v1/auth/login",
        "/v1/network/my-ip",
    )

    client_ip = extract_client_ip(request)
    auth_header = request.headers.get("authorization", "")
    key: str | None = f"ip:{client_ip}"
    ws_id = None

    if auth_header.startswith("Bearer "):
        raw_key = auth_header.removeprefix("Bearer ").strip()
        key_hash = hash_api_key(raw_key)
        # Try workspace first (workspace key), fall back to agent, fall back to IP.
        async with AsyncSessionLocal() as session:
            ws = await session.execute(select(Workspace).where(Workspace.api_key_hash == key_hash))
            ws_row = ws.scalar_one_or_none()
            if ws_row is not None:
                key = f"ws:{ws_row.id}"
                ws_id = ws_row.id
            else:
                ag = await session.execute(select(Agent).where(Agent.api_key_hash == key_hash))
                ag_row = ag.scalar_one_or_none()
                if ag_row is not None:
                    key = f"ws:{ag_row.workspace_id}"
                    ws_id = ag_row.workspace_id

            # Enforce IP Allowlist if workspace resolved and not public endpoint
            if ws_id and not is_public_endpoint:
                scope = "dashboard" if "dashboard" in path else "api"
                ip_check = await check_ip_allowlist(client_ip, ws_id, scope, session)
                if ip_check.get("enforced") and not ip_check.get("allowed"):
                    return JSONResponse(
                        status_code=403,
                        content={
                            "error": {
                                "code": "IP_FORBIDDEN",
                                "message": f"Access denied: client IP {client_ip} is not in the workspace allowlist",
                                "client_ip": client_ip,
                            }
                        },
                    )

    if settings.RATE_LIMIT_ENABLED:
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

# Startup status logging
_otel_disabled = os.environ.get("OTEL_SDK_DISABLED", "").lower() == "true"
logger.info("OpenTelemetry: %s", "DISABLED" if _otel_disabled else "ACTIVE")
logger.info(
    "Auth mode: %s",
    "DEV (email-only login enabled)" if settings.DEBUG else "PRODUCTION (password required)",
)

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
app.include_router(identity.router, prefix="/v1/identity", tags=["identity"])
app.include_router(delegation.router, prefix="/v1/delegation", tags=["delegation"])
app.include_router(telemetry.router, prefix="/v1/telemetry", tags=["telemetry"])
app.include_router(simulation.router, prefix="/v1/simulation", tags=["simulation"])
app.include_router(audit.router, prefix="/v1/audit", tags=["audit"])
# Security & Governance Expansion routes
app.include_router(soc.router, prefix="/v1/soc", tags=["soc"])
app.include_router(cve.router, prefix="/v1/cve", tags=["cve"])
app.include_router(compliance.router, prefix="/v1/compliance", tags=["compliance"])
app.include_router(ips.router, prefix="/v1/ips", tags=["ips"])
app.include_router(spend.router, prefix="/v1/spend", tags=["spend"])
app.include_router(rbac.router, prefix="/v1/rbac", tags=["rbac"])
app.include_router(scim.router, prefix="/scim/v2", tags=["scim"])
app.include_router(retention.router, prefix="/v1/retention", tags=["retention"])
app.include_router(network.router, prefix="/v1/network", tags=["network"])


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "version": "0.2.0"}
