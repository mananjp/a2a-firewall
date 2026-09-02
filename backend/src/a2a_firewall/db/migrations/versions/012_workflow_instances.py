"""Add workflow_instances table for stateful workflow security.

Revision ID: 012
Revises: 011
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workflow_instances",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "root_task_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("node_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("depth", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cumulative_risk", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("cumulative_exposure", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("distinct_agents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("anomalies", JSONB(), nullable=False, server_default="[]"),
        sa.Column("quarantined", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_unique_constraint(
        "uq_workflow_instances_root_task_id", "workflow_instances", ["root_task_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_workflow_instances_root_task_id", "workflow_instances", type_="unique")
    op.drop_table("workflow_instances")
