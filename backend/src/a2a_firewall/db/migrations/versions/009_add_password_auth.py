"""Add password_hash column to workspaces table for production authentication.

Revision ID: 009
Revises: 008
"""

import sqlalchemy as sa
from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("password_hash", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("workspaces", "password_hash")
