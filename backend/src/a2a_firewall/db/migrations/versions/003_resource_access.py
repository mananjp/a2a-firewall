"""add resource_type, resource_id, action to tasks + resource_permissions table

Revision ID: 003
Revises: 002
Create Date: 2026-07-16
"""
from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("resource_type", sa.String, nullable=True))
    op.add_column("tasks", sa.Column("resource_id", sa.String, nullable=True))
    op.add_column("tasks", sa.Column("action", sa.String, nullable=True))

    op.create_table(
        "resource_permissions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resource_type", sa.String, nullable=False),
        sa.Column("action", sa.String, nullable=False),
        sa.Column("allowed", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_resource_permissions_agent", "resource_permissions", ["agent_id", "resource_type", "action"])


def downgrade() -> None:
    op.drop_table("resource_permissions")
    op.drop_column("tasks", "action")
    op.drop_column("tasks", "resource_id")
    op.drop_column("tasks", "resource_type")
