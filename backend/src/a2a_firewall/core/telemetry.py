from __future__ import annotations

import contextlib
import os

from fastapi import FastAPI
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import get_tracer_provider

from a2a_firewall.core.config import settings


def setup_telemetry(app: FastAPI) -> None:
    """Initialize OpenTelemetry tracing and instrument the FastAPI app.

    Skipped when OTEL_SDK_DISABLED=true (used in tests/CI where the OTLP
    endpoint may be unreachable or instrumentation crashes against the
    installed starlette/fastapi version combo).
    """
    if os.environ.get("OTEL_SDK_DISABLED", "").lower() == "true":
        return

    provider = TracerProvider()
    try:
        exporter = OTLPSpanExporter(endpoint=f"{settings.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces")
        provider.add_span_processor(BatchSpanProcessor(exporter))
    except Exception:
        pass  # OTLP endpoint unreachable at startup; continue without export.

    if not isinstance(get_tracer_provider(), TracerProvider):
        from opentelemetry.trace import set_tracer_provider

        set_tracer_provider(provider)

    with contextlib.suppress(Exception):
        FastAPIInstrumentor.instrument_app(app)
    # If FastAPIInstrumentor crashes (version mismatch with starlette),
    # log and continue without it rather than 500-ing every request.
