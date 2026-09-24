"""Add review_callback_url to review_items.

Analyst review decisions can now POST a webhook back to the originating
workflow (e.g. n8n ``Wait`` node resumeUrl). The ``review_items`` table
gains a nullable ``review_callback_url`` column consumed by
``api/routes/review.py:decide_review``.

Revision ID: 015
Revises: 014
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "review_items",
        sa.Column("review_callback_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("review_items", "review_callback_url")
