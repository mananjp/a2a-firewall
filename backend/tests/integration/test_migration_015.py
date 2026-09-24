"""Integration test: migration 015 applied to a live database.

CI runs ``alembic upgrade head`` against a Postgres service before the
integration suite, so this test is the guard that 015_review_callbacks
actually exists and the ``review_items.review_callback_url`` column is
present. Without it an up-to-date models.py + missing migration would
silently pass all endpoint tests.
"""

from __future__ import annotations

import os

import pytest
import sqlalchemy as sa

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def engine() -> sa.engine.Engine:
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set; integration tests skipped")
    sync_url = TEST_DATABASE_URL.replace("+asyncpg", "+psycopg")
    return sa.create_engine(sync_url)


def test_review_callback_url_column_exists(engine: sa.engine.Engine) -> None:
    with engine.connect() as conn:
        cols = sa.inspect(conn).get_columns("review_items")
        names = {c["name"] for c in cols}
        assert "review_callback_url" in names, (
            "review_items.review_callback_url missing — migration 015 not applied"
        )
        col = next(c for c in cols if c["name"] == "review_callback_url")
        assert col["nullable"] is True
