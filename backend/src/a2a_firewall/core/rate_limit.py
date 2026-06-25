"""Lightweight in-memory rate limiter.

Two scopes:
- Per-workspace: applied as FastAPI middleware on /v1/* routes.
- Per-agent: applied at the start of run_inspection() for the inspect endpoint.

Both use a sliding-window counter (per-minute). Counts are in-memory only —
this is fine for MVP single-process deployments. For multi-worker / multi-pod
deployments, swap to Redis (deferred per plan: no Redis in this build).
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


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


# Module-level limiters, configured from settings at import time.
# Replaced via configure() during app startup / test setup.
_workspace_limiter: RateLimiter | None = None
_agent_limiter: RateLimiter | None = None
_lock = threading.Lock()


def configure(
    workspace_max_per_min: int,
    agent_max_per_min: int,
    window_seconds: float = 60.0,
) -> None:
    """Initialize module-level limiters. Safe to call multiple times."""
    global _workspace_limiter, _agent_limiter
    with _lock:
        _workspace_limiter = RateLimiter(workspace_max_per_min, window_seconds)
        _agent_limiter = RateLimiter(agent_max_per_min, window_seconds)


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


def check_workspace(workspace_id: str) -> tuple[bool, int]:
    """Returns (allowed, current_count) for the workspace scope."""
    return get_workspace_limiter().check(workspace_id)


def check_agent(agent_id: str) -> tuple[bool, int]:
    """Returns (allowed, current_count) for the agent scope."""
    return get_agent_limiter().check(agent_id)
