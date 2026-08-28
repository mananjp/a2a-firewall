"""Rate limiter with pluggable backends — in-memory (dev) or Postgres (production).

Two scopes:
- Per-workspace: applied as FastAPI middleware on /v1/* routes.
- Per-agent: applied at the start of run_inspection() for the inspect endpoint.

Backends:
- "memory" (default): Sliding-window counter in-memory. Fine for single-process dev.
- "postgres": Atomic counter rows with SELECT ... FOR UPDATE. Survives restarts,
  works across multiple workers/pods. Requires the 010_rate_limit_counters migration.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class RateLimiter:
    """Sliding-window rate limiter keyed by an arbitrary string identifier."""

    def __init__(self, max_per_window: int, window_seconds: float = 60.0) -> None:
        self.max_per_window = max_per_window
        self.window_seconds = window_seconds
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> tuple[bool, int]:
        """Check whether `key` is under the limit.

        Returns (allowed, current_count). current_count is the count after this
        call (incremented if allowed). When not allowed, count is the existing
        count and no timestamp is recorded.
        """
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            bucket = self._buckets[key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= self.max_per_window:
                return False, len(bucket)
            bucket.append(now)
            return True, len(bucket)

    def reset(self, key: str | None = None) -> None:
        """Clear a specific key's bucket (or all) — useful for tests."""
        with self._lock:
            if key is None:
                self._buckets.clear()
            else:
                self._buckets.pop(key, None)


class PostgresRateLimiter:
    """Postgres-backed rate limiter using atomic row-level counters.

    Uses a single row per key in the `rate_limit_counters` table.
    The counter resets when the current window has elapsed.

    This is safe across multiple workers because each check uses
    SELECT ... FOR UPDATE to serialize access per key.
    """

    def __init__(self, max_per_window: int, window_seconds: float = 60.0) -> None:
        self.max_per_window = max_per_window
        self.window_seconds = window_seconds

    async def check(self, key: str, db: AsyncSession) -> tuple[bool, int]:
        """Atomically check and increment the counter for `key`.

        Returns (allowed, current_count).
        """
        now = datetime.now(UTC)
        cutoff = now - timedelta(seconds=self.window_seconds)

        # Atomic upsert + check using raw SQL for correctness under concurrency
        result = await db.execute(
            text("""
                INSERT INTO rate_limit_counters (key, window_start, count, updated_at)
                VALUES (:key, :now, 1, :now)
                ON CONFLICT (key) DO UPDATE
                SET
                    count = CASE
                        WHEN rate_limit_counters.window_start < :cutoff THEN 1
                        ELSE rate_limit_counters.count + 1
                    END,
                    window_start = CASE
                        WHEN rate_limit_counters.window_start < :cutoff THEN :now
                        ELSE rate_limit_counters.window_start
                    END,
                    updated_at = :now
                RETURNING count
            """),
            {"key": key, "now": now, "cutoff": cutoff},
        )
        row = result.fetchone()
        count = row[0] if row else 1
        await db.commit()

        allowed = count <= self.max_per_window
        return allowed, count

    async def reset(self, key: str | None, db: AsyncSession) -> None:
        """Clear a specific key's counter (or all)."""
        if key is None:
            await db.execute(text("DELETE FROM rate_limit_counters"))
        else:
            await db.execute(
                text("DELETE FROM rate_limit_counters WHERE key = :key"),
                {"key": key},
            )
        await db.commit()


# Module-level limiters, configured from settings at import time.
# Replaced via configure() during app startup / test setup.
_workspace_limiter: RateLimiter | None = None
_agent_limiter: RateLimiter | None = None
_pg_workspace_limiter: PostgresRateLimiter | None = None
_pg_agent_limiter: PostgresRateLimiter | None = None
_backend: str = "memory"
_lock = threading.Lock()


def configure(
    workspace_max_per_min: int,
    agent_max_per_min: int,
    window_seconds: float = 60.0,
    backend: str = "memory",
) -> None:
    """Initialize module-level limiters. Safe to call multiple times."""
    global _workspace_limiter, _agent_limiter, _backend
    global _pg_workspace_limiter, _pg_agent_limiter
    with _lock:
        _backend = backend
        # Always create in-memory limiters (used as fast-path or fallback)
        _workspace_limiter = RateLimiter(workspace_max_per_min, window_seconds)
        _agent_limiter = RateLimiter(agent_max_per_min, window_seconds)

        if backend == "postgres":
            _pg_workspace_limiter = PostgresRateLimiter(workspace_max_per_min, window_seconds)
            _pg_agent_limiter = PostgresRateLimiter(agent_max_per_min, window_seconds)


def get_backend() -> str:
    """Return the currently configured backend ("memory" or "postgres")."""
    return _backend


def get_workspace_limiter() -> RateLimiter:
    if _workspace_limiter is None:
        configure(workspace_max_per_min=1000, agent_max_per_min=60)
    assert _workspace_limiter is not None
    return _workspace_limiter


def get_agent_limiter() -> RateLimiter:
    if _agent_limiter is None:
        configure(workspace_max_per_min=1000, agent_max_per_min=60)
    assert _agent_limiter is not None
    return _agent_limiter


def get_pg_workspace_limiter() -> PostgresRateLimiter | None:
    return _pg_workspace_limiter


def get_pg_agent_limiter() -> PostgresRateLimiter | None:
    return _pg_agent_limiter


def check_workspace(workspace_id: str) -> tuple[bool, int]:
    """Returns (allowed, current_count) for the workspace scope (in-memory)."""
    return get_workspace_limiter().check(workspace_id)


async def check_workspace_async(
    workspace_id: str, db: AsyncSession | None = None
) -> tuple[bool, int]:
    """Returns (allowed, current_count) for the workspace scope.

    Uses Postgres backend if configured and db session is provided,
    otherwise falls back to in-memory.
    """
    if _backend == "postgres" and db is not None and _pg_workspace_limiter is not None:
        return await _pg_workspace_limiter.check(workspace_id, db)
    return get_workspace_limiter().check(workspace_id)


def check_agent(agent_id: str) -> tuple[bool, int]:
    """Returns (allowed, current_count) for the agent scope (in-memory)."""
    return get_agent_limiter().check(agent_id)


async def check_agent_async(agent_id: str, db: AsyncSession | None = None) -> tuple[bool, int]:
    """Returns (allowed, current_count) for the agent scope.

    Uses Postgres backend if configured and db session is provided,
    otherwise falls back to in-memory.
    """
    if _backend == "postgres" and db is not None and _pg_agent_limiter is not None:
        return await _pg_agent_limiter.check(agent_id, db)
    return get_agent_limiter().check(agent_id)
