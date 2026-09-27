from __future__ import annotations

import ssl
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING, Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from a2a_firewall.core.config import settings

if TYPE_CHECKING:
    pass


class Base(DeclarativeBase):
    pass


# Connection arguments for asyncpg.
# In transaction-pooling mode (e.g. Neon, PgBouncer, Supabase poolers),
# asyncpg's prepared statement cache should be disabled to prevent
# duplicate prepared statements and closed connection errors across pooler backends.
_connect_args: dict[str, Any] = {
    "statement_cache_size": 0,
    "prepared_statement_cache_size": 0,
}

# When the original DATABASE_URL contained ``sslmode=require`` (or similar),
# the config validator strips it from the DSN and sets DATABASE_SSL_REQUIRED.
# We honour that flag by passing an SSLContext through asyncpg's native
# ``connect_args`` so the connection is still encrypted.
if settings.DATABASE_SSL_REQUIRED:
    _connect_args["ssl"] = ssl.create_default_context()

_engine_kwargs: dict[str, Any] = {
    "echo": settings.DEBUG,
    "connect_args": _connect_args,
    "pool_pre_ping": settings.DATABASE_POOL_PRE_PING,
    "pool_recycle": settings.DATABASE_POOL_RECYCLE_SECONDS,
}

# QueuePool-specific options (not applicable to NullPool or SQLite memory)
if not settings.DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["pool_size"] = settings.DATABASE_POOL_SIZE
    _engine_kwargs["max_overflow"] = settings.DATABASE_MAX_OVERFLOW
    _engine_kwargs["pool_timeout"] = settings.DATABASE_POOL_TIMEOUT_SECONDS

engine = create_async_engine(
    settings.DATABASE_URL,
    **_engine_kwargs,
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
