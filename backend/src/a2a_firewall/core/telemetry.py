from __future__ import annotations

from fastapi import FastAPI
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import get_tracer_provider

from a2a_firewall.core.config import settings


def setup_telemetry(app: FastAPI) -> None:
    """Initialize OpenTelemetry tracing and instrument the FastAPI app."""
    provider = TracerProvider()
    exporter = OTLPSpanExporter(endpoint=f"{settings.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces")
    provider.add_span_processor(BatchSpanProcessor(exporter))

    if not isinstance(get_tracer_provider(), TracerProvider):
        from opentelemetry.trace import set_tracer_provider

        set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
