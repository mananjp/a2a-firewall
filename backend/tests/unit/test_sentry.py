from __future__ import annotations

import os

import pytest

from a2a_firewall.core.config import settings
from a2a_firewall.core.sentry import _explicitly_disabled, setup_sentry


def test_setup_sentry_noop_without_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(os.environ, "SENTRY_DISABLED", "")
    original = settings.SENTRY_DSN
    try:
        settings.SENTRY_DSN = ""
        assert setup_sentry() is False
    finally:
        settings.SENTRY_DSN = original


def test_setup_sentry_disabled_flag_forces_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(os.environ, "SENTRY_DISABLED", "true")
    original = settings.SENTRY_DSN
    try:
        settings.SENTRY_DSN = "https://abc@sentry.example.com/1"
        assert _explicitly_disabled() is True
        assert setup_sentry() is False
    finally:
        settings.SENTRY_DSN = original
        monkeypatch.delenv("SENTRY_DISABLED", raising=False)


def test_setup_sentry_enabled_with_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(os.environ, "SENTRY_DISABLED", "")
    original = settings.SENTRY_DSN
    try:
        settings.SENTRY_DSN = "https://abc123def456@sentry.example.com/12345"
        assert setup_sentry() is True
    finally:
        settings.SENTRY_DSN = original


def test_explicitly_disabled_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(os.environ, "SENTRY_DISABLED", "true")
    assert _explicitly_disabled() is True
    monkeypatch.setenv("SENTRY_DISABLED", "false")
    assert _explicitly_disabled() is False
