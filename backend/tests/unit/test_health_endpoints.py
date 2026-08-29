from __future__ import annotations

from fastapi.testclient import TestClient

import a2a_firewall.main as main_mod
from a2a_firewall.main import app


def test_health_endpoint_ok() -> None:
    with TestClient(app) as client:
        resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.2.0"


class _HealthySession:
    async def __aenter__(self) -> _HealthySession:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def execute(self, *args: object, **kwargs: object) -> None:
        return None


class _BrokenSession:
    async def __aenter__(self) -> _BrokenSession:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def execute(self, *args: object, **kwargs: object) -> None:
        raise ConnectionError("db down")


def _request_ready(session_factory: type) -> dict[str, object]:
    original = main_mod.AsyncSessionLocal  # type: ignore[attr-defined]
    main_mod.AsyncSessionLocal = session_factory  # type: ignore[attr-defined,assignment]
    try:
        with TestClient(app) as client:
            resp = client.get("/ready")
        return {"status_code": resp.status_code, "body": resp.json()}
    finally:
        main_mod.AsyncSessionLocal = original  # type: ignore[attr-defined]


def test_ready_ok_when_database_up() -> None:
    result = _request_ready(_HealthySession)
    assert result["status_code"] == 200
    assert result["body"] == {"status": "ready", "checks": {"database": "ok"}}


def test_ready_503_when_database_down() -> None:
    result = _request_ready(_BrokenSession)
    assert result["status_code"] == 503
    assert result["body"]["status"] == "unavailable"  # type: ignore[index]
