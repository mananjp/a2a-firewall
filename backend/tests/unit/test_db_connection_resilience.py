from __future__ import annotations

from fastapi.testclient import TestClient

import a2a_firewall.main as main_mod
from a2a_firewall.core.config import settings
from a2a_firewall.db.database import _connect_args, engine
from a2a_firewall.main import app


def test_engine_has_pool_pre_ping_and_recycle() -> None:
    """Verify engine is configured with pessimistic disconnect handling."""
    assert engine.pool._pre_ping is True
    assert engine.pool._recycle == settings.DATABASE_POOL_RECYCLE_SECONDS
    assert _connect_args.get("statement_cache_size") == 0
    assert _connect_args.get("prepared_statement_cache_size") == 0


class _ClosedConnectionSession:
    """Simulates asyncpg raising InterfaceError('connection is closed')."""

    async def __aenter__(self) -> _ClosedConnectionSession:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def execute(self, *args: object, **kwargs: object) -> None:
        from asyncpg.exceptions import InterfaceError

        raise InterfaceError("connection is closed")


def test_middleware_gracefully_handles_database_disconnect() -> None:
    """Verify middleware does not crash when DB connection is closed during Bearer token lookup."""
    original = main_mod.AsyncSessionLocal
    main_mod.AsyncSessionLocal = _ClosedConnectionSession  # type: ignore[attr-defined,assignment]
    try:
        with TestClient(app) as client:
            # Client sends Bearer token to public bootstrap endpoint
            resp = client.get(
                "/v1/demo/bootstrap",
                headers={"Authorization": "Bearer stale_token_123"},
            )
        # Should NOT fail with 500 InterfaceError
        assert resp.status_code == 200
        assert "scenarios" in resp.json()
    finally:
        main_mod.AsyncSessionLocal = original  # type: ignore[attr-defined]
