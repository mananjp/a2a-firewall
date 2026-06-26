from __future__ import annotations

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://test:test@localhost:5432/test"

    @model_validator(mode="after")
    def _fix_database_url_scheme(self) -> Settings:
        """Render (and many PaaS providers) supply ``postgresql://`` URLs.

        SQLAlchemy's async engine requires the ``+asyncpg`` dialect suffix,
        so we transparently rewrite the scheme when it is missing.
        """
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            self.DATABASE_URL = url.replace("postgresql://", "postgresql+asyncpg://", 1)
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
    OTEL_SERVICE_NAME: str = "a2a-firewall"


settings = Settings()
