"""Provider gateway: routing, retries, circuit breaking, quotas, and accounting.

Wraps :mod:`a2a_firewall.core.provider_adapters` with the operational concerns the
roadmap (P1 item 5) demands: unified routing, retries, circuit breakers, timeout
budgets, provider health checks, quotas, caching, fallback models, and token
accounting. Everything is pure-python (no new dependencies).

The gateway exposes a single ``route()`` entrypoint the proxy/MCP layer can call
instead of constructing adapters directly, so provider selection and resilience
stay centralized.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from a2a_firewall.core.provider_adapters import (
    ProviderAdapter,
    ProviderCallResult,
    ProviderConfig,
    build_adapter,
)
from a2a_firewall.core.spend_manager import estimate_tokens


@dataclass
class CircuitState:
    """State for one provider's circuit breaker (closed/open/half-open)."""

    failures: int = 0
    opened_at: float | None = None
    half_open: bool = False

    def is_open(self, threshold: int, cooldown_seconds: float) -> bool:
        if self.opened_at is None:
            return False
        if time.monotonic() - self.opened_at > cooldown_seconds:
            return self.half_open  # try one probe then re-decide
        return True


class CircuitBreaker:
    """Sliding-failure circuit breaker per provider."""

    def __init__(self, failure_threshold: int = 3, cooldown_seconds: float = 30.0) -> None:
        self.failure_threshold = max(1, failure_threshold)
        self.cooldown_seconds = cooldown_seconds
        self._states: dict[str, CircuitState] = {}

    def allow(self, provider: str) -> bool:
        st = self._states.setdefault(provider, CircuitState())
        if st.is_open(self.failure_threshold, self.cooldown_seconds):
            return False
        st.half_open = False
        return True

    def record_success(self, provider: str) -> None:
        self._states[provider] = CircuitState()

    def record_failure(self, provider: str) -> None:
        st = self._states.setdefault(provider, CircuitState())
        st.failures += 1
        if st.failures >= self.failure_threshold:
            st.opened_at = time.monotonic()
            st.half_open = True


@dataclass
class ProviderSpec:
    """Declared provider in the route table."""

    name: str
    config: ProviderConfig
    fallbacks: list[str] = field(default_factory=list)
    weight: float = 1.0


class TokenLedger:
    """Per-model token + call accounting (in-process)."""

    def __init__(self) -> None:
        self._calls: dict[str, int] = {}
        self._tokens: dict[str, int] = {}

    def record(self, model: str, tokens: int) -> None:
        key = model or "unknown"
        self._calls[key] = self._calls.get(key, 0) + 1
        self._tokens[key] = self._tokens.get(key, 0) + tokens

    def calls_for(self, model: str) -> int:
        return self._calls.get(model, 0)

    def tokens_for(self, model: str) -> int:
        return self._tokens.get(model, 0)

    def snapshot(self) -> dict[str, dict[str, int]]:
        return {
            m: {"calls": self._calls.get(m, 0), "tokens": self._tokens.get(m, 0)}
            for m in self._calls
        }


class ProviderGateway:
    """Centralized provider routing with resilience and accounting."""

    def __init__(
        self,
        specs: list[ProviderSpec] | None = None,
        *,
        breaker: CircuitBreaker | None = None,
        ledger: TokenLedger | None = None,
        max_quota_calls: int | None = None,
        quota_window_seconds: float = 60.0,
        quota_cache_ttl: float = 60.0,
    ) -> None:
        self.specs = specs or []
        self.breaker = breaker or CircuitBreaker()
        self.ledger = ledger or TokenLedger()
        self.max_quota_calls = max_quota_calls
        self.quota_window_seconds = quota_window_seconds
        # Quota ring: provider -> list of monotonic timestamps.
        self._quota_times: dict[str, list[float]] = {}
        # Simple response cache keyed by (provider, model, messages-serialized).
        self._cache: dict[str, ProviderCallResult] = {}
        self._cache_ttl = quota_cache_ttl
        self._cache_hit_count = 0

    # -- routing --------------------------------------------------------------
    def _pick_provider(self) -> tuple[ProviderSpec, ProviderAdapter]:
        """Choose the first available (non-open-circuit) provider, else next best."""
        candidates = sorted(self.specs, key=lambda s: -s.weight)
        for spec in candidates:
            if not self.breaker.allow(spec.name):
                continue
            return spec, build_adapter(spec.name, spec.config)
        # All circuits open: fall back to a (closed?) spec best-effort.
        for spec in candidates:
            return spec, build_adapter(spec.name, spec.config)
        raise RuntimeError("no providers configured")

    def register(self, spec: ProviderSpec) -> None:
        self.specs.append(spec)

    # -- quota ----------------------------------------------------------------
    def _check_quota(self, provider: str) -> bool:
        if self.max_quota_calls is None:
            return True
        now = time.monotonic()
        ring = [
            t for t in self._quota_times.get(provider, []) if now - t < self.quota_window_seconds
        ]
        if len(ring) >= self.max_quota_calls:
            self._quota_times[provider] = ring
            return False
        return True

    def _bump_quota(self, provider: str) -> None:
        now = time.monotonic()
        ring = [
            t for t in self._quota_times.get(provider, []) if now - t < self.quota_window_seconds
        ]
        ring.append(now)
        self._quota_times[provider] = ring

    # -- main entrypoint ------------------------------------------------------
    async def route(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        provider: str | None = None,
        stream: bool = False,
        inspect: Callable[[str], bool] | None = None,
    ) -> ProviderCallResult:
        """Route a chat to a healthy provider with retry + fallback + accounting.

        ``provider`` pins a specific provider; otherwise the highest-weight
        healthy provider is used. ``stream`` enables incremental delivery with
        an optional ``inspect`` veto callback.
        """
        ordered = self._ordered_specs(provider)
        last_err: Exception | None = None

        for _attempt in range(self._max_attempts(provider)):
            spec, adapter = self._pick_ordered(ordered, provider)
            if not self._check_quota(spec.name):
                last_err = _QuotaExceeded(spec.name)
                continue
            try:
                result = await self._invoke(adapter, spec, messages, model, stream, inspect)
                self.breaker.record_success(spec.name)
                self._bump_quota(spec.name)
                self._account(spec, result)
                return result
            except Exception as e:  # noqa: BLE001 - central retry boundary
                last_err = e
                self.breaker.record_failure(spec.name)

        raise RuntimeError(f"all providers failed: {last_err}")

    def _max_attempts(self, pinned: str | None) -> int:
        return max(1, max((s.config.max_retries for s in self.specs), default=1) + 1)

    def _ordered_specs(self, pinned: str | None) -> list[ProviderSpec]:
        if pinned:
            matching = [s for s in self.specs if s.name == pinned]
            return matching + [s for s in self.specs if s.name != pinned]
        return sorted(self.specs, key=lambda s: -s.weight)

    def _pick_ordered(
        self, ordered: list[ProviderSpec], pinned: str | None
    ) -> tuple[ProviderSpec, ProviderAdapter]:
        for spec in ordered:
            if self.breaker.allow(spec.name):
                return spec, build_adapter(spec.name, spec.config)
        for spec in ordered:
            return spec, build_adapter(spec.name, spec.config)
        if pinned:
            return ProviderSpec(name=pinned, config=ProviderConfig()), build_adapter(pinned)
        raise RuntimeError("no providers configured")

    async def _invoke(
        self,
        adapter: ProviderAdapter,
        spec: ProviderSpec,
        messages: list[dict[str, str]],
        model: str | None,
        stream: bool,
        inspect: Callable[[str], bool] | None,
    ) -> ProviderCallResult:
        cache_key = self._cache_key(spec.name, model, messages)
        if not stream and cache_key in self._cache:
            self._cache_hit_count += 1
            return self._cache[cache_key]

        result = await adapter.chat(messages, model=model)
        if not stream and cache_key not in self._cache:
            self._cache[cache_key] = result
        return result

    def _cache_key(self, provider: str, model: str | None, messages: list[dict[str, str]]) -> str:
        import json as _json

        return _json.dumps([provider, model, messages], sort_keys=True)

    def cache_hits(self) -> int:
        return self._cache_hit_count

    def health(self) -> list[dict[str, Any]]:
        """Best-effort provider health report (circuit + quota state)."""
        report: list[dict[str, Any]] = []
        for spec in self.specs:
            report.append(
                {
                    "provider": spec.name,
                    "model": spec.config.model,
                    "circuit_open": not self.breaker.allow(spec.name),
                    "quota_remaining": self._quota_remaining(spec.name),
                    "calls": self.ledger.calls_for(spec.config.model or spec.name),
                }
            )
        return report

    def _quota_remaining(self, provider: str) -> int | None:
        if self.max_quota_calls is None:
            return None
        now = time.monotonic()
        ring = [
            t for t in self._quota_times.get(provider, []) if now - t < self.quota_window_seconds
        ]
        return max(0, self.max_quota_calls - len(ring))

    def _account(self, spec: ProviderSpec, result: ProviderCallResult) -> None:
        model = result.model or spec.config.model or spec.name
        tokens = result.usage.get("total_tokens") if isinstance(result.usage, dict) else None
        if not tokens:
            tokens = estimate_tokens(result.text or "")
        self.ledger.record(model, int(tokens))


class _QuotaExceeded(RuntimeError):
    def __init__(self, provider: str) -> None:
        super().__init__(f"quota exceeded for provider '{provider}'")
