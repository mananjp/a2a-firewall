"""Provider adapters for the model gateway.

A small, dependency-light abstraction so the firewall can route LLM calls to
OpenAI-compatible, Anthropic, Groq, or local (non-streaming) providers through a
single governed interface. Everything here is pure code on top of :mod:`httpx`
— no SDK dependencies (free tier, per `cloudflare_session.md` P1 item 5).

Design
------
- :class:`ProviderAdapter` is an async ABC with three methods the gateway uses:
  ``chat()`` (one-shot), ``stream_chat()`` (incremental), and ``is_streaming()``.
- Concrete adapters translate the *internal* generic request shape into each
  provider's wire format and translate responses back into a common
  :class:`ProviderCallResult`. Only OpenAI and Anthropic corpus detail by shape;
  Groq is OpenAI-compatible; `LocalAdapter` is a captive/no-op harness.
- :class:`StreamingInspectBuffer` implements the roadmap's "incremental scanning
  with a bounded holdback buffer": inspection runs on held-back chunks of the
  streamed response while earlier chunks already flushed, so latency stays
  bounded and inspection can veto the tail.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import httpx


@dataclass
class ProviderCallResult:
    """Normalized outcome of a provider call."""

    text: str
    model: str | None = None
    usage: dict[str, Any] = field(default_factory=dict)
    raw: Any = None
    streamed: bool = False


@dataclass
class ProviderConfig:
    """Per-provider connection + governance knobs."""

    base_url: str = ""
    api_key: str = ""
    timeout_seconds: float = 30.0
    max_retries: int = 2
    model: str | None = None
    extra_headers: dict[str, str] = field(default_factory=dict)
    transport: Any = None  # httpx.BaseTransport for test injection


# Generic internal request shape for unified governance.
DEFAULT_MODEL = "openai/gpt-oss-120b"


class ProviderAdapter(ABC):
    """Abstract interface implemented by concrete model providers."""

    provider_name: str = "base"

    def __init__(self, config: ProviderConfig | None = None) -> None:
        self.config = config or ProviderConfig()
        transport = self.config.transport
        kwargs: dict[str, Any] = {
            "timeout": httpx.Timeout(self.config.timeout_seconds),
            "headers": self.config.extra_headers or {},
        }
        if transport is not None:
            kwargs["transport"] = transport
        self._client = httpx.AsyncClient(**kwargs)

    @abstractmethod
    def to_wire_request(
        self, *, messages: list[dict[str, str]], model: str | None, stream: bool
    ) -> dict[str, Any]:
        """Translate the internal messages list into the provider's request body."""
        raise NotImplementedError

    def parse_response(self, resp: httpx.Response) -> ProviderCallResult:
        """Translate a non-streaming provider response into a common result."""
        data = resp.json()
        text, usage, model = self._extract_json_completion(data)
        return ProviderCallResult(text=text, model=model, usage=usage, raw=data)

    @abstractmethod
    def _extract_json_completion(self, data: Any) -> tuple[str, dict[str, Any], str | None]:
        """Return (text, usage, model) from a parsed JSON provider response."""
        raise NotImplementedError

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
    ) -> ProviderCallResult:
        """Issue a one-shot (non-streaming) completion to the provider."""
        body = self.to_wire_request(
            messages=messages, model=model or self.config.model or DEFAULT_MODEL, stream=False
        )
        resp = await self._client.post(self._endpoint(), json=body)
        resp.raise_for_status()
        return self.parse_response(resp)

    async def aclose(self) -> None:
        await self._client.aclose()

    def _endpoint(self) -> str:
        url = self.config.base_url or self.default_endpoint()
        return url

    @abstractmethod
    def default_endpoint(self) -> str:
        raise NotImplementedError

    # Streaming support -------------------------------------------------------
    def is_streaming(self) -> bool:
        return True


class OpenAIAdapter(ProviderAdapter):
    """OpenAI Chat Completions (and OpenAI-compatible providers, incl. Groq)."""

    provider_name = "openai"

    def default_endpoint(self) -> str:
        return "https://api.openai.com/v1/chat/completions"

    def to_wire_request(
        self, *, messages: list[dict[str, str]], model: str | None, stream: bool
    ) -> dict[str, Any]:
        return {"model": model, "messages": messages, "stream": stream}

    def _extract_json_completion(self, data: Any) -> tuple[str, dict[str, Any], str | None]:
        text = ""
        if isinstance(data, dict):
            choices = data.get("choices") or []
            if choices:
                msg = choices[0].get("message") or {}
                text = msg.get("content") or ""
            usage = data.get("usage") or {}
            return text, usage, data.get("model")
        return text, {}, None

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        inspect: Callable[[str], bool] | None = None,
        holdback_chars: int = 256,
    ) -> ProviderCallResult:
        """Stream an OpenAI-compatible response with a bounded holdback buffer."""
        body = self.to_wire_request(
            messages=messages, model=model or self.config.model or DEFAULT_MODEL, stream=True
        )
        buffer = StreamingInspectBuffer(inspect=inspect, holdback_chars=holdback_chars)
        collected: list[str] = []
        async with self._client.stream("POST", self._endpoint(), json=body) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                chunk = _extract_openai_stream_piece(line)
                if not chunk:
                    continue
                if not buffer.accept(chunk):
                    break
                collected.append(chunk)
        text = "".join(collected)
        return ProviderCallResult(
            text=text, model=model or self.config.model or DEFAULT_MODEL, streamed=True
        )


def _extract_openai_stream_piece(line: str) -> str:
    """Return the text delta from an SSE ``data:`` chunk, or ``""``."""
    if not line.startswith("data:"):
        return ""
    payload = line[len("data:") :].strip()
    if payload in ("", "[DONE]"):
        return ""
    try:
        obj = json.loads(payload)
    except json.JSONDecodeError:
        return ""
    if isinstance(obj, dict):
        choices = obj.get("choices") or []
        if choices:
            delta = choices[0].get("delta") or {}
            if isinstance(delta, dict):
                return delta.get("content") or ""
    return ""


class GroqAdapter(OpenAIAdapter):
    """Groq uses the OpenAI wire format against its own base URL."""

    provider_name = "groq"

    def default_endpoint(self) -> str:
        return "https://api.groq.com/openai/v1/chat/completions"


class AnthropicAdapter(ProviderAdapter):
    """Anthropic Messages API."""

    provider_name = "anthropic"

    def default_endpoint(self) -> str:
        return "https://api.anthropic.com/v1/messages"

    def to_wire_request(
        self, *, messages: list[dict[str, str]], model: str | None, stream: bool
    ) -> dict[str, Any]:
        system = _join_system_prompts(messages)
        body: dict[str, Any] = {
            "model": model or self.config.model or DEFAULT_MODEL,
            "max_tokens": 1024,
            "stream": stream,
        }
        if system:
            body["system"] = system
        user_msgs: list[dict[str, str]] = []
        for m in messages:
            if m.get("role") == "system":
                continue
            user_msgs.append({"role": m.get("role", "user"), "content": m.get("content", "")})
        body["messages"] = user_msgs
        return body

    async def chat(
        self, messages: list[dict[str, str]], *, model: str | None = None
    ) -> ProviderCallResult:
        body = self.to_wire_request(
            messages=messages, model=model or self.config.model or DEFAULT_MODEL, stream=False
        )
        headers = {"x-api-key": self.config.api_key, "anthropic-version": "2023-06-01"}
        resp = await self._client.post(self._endpoint(), json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        text, usage, model_name = self._extract_json_completion(data)
        return ProviderCallResult(
            text=text, model=model_name or self.config.model, usage=usage, raw=data
        )

    def _extract_json_completion(self, data: Any) -> tuple[str, dict[str, Any], str | None]:
        text = ""
        if isinstance(data, dict):
            for block in data.get("content") or []:
                if isinstance(block, dict) and block.get("type") == "text":
                    text += block.get("text", "")
            usage = data.get("usage") or {}
            return text, usage, data.get("model")
        return text, {}, None


class LocalAdapter(ProviderAdapter):
    """Captive/local harness (SGLang-style OpenAI-compatible, or no-op resource)."""

    provider_name = "local"

    def default_endpoint(self) -> str:
        return "http://localhost:8000/v1/chat/completions"

    def to_wire_request(
        self, *, messages: list[dict[str, str]], model: str | None, stream: bool
    ) -> dict[str, Any]:
        return {
            "model": model or self.config.model or DEFAULT_MODEL,
            "messages": messages,
            "stream": stream,
        }

    def _extract_json_completion(self, data: Any) -> tuple[str, dict[str, Any], str | None]:
        if isinstance(data, dict):
            choices = data.get("choices") or []
            text = ""
            if choices:
                msg = choices[0].get("message") or {}
                text = msg.get("content") or ""
            return text, data.get("usage") or {}, data.get("model")
        return "", {}, None


def _join_system_prompts(messages: list[dict[str, str]]) -> str:
    return "\n".join(str(m.get("content", "")) for m in messages if m.get("role") == "system")


class StreamingInspectBuffer:
    """Incremental scan of a stream while holding back a bounded tail.

    The roadmap calls for "response streaming inspection with a bounded holdback
    buffer": we flush inspected early chunks immediately, but keep the last
    ``holdback_chars`` un-flushed so a late block can be vetoed before the agent
    sees the tail. ``accept(chunk)`` returns False to signal the caller that the
    stream should be aborted.
    """

    def __init__(
        self, inspect: Callable[[str], bool] | None = None, holdback_chars: int = 256
    ) -> None:
        self.inspect = inspect or (lambda _s: True)
        self.holdback_chars = max(0, holdback_chars)
        self._buf = ""
        self.flushed: str = ""
        self.rejected: bool = False

    def accept(self, chunk: str) -> bool:
        """Accept a streamed chunk; runs inspection on the shifted window."""
        self._buf += chunk
        if len(self._buf) <= self.holdback_chars:
            return True
        overflow = self._buf[: len(self._buf) - self.holdback_chars]
        self._buf = self._buf[len(overflow) :]
        if not self.inspect(overflow):
            self.rejected = True
            return False
        self.flushed += overflow
        return True

    def finalize(self) -> tuple[str, str]:
        """Return ``(deliverable_text, vetoed_tail)`` after the stream closes."""
        tail = self._buf
        verdict = self.inspect(tail)
        if not verdict:
            self.rejected = True
            return self.flushed, tail
        self.flushed += tail
        return self.flushed, ""


def build_adapter(provider: str, config: ProviderConfig | None = None) -> ProviderAdapter:
    """Factory mapping a provider name to its adapter instance."""
    key = provider.strip().lower()
    adapters: dict[str, type[ProviderAdapter]] = {
        "openai": OpenAIAdapter,
        "anthropic": AnthropicAdapter,
        "groq": GroqAdapter,
        "local": LocalAdapter,
    }
    cls = adapters.get(key, OpenAIAdapter)
    return cls(config)
