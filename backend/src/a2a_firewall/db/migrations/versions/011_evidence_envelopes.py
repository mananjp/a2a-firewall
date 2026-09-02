"""Add evidence_envelopes table for signed decision evidence.

Revision ID: 011
Revises: 010
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "evidence_envelopes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "task_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("decision_id", sa.String(), nullable=False),
        sa.Column("envelope_version", sa.String(), nullable=False, server_default="1.0"),
        sa.Column("final_action", sa.String(), nullable=False),
        sa.Column("risk_score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("envelope", JSONB(), nullable=False),
        sa.Column("signature", sa.Text(), nullable=False),
        sa.Column("signer_public_key", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_unique_constraint(
        "uq_evidence_envelopes_decision_id", "evidence_envelopes", ["decision_id"]
    )
    op.create_index("ix_evidence_envelopes_task_id", "evidence_envelopes", ["task_id"])
    op.create_index("ix_evidence_envelopes_created_at", "evidence_envelopes", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_evidence_envelopes_created_at", table_name="evidence_envelopes")
    op.drop_index("ix_evidence_envelopes_task_id", table_name="evidence_envelopes")
    op.drop_constraint("uq_evidence_envelopes_decision_id", "evidence_envelopes", type_="unique")
    op.drop_table("evidence_envelopes")
