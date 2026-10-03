from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from a2a_firewall.core.config import settings

logger = logging.getLogger("a2a_firewall")

if TYPE_CHECKING:
    from sentry_sdk.types import Event, Hint


def setup_sentry() -> bool:
    """Initialize Sentry error tracking (free tier) if a DSN is configured.

    Returns True when Sentry was enabled, False when it was skipped (no
    ``SENTRY_DSN`` set, or ``SENTRY_DISABLED=true``). Skipping gracefully is
    intentional so local/dev/CI runs never depend on an external account.
    """
    dsn = (settings.SENTRY_DSN or "").strip()
    if not dsn or _explicitly_disabled():
        return False

    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration, ignore_logger

    # Ignore OpenTelemetry internal background loggers so transient external
    # exporter network timeouts (e.g. to Grafana OTLP gateway) don't trigger Sentry error alerts.
    ignore_logger("opentelemetry")
    ignore_logger("opentelemetry.*")
    ignore_logger("opentelemetry.sdk.trace.export")
    ignore_logger("opentelemetry.exporter.otlp")
    ignore_logger("opentelemetry.exporter.otlp.*")

    def before_send(event: Event, hint: Hint) -> Event | None:
        """Filter out benign asyncpg/SQLAlchemy connection teardown errors and OTLP exporter timeouts."""
        from a2a_firewall.db.database import is_db_disconnect_error

        # Filter out OpenTelemetry internal exporter loggers and events
        logger_name = str(event.get("logger") or "")
        if logger_name.startswith("opentelemetry"):
            return None

        if "exc_info" in hint and hint["exc_info"]:
            _, exc_val, _ = hint["exc_info"]
            if exc_val is not None:
                msg = str(exc_val)
                if "Event loop is closed" in msg or "loop is closed" in msg.lower():
                    return None
                if is_db_disconnect_error(exc_val):
                    return None
                if (
                    "read timed out" in msg.lower()
                    and ("otlp" in msg.lower() or "grafana" in msg.lower() or "trace" in msg.lower())
                ):
                    return None
                if "exporting span batch" in msg.lower():
                    return None

        logentry_obj: Any = event.get("logentry", {})
        logentry = str(logentry_obj.get("message", "")).lower()
        formatted = str(logentry_obj.get("formatted", "")).lower()
        combined_log = f"{logentry} {formatted}"
        if "event loop is closed" in combined_log or (
            "terminating connection" in combined_log and "closed" in combined_log
        ):
            return None
        if (
            "connection was closed in the middle of operation" in combined_log
            or "connectiondoesnotexisterror" in combined_log
            or "winerror 1236" in combined_log
        ):
            return None
        if (
            "exception while exporting span batch" in combined_log
            or "exporting span batch" in combined_log
            or (
                "read timed out" in combined_log
                and ("otlp" in combined_log or "grafana" in combined_log or "trace" in combined_log)
            )
        ):
            return None

        exc_obj: Any = event.get("exception", {})
        exc_values: list[dict[str, Any]] = (
            exc_obj.get("values", []) if isinstance(exc_obj, dict) else []
        )
        for exc_item in exc_values:
            val_str = str(exc_item.get("value", "")).lower()
            mod_str = str(exc_item.get("module", "")).lower()
            if "opentelemetry" in mod_str:
                return None
            if (
                "read timed out" in val_str
                and ("otlp" in val_str or "grafana" in val_str or "trace" in val_str)
            ) or "exporting span batch" in val_str:
                return None

        return event

    try:
        sentry_sdk.init(
            dsn=dsn,
            environment=settings.SENTRY_ENVIRONMENT,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            integrations=[
                FastApiIntegration(
                    transaction_style="endpoint",
                    failed_request_status_codes={*range(400, 600)},
                ),
                LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
            ],
            before_send=before_send,
            send_default_pii=False,
            release=None,  # set via SENTRY_RELEASE env/git-build hook if desired
        )
    except Exception:
        logger.warning("Failed to initialize Sentry; continuing without it", exc_info=True)
        return False

    logger.info("Sentry error tracking ACTIVE (env=%s)", settings.SENTRY_ENVIRONMENT)
    return True


def _explicitly_disabled() -> bool:
    import os

    return os.environ.get("SENTRY_DISABLED", "").lower() in ("true", "1")
