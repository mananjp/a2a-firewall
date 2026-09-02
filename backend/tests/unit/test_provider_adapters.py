"""Unit tests for provider adapters and the provider gateway."""

from __future__ import annotations

import json

import httpx
import pytest

from a2a_firewall.core.provider_adapters import (
    AnthropicAdapter,
    GroqAdapter,
    LocalAdapter,
    OpenAIAdapter,
    ProviderConfig,
    StreamingInspectBuffer,
    build_adapter,
)
from a2a_firewall.core.provider_gateway import (
    CircuitBreaker,
    ProviderGateway,
    ProviderSpec,
    TokenLedger,
)


def _openai_ok_transport() -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content or b"{}")
        if body.get("stream"):
            data_lines = [
                'data: {"choices":[{"delta":{"content":"Hello"}}]}',
                'data: {"choices":[{"delta":{"content":" world"}}]}',
                "data: [DONE]",
            ]
            payload = "\n".join(data_lines) + "\n"
            return httpx.Response(
                200, headers={"content-type": "text/event-stream"}, content=payload.encode()
            )
        return httpx.Response(
            200,
            json={
                "id": "x",
                "model": body.get("model", "m"),
                "choices": [{"message": {"content": "Hello world"}}],
                "usage": {"total_tokens": 7},
            },
        )

    return httpx.MockTransport(handler)


def _anthropic_ok_transport() -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "id": "m",
                "model": "claude-3-haiku",
                "content": [{"type": "text", "text": "From Claude"}],
                "usage": {"input_tokens": 4, "output_tokens": 3},
            },
        )

    return httpx.MockTransport(handler)


def _failing_transport(status: int = 503) -> httpx.MockTransport:
    return httpx.MockTransport(lambda request: httpx.Response(status, json={"error": "boom"}))


def _cfg(transport: httpx.MockTransport) -> ProviderConfig:
    return ProviderConfig(base_url="https://example.test/v1", transport=transport, model="m")


class TestAdapters:
    async def test_openai_wire_format_and_parse(self):
        adapter = OpenAIAdapter(_cfg(_openai_ok_transport()))
        result = await adapter.chat([{"role": "user", "content": "hi"}], model="gpt-4o")
        assert result.text == "Hello world"
        assert result.usage["total_tokens"] == 7
        await adapter.aclose()

    async def test_groq_is_openai_compatible(self):
        adapter = GroqAdapter(_cfg(_openai_ok_transport()))
        result = await adapter.chat([{"role": "user", "content": "hi"}])
        assert result.text == "Hello world"
        assert adapter.provider_name == "groq"
        await adapter.aclose()

    async def test_anthropic_separates_system_prompt(self):
        adapter = AnthropicAdapter(_cfg(_anthropic_ok_transport()))
        result = await adapter.chat(
            [
                {"role": "system", "content": "be safe"},
                {"role": "user", "content": "summarize"},
            ]
        )
        assert result.text == "From Claude"
        assert result.model == "claude-3-haiku"
        await adapter.aclose()

    async def test_local_parse(self):
        adapter = LocalAdapter(_cfg(_openai_ok_transport()))
        result = await adapter.chat([{"role": "user", "content": "hi"}])
        assert result.text == "Hello world"
        await adapter.aclose()

    def test_build_adapter_factory(self):
        assert isinstance(build_adapter("openai"), OpenAIAdapter)
        assert isinstance(build_adapter("anthropic"), AnthropicAdapter)
        assert isinstance(build_adapter("groq"), GroqAdapter)
        assert isinstance(build_adapter("local"), LocalAdapter)
        assert isinstance(build_adapter("unknown"), OpenAIAdapter)


class TestStreamingInspectBuffer:
    def test_flushes_with_holdback(self):
        buf = StreamingInspectBuffer(inspect=lambda s: True, holdback_chars=5)
        assert buf.accept("hello ")
        assert buf.accept("world ")
        delivered, tail = buf.finalize()
        assert "hello world " in delivered

    def test_veto_in_overflow_stops_stream(self):
        # Zero holdback inspects every chunk immediately → a veto aborts the stream.
        buf = StreamingInspectBuffer(inspect=lambda s: "SECRET" not in s, holdback_chars=0)
        assert buf.accept("safe")
        assert not buf.accept("SECRET")
        assert buf.rejected

    def test_veto_fires_when_marker_enters_inspected_overflow(self):
        # With a bounded holdback, a marker that fully lands in the inspected
        # overflow region aborts the stream; the holdback tail is still vetted.
        buf = StreamingInspectBuffer(inspect=lambda s: "SECRET" not in s, holdback_chars=2)
        buf.accept("ab")  # 2 chars == holdback → no overflow inspected yet
        # 13-char buffer → overflow is first 11 chars, which contain "SECRET".
        assert not buf.accept("SECRETlong")
        assert buf.rejected

    def test_finalize_vetoes_tail(self):
        buf = StreamingInspectBuffer(inspect=lambda s: "DEATH" not in s, holdback_chars=1000)
        buf.accept("safe prefix ")
        delivered, tail = buf.finalize()  # whole thing is still in buffer
        assert "DEATH" not in tail or buf.rejected

    def test_no_inspect_accepts_all(self):
        buf = StreamingInspectBuffer(inspect=None, holdback_chars=10)
        assert buf.accept("anything")
        delivered, tail = buf.finalize()
        assert delivered == "anything"


class TestCircuitBreaker:
    def test_opens_after_threshold(self):
        cb = CircuitBreaker(failure_threshold=2, cooldown_seconds=3600)
        cb.record_failure("openai")
        cb.record_failure("openai")
        assert not cb.allow("openai")

    def test_success_resets(self):
        cb = CircuitBreaker(failure_threshold=2, cooldown_seconds=3600)
        cb.record_failure("openai")
        cb.record_failure("openai")
        cb.record_success("openai")
        assert cb.allow("openai")


class TestTokenLedger:
    def test_counts_calls_and_tokens(self):
        ledger = TokenLedger()
        ledger.record("gpt-4o", 100)
        ledger.record("gpt-4o", 50)
        assert ledger.calls_for("gpt-4o") == 2
        assert ledger.tokens_for("gpt-4o") == 150
        snap = ledger.snapshot()
        assert snap["gpt-4o"]["tokens"] == 150


class TestProviderGateway:
    async def test_routes_and_accounts(self):
        gateway = ProviderGateway(
            [ProviderSpec(name="openai", config=_cfg(_openai_ok_transport()), weight=2.0)]
        )
        result = await gateway.route([{"role": "user", "content": "hi"}], model="gpt-4o")
        assert result.text == "Hello world"
        assert gateway.ledger.tokens_for("gpt-4o") > 0  # from usage total_tokens

    async def test_quota_blocked(self):
        gateway = ProviderGateway(
            [ProviderSpec(name="openai", config=_cfg(_openai_ok_transport()))],
            max_quota_calls=1,
            quota_window_seconds=3600,
        )
        await gateway.route([{"role": "user", "content": "a"}])
        with pytest.raises(RuntimeError):
            await gateway.route([{"role": "user", "content": "a"}])

    async def test_circuit_breaker_triggers_fallback(self):
        gateway = ProviderGateway(
            [
                ProviderSpec(
                    name="openai", config=_cfg(_failing_transport()), weight=2.0, fallbacks=["groq"]
                ),
                ProviderSpec(name="groq", config=_cfg(_openai_ok_transport())),
            ],
            breaker=CircuitBreaker(failure_threshold=1, cooldown_seconds=3600),
        )
        result = await gateway.route([{"role": "user", "content": "hi"}])
        assert result.text == "Hello world"

    def test_health_reports_state(self):
        gateway = ProviderGateway(
            [ProviderSpec(name="openai", config=_cfg(_openai_ok_transport()))]
        )
        report = gateway.health()
        assert report[0]["provider"] == "openai"
        assert report[0]["circuit_open"] is False

    async def test_cache_avoids_second_call(self):
        gateway = ProviderGateway(
            [ProviderSpec(name="openai", config=_cfg(_openai_ok_transport()))]
        )
        msgs = [{"role": "user", "content": "same"}]
        await gateway.route(msgs, model="m")
        await gateway.route(msgs, model="m")
        assert gateway.cache_hits() == 1
