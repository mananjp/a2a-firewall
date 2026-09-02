"""Add memory/RAG firewall tables.

Adds the shared-memory backing store and its audit trails:
  - memory_entries          (persisted post-inspection chunks, content-hash dedup)
  - memory_inspection_log   (audit of every write inspection: allow/redact/block)
  - memory_retrieval_log    (audit of every retrieval query)

Revision ID: 013
Revises: 012
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "memory_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(), nullable=False),
        sa.Column(
            "source_agent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("agents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("metadata", JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_memory_entries_content_hash", "memory_entries", ["content_hash"])
    op.create_index("ix_memory_entries_workspace_id", "memory_entries", ["workspace_id"])

    op.create_table(
        "memory_inspection_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "agent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("agents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("content_hash", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False, server_default="allow"),
        sa.Column("blocked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("findings", JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_memory_inspection_log_created_at", "memory_inspection_log", ["created_at"])

    op.create_table(
        "memory_retrieval_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "agent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("agents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("query_hash", sa.String(), nullable=False),
        sa.Column("query_preview", sa.String(), nullable=True),
        sa.Column("matched_entry_ids", JSONB(), nullable=False, server_default="[]"),
        sa.Column("result_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_memory_retrieval_log_query_hash", "memory_retrieval_log", ["query_hash"])


def downgrade() -> None:
    op.drop_index("ix_memory_retrieval_log_query_hash", table_name="memory_retrieval_log")
    op.drop_table("memory_retrieval_log")
    op.drop_index("ix_memory_inspection_log_created_at", table_name="memory_inspection_log")
    op.drop_table("memory_inspection_log")
    op.drop_index("ix_memory_entries_workspace_id", table_name="memory_entries")
    op.drop_index("ix_memory_entries_content_hash", table_name="memory_entries")
    op.drop_table("memory_entries")
