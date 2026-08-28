"""Add rate_limit_counters table for distributed rate limiting.

Revision ID: 010
Revises: 009
"""

from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rate_limit_counters",
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_index(
        "ix_rate_limit_counters_updated_at",
        "rate_limit_counters",
        ["updated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_rate_limit_counters_updated_at", table_name="rate_limit_counters")
    op.drop_table("rate_limit_counters")
