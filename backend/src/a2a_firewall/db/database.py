from __future__ import annotations

import ssl
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from a2a_firewall.core.config import settings

if TYPE_CHECKING:
    pass


class Base(DeclarativeBase):
    pass


# When the original DATABASE_URL contained ``sslmode=require`` (or similar),
# the config validator strips it from the DSN and sets DATABASE_SSL_REQUIRED.
# We honour that flag by passing an SSLContext through asyncpg's native
# ``connect_args`` so the connection is still encrypted.
_connect_args: dict = {}
if settings.DATABASE_SSL_REQUIRED:
    _connect_args["ssl"] = ssl.create_default_context()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args=_connect_args,
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
