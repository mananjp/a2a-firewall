"""Unit tests for database connection disconnect resilience and error recovery.

Verifies:
1. is_db_disconnect_error properly detects asyncpg ConnectionDoesNotExistError and Windows WinError 1236.
2. ResilientAsyncSession transparently catches connection drops and retries queries.
3. execute_query_safe recovers with a fresh session if the original connection was severed.
4. FastAPI exception handler returns 503 DATABASE_UNAVAILABLE for transient disconnects.
5. Sentry before_send filters out benign connection drop events.
"""

from __future__ import annotations

import socket
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import Request
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from a2a_firewall.db.database import (
    ResilientAsyncSession,
    execute_query_safe,
    is_db_disconnect_error,
)
from a2a_firewall.main import (
    connection_aborted_handler,
    connection_reset_handler,
    dbapi_exception_handler,
    gaierror_handler,
    os_error_handler,
)


class TestIsDbDisconnectError:
    def test_connection_aborted_winerror_1236(self):
        exc = ConnectionAbortedError(
            22, "The network connection was aborted by the local system", None, 1236, None
        )
        assert is_db_disconnect_error(exc) is True

    def test_connection_reset_error(self):
        exc = ConnectionResetError("Connection reset by peer")
        assert is_db_disconnect_error(exc) is True

    def test_broken_pipe_error(self):
        exc = BrokenPipeError("Broken pipe")
        assert is_db_disconnect_error(exc) is True

    def test_dbapi_error_wrapping_disconnect(self):
        orig = ConnectionAbortedError(
            1236, "The network connection was aborted by the local system"
        )
        dbapi_err = DBAPIError("SELECT 1", [], orig)
        assert is_db_disconnect_error(dbapi_err) is True

    def test_dbapi_error_with_connection_invalidated(self):
        dbapi_err = DBAPIError(
            "SELECT 1", [], Exception("database error"), connection_invalidated=True
        )
        assert is_db_disconnect_error(dbapi_err) is True

    def test_dbapi_error_with_string_marker(self):
        # Simulated asyncpg ConnectionDoesNotExistError message
        orig = Exception("connection was closed in the middle of operation")
        dbapi_err = DBAPIError("SELECT 1", [], orig)
        assert is_db_disconnect_error(dbapi_err) is True

    def test_asyncpg_connection_does_not_exist_error(self):
        """Exact reproduction of Sentry issue 151086578."""
        from asyncpg.exceptions import ConnectionDoesNotExistError

        exc = ConnectionDoesNotExistError("connection was closed in the middle of operation")
        assert is_db_disconnect_error(exc) is True

    def test_socket_gaierror_getaddrinfo_failed(self):
        """Exact reproduction of Sentry issue 151080159: DNS lookup failure for DB pooler."""
        exc = socket.gaierror(11001, "getaddrinfo failed")
        assert is_db_disconnect_error(exc) is True

    def test_connection_refused_error(self):
        exc = ConnectionRefusedError("Connection refused")
        assert is_db_disconnect_error(exc) is True

    def test_unrelated_errors_return_false(self):
        assert is_db_disconnect_error(ValueError("Invalid argument")) is False
        assert is_db_disconnect_error(KeyError("missing_key")) is False
        assert (
            is_db_disconnect_error(
                DBAPIError("SELECT 1", [], Exception("syntax error at or near 'FROM'"))
            )
            is False
        )


@pytest.mark.asyncio
class TestResilientAsyncSession:
    async def test_normal_query_succeeds(self):
        pytest.importorskip("aiosqlite")
        engine = create_async_engine("sqlite+aiosqlite:///:memory:", pool_pre_ping=True)
        session_factory = async_sessionmaker(
            engine, class_=ResilientAsyncSession, expire_on_commit=False
        )

        async with session_factory() as session:
            res = await session.execute(text("SELECT 123 as val"))
            assert res.scalar() == 123

        await engine.dispose()

    async def test_transient_disconnect_recovers_and_retries(self):
        pytest.importorskip("aiosqlite")
        engine = create_async_engine("sqlite+aiosqlite:///:memory:", pool_pre_ping=True)

        class BaseFailingSession(AsyncSession):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.fail_once = True

            async def execute(self, statement, *args, **kwargs):
                if self.fail_once:
                    self.fail_once = False
                    raise DBAPIError(
                        "SELECT 1",
                        [],
                        ConnectionAbortedError(
                            1236, "The network connection was aborted by the local system"
                        ),
                    )
                return await super().execute(statement, *args, **kwargs)

        class SimulatingResilientSession(ResilientAsyncSession, BaseFailingSession):
            pass

        session_factory = async_sessionmaker(
            engine, class_=SimulatingResilientSession, expire_on_commit=False
        )

        async with session_factory() as session:
            res = await session.execute(text("SELECT 456 as recovered_val"))
            assert res.scalar() == 456

        await engine.dispose()

    async def test_non_disconnect_error_is_not_retried(self):
        pytest.importorskip("aiosqlite")
        engine = create_async_engine("sqlite+aiosqlite:///:memory:", pool_pre_ping=True)
        session_factory = async_sessionmaker(
            engine, class_=ResilientAsyncSession, expire_on_commit=False
        )

        async with session_factory() as session:
            with pytest.raises(DBAPIError):
                await session.execute(text("SELECT INVALID SQL SYNTAX !!!"))

        await engine.dispose()


class TestDatabaseExports:
    """Verify that database symbols expected by scripts, tests, and workers are exported."""

    def test_async_session_maker_exported_from_database_module(self):
        from a2a_firewall.db.database import AsyncSessionLocal, async_session_maker

        assert async_session_maker is AsyncSessionLocal
        assert callable(async_session_maker)

    def test_async_session_maker_exported_from_db_package(self):
        from a2a_firewall.db import AsyncSessionLocal, async_session_maker

        assert async_session_maker is AsyncSessionLocal
        assert callable(async_session_maker)


@pytest.mark.asyncio
class TestExecuteQuerySafe:
    async def test_safe_query_recovers_with_fresh_session(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        mock_dead_session = AsyncMock(spec=AsyncSession)
        mock_dead_session.execute.side_effect = DBAPIError(
            "SELECT 1",
            [],
            Exception("connection was closed in the middle of operation"),
        )
        mock_dead_session.close = AsyncMock()

        mock_fresh_session = AsyncMock(spec=AsyncSession)
        mock_result = MagicMock()
        mock_result.scalar.return_value = 789
        mock_fresh_session.execute.return_value = mock_result

        class MockSessionContextManager:
            async def __aenter__(self) -> AsyncMock:
                return mock_fresh_session

            async def __aexit__(self, *args: object) -> None:
                pass

        import a2a_firewall.db.database as db_mod

        monkeypatch.setattr(db_mod, "AsyncSessionLocal", MockSessionContextManager)

        # Should execute safely by falling back to a fresh session from AsyncSessionLocal
        stmt = text("SELECT 789 as answer")
        res = await execute_query_safe(mock_dead_session, stmt, retry_delay=0.01)
        assert res.scalar() == 789
        assert mock_dead_session.close.called
        assert mock_fresh_session.execute.called


@pytest.mark.asyncio
class TestDbapiExceptionHandler:
    async def test_disconnect_returns_503_service_unavailable(self):
        orig = ConnectionAbortedError(
            1236, "The network connection was aborted by the local system"
        )
        dbapi_err = DBAPIError("SELECT 1", [], orig)

        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/v1/telemetry/events"

        response = await dbapi_exception_handler(mock_request, dbapi_err)
        assert response.status_code == 503
        assert response.headers.get("retry-after") == "1"

        import json

        body = json.loads(response.body)
        assert body["error"]["code"] == "DATABASE_UNAVAILABLE"

    async def test_other_dbapi_error_returns_500(self):
        orig = Exception("some internal syntax or constraint error")
        dbapi_err = DBAPIError("INSERT ...", [], orig)

        mock_request = MagicMock(spec=Request)
        mock_request.method = "POST"
        mock_request.url.path = "/v1/workspaces"

        response = await dbapi_exception_handler(mock_request, dbapi_err)
        assert response.status_code == 500

        import json

        body = json.loads(response.body)
        assert body["error"]["code"] == "DATABASE_ERROR"


@pytest.mark.asyncio
class TestConnectionAbortedHandler:
    """Tests for the ConnectionAbortedError handler (Sentry issue 151086544)."""

    async def test_winerror_1236_returns_503(self):
        """Exact reproduction of the reported Sentry error."""
        exc = ConnectionAbortedError(
            22, "The network connection was aborted by the local system", None, 1236, None
        )
        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/v1/telemetry/summary"

        response = await connection_aborted_handler(mock_request, exc)
        assert response.status_code == 503
        assert response.headers.get("retry-after") == "1"

        import json

        body = json.loads(response.body)
        assert body["error"]["code"] == "DATABASE_UNAVAILABLE"

    async def test_generic_connection_abort_returns_503(self):
        exc = ConnectionAbortedError("Connection aborted")
        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/v1/agents"

        response = await connection_aborted_handler(mock_request, exc)
        assert response.status_code == 503


@pytest.mark.asyncio
class TestConnectionResetHandler:
    async def test_connection_reset_returns_503(self):
        exc = ConnectionResetError("Connection reset by peer")
        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/v1/telemetry/events"

        response = await connection_reset_handler(mock_request, exc)
        assert response.status_code == 503
        assert response.headers.get("retry-after") == "1"

    async def test_winerror_10054_returns_503(self):
        exc = ConnectionResetError(
            10054, "An existing connection was forcibly closed by the remote host"
        )
        mock_request = MagicMock(spec=Request)
        mock_request.method = "POST"
        mock_request.url.path = "/v1/firewall/inspect"

        response = await connection_reset_handler(mock_request, exc)
        assert response.status_code == 503


@pytest.mark.asyncio
class TestGaierrorHandler:
    async def test_gaierror_returns_503(self):
        exc = socket.gaierror(11001, "getaddrinfo failed")
        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/v1/telemetry/events"

        response = await gaierror_handler(mock_request, exc)
        assert response.status_code == 503
        assert response.headers.get("retry-after") == "1"
        import json

        body = json.loads(response.body)
        assert body["error"]["code"] == "DATABASE_UNAVAILABLE"


@pytest.mark.asyncio
class TestOsErrorHandler:
    async def test_broken_pipe_returns_503(self):
        exc = BrokenPipeError("Broken pipe")
        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/v1/stats"

        response = await os_error_handler(mock_request, exc)
        assert response.status_code == 503

    async def test_unrelated_oserror_returns_500(self):
        exc = OSError("No such file or directory")
        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/v1/stats"

        response = await os_error_handler(mock_request, exc)
        assert response.status_code == 500

        import json

        body = json.loads(response.body)
        assert body["error"]["code"] == "INTERNAL_ERROR"


class TestSentryBeforeSendFilter:
    def test_sentry_filters_disconnect_events(self):
        import os

        from a2a_firewall.core.config import settings

        orig_dsn = settings.SENTRY_DSN
        orig_disabled = os.environ.get("SENTRY_DISABLED")
        try:
            settings.SENTRY_DSN = "https://mock@sentry.io/123"
            os.environ["SENTRY_DISABLED"] = "false"
            # Import and test the before_send logic
            import sentry_sdk

            init_mock = MagicMock()
            sentry_sdk.init = init_mock

            from a2a_firewall.core.sentry import setup_sentry

            setup_sentry()

            assert init_mock.called
            before_send_fn = init_mock.call_args.kwargs["before_send"]

            # Test event with ConnectionAbortedError exc_info
            exc = ConnectionAbortedError(
                1236, "The network connection was aborted by the local system"
            )
            hint = {"exc_info": (type(exc), exc, None)}
            event = {"message": "unhandled error"}
            filtered = before_send_fn(event, hint)
            assert filtered is None

            # Test log entry with connection was closed
            log_event = {
                "logentry": {"message": "Error: connection was closed in the middle of operation"}
            }
            filtered_log = before_send_fn(log_event, {})
            assert filtered_log is None

            # Test OpenTelemetry logger event is filtered (Sentry 151086542)
            otel_event = {
                "logger": "opentelemetry.sdk.trace.export",
                "logentry": {"message": "Exception while exporting Span batch."},
            }
            assert before_send_fn(otel_event, {}) is None

            # Test OTLP ReadTimeout exc_info is filtered
            otlp_timeout_exc = TimeoutError(
                "HTTPSConnectionPool(host='otlp-gateway-prod-ap-south-1.grafana.net', port=443): Read timed out. (read timeout=10)"
            )
            otlp_hint = {"exc_info": (type(otlp_timeout_exc), otlp_timeout_exc, None)}
            assert before_send_fn({"message": "error"}, otlp_hint) is None

            # Test exception values payload with span batch export failure
            otel_payload_event = {
                "exception": {
                    "values": [
                        {
                            "type": "ReadTimeout",
                            "value": "HTTPSConnectionPool(host='otlp-gateway-prod-ap-south-1.grafana.net', port=443): Read timed out. (read timeout=10)",
                            "module": "requests.exceptions",
                        }
                    ]
                }
            }
            assert before_send_fn(otel_payload_event, {}) is None

            # Test gaierror DNS failure is filtered (Sentry 151080159)
            gai_exc = socket.gaierror(11001, "getaddrinfo failed")
            gai_hint = {"exc_info": (type(gai_exc), gai_exc, None)}
            assert before_send_fn({"message": "error"}, gai_hint) is None

            gai_payload_event = {
                "exception": {
                    "values": [
                        {
                            "type": "gaierror",
                            "value": "[Errno 11001] getaddrinfo failed",
                            "module": "socket",
                        }
                    ]
                }
            }
            assert before_send_fn(gai_payload_event, {}) is None

            # Test standard unrelated error is preserved
            normal_exc = ValueError("Invalid parameter value")
            normal_hint = {"exc_info": (type(normal_exc), normal_exc, None)}
            normal_event = {"message": "validation error"}
            assert before_send_fn(normal_event, normal_hint) == normal_event

        finally:
            settings.SENTRY_DSN = orig_dsn
            if orig_disabled is not None:
                os.environ["SENTRY_DISABLED"] = orig_disabled
            else:
                os.environ.pop("SENTRY_DISABLED", None)
