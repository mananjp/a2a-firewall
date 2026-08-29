from __future__ import annotations

from urllib.parse import parse_qs, urlsplit, urlunsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://test:test@localhost:5432/test"

    # Populated automatically by the validator below.
    DATABASE_SSL_REQUIRED: bool = False

    @model_validator(mode="after")
    def _fix_database_url_scheme(self) -> Settings:
        """Normalise the database URL for asyncpg.

        1. Rewrite ``postgresql://`` or ``postgres://`` → ``postgresql+asyncpg://`` so
           SQLAlchemy picks the async driver.
        2. Strip **all** query-string parameters from the DSN.  asyncpg
           does not understand libpq-style params (``sslmode``,
           ``channel_binding``, ``options``, …) and raises ``TypeError``
           for each one.  SSL is enforced via ``connect_args`` in
           ``database.py`` instead.
        """
        url = self.DATABASE_URL.strip().strip('"').strip("'")
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)

        parts = urlsplit(url)
        params = parse_qs(parts.query)

        # Detect SSL requirement from sslmode before we strip it.
        sslmode = params.get("sslmode", [None])[0]
        if sslmode and sslmode != "disable":
            self.DATABASE_SSL_REQUIRED = True

        # Enforce SSL for remote databases by default if not explicitly disabled.
        host = parts.hostname
        if (
            host
            and host not in ("localhost", "127.0.0.1", "db", "test", "0.0.0.0")  # nosec B104
            and sslmode != "disable"
        ):
            self.DATABASE_SSL_REQUIRED = True

        # Drop *all* query params – asyncpg doesn't accept any of them.
        self.DATABASE_URL = urlunsplit(parts._replace(query=""))
        return self

    GROQ_API_KEY: str = "test_key"
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    GROQ_TIMEOUT_SECONDS: float = 2.0
    GROQ_CACHE_TTL_SECONDS: int = 3600
    GROQ_CACHE_ENABLED: bool = True
    SECRET_KEY: str = "test-secret-key"
    API_KEY_SALT: str = "test-salt"
    DEBUG: bool = False
    ALLOWED_ORIGINS: str = "http://localhost:5173"
    MAX_PAYLOAD_BYTES: int = 102400
    DEFAULT_FAIL_MODE: str = "closed"
    WORKSPACE_DEFAULT_DENY: bool = True
    GROQ_THRESHOLD: float = 0.3
    BLOCK_THRESHOLD: float = 0.8
    REVIEW_THRESHOLD: float = 0.5
    WORKSPACE_RATE_LIMIT_PER_MIN: int = 1000
    AGENT_INSPECT_RATE_LIMIT_PER_MIN: int = 60
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_BACKEND: str = "memory"  # "memory" | "postgres"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://localhost:4318"
    OTEL_EXPORTER_OTLP_HEADERS: str = ""
    OTEL_SERVICE_NAME: str = "a2a-firewall"

    # Error tracking (Sentry, free tier). Leave SENTRY_DSN empty to disable.
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1
    SENTRY_ENVIRONMENT: str = "development"

    # Identity & Delegation
    IDENTITY_CARD_TTL_SECONDS: float = 86400.0  # 24h
    DELEGATION_MAX_DEPTH: int = 3
    DELEGATION_DEFAULT_EXPIRY_SECONDS: float = 3600.0  # 1h

    # Intent-binding
    INTENT_DRIFT_THRESHOLD: float = 0.7  # block if intent_drift_score > this

    # Security Expansion: CVE / CVSS
    NVD_API_KEY: str = ""  # optional NVD API key (increases rate limit)
    CVE_CVSS_THRESHOLD: float = 7.0  # minimum CVSS score to flag (High)

    # Security Expansion: IDS/IPS
    IPS_DEFAULT_MODE: str = "block"  # monitor | block | block_and_suspend
    IPS_AUTO_SUSPEND_THRESHOLD: int = 3  # critical violations before auto-suspend
    IPS_AUTO_SUSPEND_WINDOW_MINUTES: int = 10  # sliding window in minutes

    # Transparent proxy / system-wide redirection
    A2A_FW_MARK: int = 0xA2A1  # SO_MARK set on proxy's own sockets to avoid loop
    A2A_REDIRECT_ENABLED: bool = False  # install iptables PREROUTING REDIRECT
    A2A_INSPECT_ENABLED: bool = True  # route proxy traffic through full run_inspection pipeline
    A2A_DEFAULT_DRY_RUN: bool = True  # installer commands are no-ops unless forced off
    A2A_AGENT_UID: int | None = None  # OS uid of agent processes; scopes iptables REDIRECT


settings = Settings()
