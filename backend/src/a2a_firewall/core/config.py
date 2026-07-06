from __future__ import annotations

import ssl
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

        1. Rewrite ``postgresql://`` → ``postgresql+asyncpg://`` so
           SQLAlchemy picks the async driver.
        2. Strip **all** query-string parameters from the DSN.  asyncpg
           does not understand libpq-style params (``sslmode``,
           ``channel_binding``, ``options``, …) and raises ``TypeError``
           for each one.  SSL is enforced via ``connect_args`` in
           ``database.py`` instead.
        """
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

        parts = urlsplit(url)
        params = parse_qs(parts.query)

        # Detect SSL requirement from sslmode before we strip it.
        sslmode = params.get("sslmode", [None])[0]
        if sslmode and sslmode != "disable":
            self.DATABASE_SSL_REQUIRED = True

        # Drop *all* query params – asyncpg doesn't accept any of them.
        self.DATABASE_URL = urlunsplit(parts._replace(query=""))
        return self

    GROQ_API_KEY: str = "test_key"
    GROQ_MODEL: str = "llama-3.1-8b-instant"
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
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://localhost:4318"
    OTEL_EXPORTER_OTLP_HEADERS: str = ""
    OTEL_SERVICE_NAME: str = "a2a-firewall"


settings = Settings()
