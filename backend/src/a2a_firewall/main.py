from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from a2a_firewall.api.routes import (
    agents,
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
from a2a_firewall.core.telemetry import setup_telemetry

app = FastAPI(title="A2A Firewall", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

setup_telemetry(app)

app.include_router(workspaces.router, prefix="/v1/workspaces", tags=["workspaces"])
app.include_router(agents.router, prefix="/v1/agents", tags=["agents"])
app.include_router(schemas.router, prefix="/v1/schemas", tags=["schemas"])
app.include_router(firewall.router, prefix="/v1/firewall", tags=["firewall"])
app.include_router(tasks.router, prefix="/v1/tasks", tags=["tasks"])
app.include_router(violations.router, prefix="/v1/violations", tags=["violations"])
app.include_router(review.router, prefix="/v1/review", tags=["review"])
app.include_router(policies.router, prefix="/v1/policies", tags=["policies"])
app.include_router(stats.router, prefix="/v1/stats", tags=["stats"])


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok"}
