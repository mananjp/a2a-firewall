from __future__ import annotations

import logging

from a2a_firewall.core.config import settings

logger = logging.getLogger("a2a_firewall")


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
    from sentry_sdk.integrations.logging import LoggingIntegration

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

    return os.environ.get("SENTRY_DISABLED", "").lower() == "true"
