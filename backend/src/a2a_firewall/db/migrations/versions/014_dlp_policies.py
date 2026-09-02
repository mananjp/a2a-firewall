"""Add DLP policy table.

Tenant DLP rules binding a ``(data_class, destination)`` pair to an action
with optional purpose limitation. The ``DLPEngine`` consumes these rules from
the ``dlp_policies`` table (see ``core/dlp_engine.py``).

Revision ID: 014
Revises: 013
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dlp_policies",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("data_class", sa.String(), nullable=False),
        sa.Column("destination", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False, server_default="redact"),
        sa.Column("allowed_purposes", JSONB(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_dlp_policies_workspace_id", "dlp_policies", ["workspace_id"])
    op.create_index(
        "ix_dlp_policies_class_destination",
        "dlp_policies",
        ["workspace_id", "data_class", "destination"],
    )


def downgrade() -> None:
    op.drop_index("ix_dlp_policies_class_destination", table_name="dlp_policies")
    op.drop_index("ix_dlp_policies_workspace_id", table_name="dlp_policies")
    op.drop_table("dlp_policies")
