"""add declared_intent and intent_drift_score to tasks

Revision ID: 004
Revises: 003
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("declared_intent", sa.Text, nullable=True))
    op.add_column("tasks", sa.Column("intent_drift_score", sa.Float, nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "intent_drift_score")
    op.drop_column("tasks", "declared_intent")
