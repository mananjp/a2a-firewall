"""add identity delegation telemetry tables

Revision ID: 002
Revises: 001
Create Date: 2026-07-15
"""
from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspace_identities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("root_public_key", sa.String, nullable=False),
        sa.Column("root_hmac_key_hash", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "agent_identities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("public_key", sa.String, nullable=False),
        sa.Column("card_signature", sa.Text, nullable=False),
        sa.Column("card_issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("card_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "delegation_chains",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("receiver_agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("delegation_depth", sa.Integer, nullable=False, server_default="0"),
        sa.Column("caveats", JSONB, nullable=False, server_default="[]"),
        sa.Column("delegation_token", sa.Text, nullable=False),
        sa.Column("signature_valid", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("chain_hash", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_delegation_chains_task", "delegation_chains", ["task_id"])
    op.create_index("idx_delegation_chains_workspace", "delegation_chains", ["workspace_id", "created_at"])

    op.create_table(
        "telemetry_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("event_id", sa.String, nullable=False, unique=True),
        sa.Column("event_type", sa.String, nullable=False),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id"), nullable=True),
        sa.Column("receiver_agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id"), nullable=True),
        sa.Column("task_type", sa.String, nullable=True),
        sa.Column("decision", sa.String, nullable=True),
        sa.Column("risk_score", sa.Float, default=0.0),
        sa.Column("violations", JSONB, default=list),
        sa.Column("delegation_chain", JSONB, default=list),
        sa.Column("delegation_depth", sa.Integer, default=0),
        sa.Column("message_hash", sa.String, nullable=True),
        sa.Column("chain_hash", sa.String, nullable=True),
        sa.Column("signature_valid", sa.Boolean, nullable=True),
        sa.Column("cipher_suite", sa.String, default="TLS_AES_256_GCM_SHA384"),
        sa.Column("key_exchange", sa.String, default="X25519Kyber768"),
        sa.Column("otel_trace_id", sa.String, nullable=True),
        sa.Column("otel_span_id", sa.String, nullable=True),
        sa.Column("latency_ms", sa.Integer, default=0),
        sa.Column("groq_called", sa.Boolean, default=False),
        sa.Column("groq_rationale", sa.Text, nullable=True),
        sa.Column("payload_snapshot", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_telemetry_events_workspace", "telemetry_events", ["workspace_id", "created_at"])
    op.create_index("idx_telemetry_events_type", "telemetry_events", ["event_type"])
    op.create_index("idx_telemetry_events_sender", "telemetry_events", ["sender_agent_id"])


def downgrade() -> None:
    op.drop_table("telemetry_events")
    op.drop_table("delegation_chains")
    op.drop_table("agent_identities")
    op.drop_table("workspace_identities")
