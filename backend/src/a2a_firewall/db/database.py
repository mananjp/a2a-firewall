import asyncio
import contextlib
import logging
import os
import ssl
import sys
from collections.abc import AsyncGenerator, Mapping
from typing import TYPE_CHECKING, Any

from sqlalchemy.engine import Result
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from a2a_firewall.core.config import settings

logger = logging.getLogger("a2a_firewall.database")

if TYPE_CHECKING:
    pass


class Base(DeclarativeBase):
    pass


def is_db_disconnect_error(exc: BaseException) -> bool:
    """Return True if the exception indicates a dropped, aborted, or closed DB connection.

    Handles asyncpg ConnectionDoesNotExistError, Windows WinError 1236/10054 network aborts,
    and serverless database (Neon, AWS RDS, PgBouncer) connection drops.
    """
    if isinstance(
        exc,
        (
            ConnectionResetError,
            ConnectionAbortedError,
            BrokenPipeError,
        ),
    ):
        return True

    # Direct asyncpg exception type check (avoids relying solely on string matching)
    try:
        from asyncpg.exceptions import ConnectionDoesNotExistError, InterfaceError

        if isinstance(exc, (ConnectionDoesNotExistError, InterfaceError)):
            return True
    except ImportError:
        pass

    # Check underlying DBAPI or driver cause if wrapped in SQLAlchemy error
    orig = getattr(exc, "orig", None)
    if orig is not None and is_db_disconnect_error(orig):
        return True

    if getattr(exc, "connection_invalidated", False):
        return True

    # String signature matches across asyncpg, OS, and cloud database poolers
    msg = f"{type(exc).__name__}: {exc}".lower()
    disconnect_markers = (
        "connection was closed in the middle of operation",
        "connection does not exist",
        "connectiondoesnotexisterror",
        "the network connection was aborted",
        "connection is closed",
        "connection reset",
        "server closed the connection unexpectedly",
        "terminating connection due to administrator command",
        "cannot connect now",
        "winerror 1236",
        "winerror 10054",
        "remaining connection slots are reserved",
    )
    return any(marker in msg for marker in disconnect_markers)


class ResilientAsyncSession(AsyncSession):
    """An AsyncSession subclass that automatically recovers and retries idempotent queries
    when a serverless/cloud database connection is terminated or reset.
    """

    async def execute(  # type: ignore[override]
        self,
        statement: Any,
        params: Any = None,
        execution_options: Mapping[str, Any] | None = None,
        bind_arguments: dict[str, Any] | None = None,
        **kw: Any,
    ) -> Result[Any]:
        # Determine if statement is a read query safe for retry
        is_read = (
            getattr(statement, "is_select", False)
            or str(statement).strip().upper().startswith("SELECT")
            or str(statement).strip().upper().startswith("WITH")
        )
        max_retries = 2 if is_read else 1
        retry_delay = 0.25
        attempts = 0

        while True:
            try:
                exec_kw: dict[str, Any] = dict(kw)
                if execution_options is not None:
                    exec_kw["execution_options"] = execution_options
                if bind_arguments is not None:
                    exec_kw["bind_arguments"] = bind_arguments

                return await super().execute(  # type: ignore[no-any-return]
                    statement,
                    params=params,
                    **exec_kw,
                )
            except Exception as exc:
                attempts += 1
                if is_db_disconnect_error(exc) and attempts <= max_retries:
                    logger.warning(
                        "Database connection severed during query (attempt %d/%d): %s. "
                        "Reconnecting with fresh connection in %.2fs...",
                        attempts,
                        max_retries,
                        exc,
                        retry_delay,
                    )
                    with contextlib.suppress(Exception):
                        await self.rollback()
                    if retry_delay > 0:
                        await asyncio.sleep(retry_delay)
                    continue
                raise


async def execute_query_safe(
    db: AsyncSession,
    statement: Any,
    params: Any = None,
    execution_options: Mapping[str, Any] | None = None,
    *,
    max_retries: int = 2,
    retry_delay: float = 0.25,
) -> Result[Any]:
    """Execute a query on db session, falling back to a fresh session if the connection was severed."""
    try:
        if params is not None or execution_options is not None:
            return await db.execute(statement, params, execution_options=execution_options)  # type: ignore[arg-type]
        return await db.execute(statement)  # type: ignore[no-any-return]
    except Exception as exc:
        if not is_db_disconnect_error(exc) or max_retries <= 0:
            raise

        logger.warning(
            "Database connection severed during query (%s). Retrying with fresh session in %.2fs...",
            exc,
            retry_delay,
        )
        with contextlib.suppress(Exception):
            await db.close()

        for attempt in range(1, max_retries + 1):
            if retry_delay > 0:
                await asyncio.sleep(retry_delay)
            try:
                async with AsyncSessionLocal() as fresh_session:
                    if params is not None or execution_options is not None:
                        return await fresh_session.execute(
                            statement, params, execution_options=execution_options
                        )
                    return await fresh_session.execute(statement)
            except Exception as retry_exc:
                if is_db_disconnect_error(retry_exc) and attempt < max_retries:
                    logger.warning(
                        "Retry %d/%d failed with disconnect: %s; trying again...",
                        attempt,
                        max_retries,
                        retry_exc,
                    )
                    continue
                raise
        raise


# Connection arguments for asyncpg.
# In transaction-pooling mode (e.g. Neon, PgBouncer, Supabase poolers),
# asyncpg's prepared statement cache should be disabled to prevent
# duplicate prepared statements and closed connection errors across pooler backends.
_connect_args: dict[str, Any] = {
    "statement_cache_size": 0,
    "prepared_statement_cache_size": 0,
    "timeout": 30,
    "command_timeout": 60,
    "server_settings": {
        "idle_in_transaction_session_timeout": "60000",
    },
}

# When the original DATABASE_URL contained ``sslmode=require`` (or similar),
# the config validator strips it from the DSN and sets DATABASE_SSL_REQUIRED.
# We honour that flag by passing an SSLContext through asyncpg's native
# ``connect_args`` so the connection is still encrypted.
if settings.DATABASE_SSL_REQUIRED:
    _connect_args["ssl"] = ssl.create_default_context()

_engine_kwargs: dict[str, Any] = {
    "echo": settings.DEBUG,
    "pool_pre_ping": settings.DATABASE_POOL_PRE_PING,
    "pool_recycle": settings.DATABASE_POOL_RECYCLE_SECONDS,
}

_is_testing = (
    os.environ.get("TESTING", "").lower() in ("1", "true")
    or "pytest" in sys.modules
    or "PYTEST_CURRENT_TEST" in os.environ
)

if _is_testing:
    _engine_kwargs["poolclass"] = NullPool
elif not settings.DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = _connect_args
    _engine_kwargs["pool_size"] = settings.DATABASE_POOL_SIZE
    _engine_kwargs["max_overflow"] = settings.DATABASE_MAX_OVERFLOW
    _engine_kwargs["pool_timeout"] = settings.DATABASE_POOL_TIMEOUT_SECONDS

engine = create_async_engine(
    settings.DATABASE_URL,
    **_engine_kwargs,
)
AsyncSessionLocal = async_sessionmaker(engine, class_=ResilientAsyncSession, expire_on_commit=False)
async_session_maker = AsyncSessionLocal

__all__ = [
    "Base",
    "is_db_disconnect_error",
    "ResilientAsyncSession",
    "execute_query_safe",
    "engine",
    "AsyncSessionLocal",
    "async_session_maker",
    "get_db",
]


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception as exc:
            if is_db_disconnect_error(exc):
                logger.warning("Database session encountered disconnect: %s", exc)
            with contextlib.suppress(Exception):
                await session.rollback()
            raise
