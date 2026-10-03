import contextlib
import os
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient

# Ensure Sentry is disabled, OTEL SDK is disabled, and test mode is flagged during pytest runs
os.environ["SENTRY_DISABLED"] = "true"
os.environ["OTEL_SDK_DISABLED"] = "true"
os.environ["TESTING"] = "1"

from a2a_firewall.db.database import engine  # noqa: E402
from a2a_firewall.main import app  # noqa: E402


@pytest.fixture(autouse=True)
async def cleanup_db_engine() -> AsyncGenerator[None, None]:
    yield
    with contextlib.suppress(Exception):
        await engine.dispose()


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
