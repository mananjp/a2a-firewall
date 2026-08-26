"""enterprise governance: spend limits, rbac, audit logs, retention, network access, ip allowlist, scim

Revision ID: 008
Revises: 007
Create Date: 2026-08-26
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Spend limits & ledger ──
    op.create_table(
        "workspace_spend_limits",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("monthly_budget_usd", sa.Float(), nullable=False, server_default="1000.0"),
        sa.Column("token_budget", sa.Integer(), nullable=False, server_default="10000000"),
        sa.Column("current_spend_usd", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("current_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("hard_limit_action", sa.String(), nullable=False, server_default="block"),
        sa.Column("alert_threshold_pct", sa.Float(), nullable=False, server_default="80.0"),
        sa.Column("reset_day_of_month", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_reset_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "agent_spend_limits",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("monthly_budget_usd", sa.Float(), nullable=False, server_default="100.0"),
        sa.Column("token_budget", sa.Integer(), nullable=False, server_default="1000000"),
        sa.Column("current_spend_usd", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("current_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "spend_ledger",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("task_id", UUID(as_uuid=True), nullable=True),
        sa.Column("tokens_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("model_name", sa.String(), nullable=True),
        sa.Column("operation", sa.String(), nullable=False, server_default="inspect"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── 2. RBAC & workspace members ──
    op.create_table(
        "workspace_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="developer"),
        sa.Column("permissions", JSONB, server_default="[]", nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("scim_external_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "custom_roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("permissions", JSONB, server_default="[]", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── 3. Enterprise audit logs ──
    op.create_table(
        "audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", sa.String(), nullable=True),
        sa.Column("actor_email", sa.String(), nullable=False, server_default="system"),
        sa.Column("actor_type", sa.String(), nullable=False, server_default="user"),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("diff", JSONB, server_default="{}", nullable=False),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="success"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audit_logs_workspace_created", "audit_logs", ["workspace_id", "created_at"])

    # ── 4. Data retention policies ──
    op.create_table(
        "data_retention_policies",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("task_payload_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("telemetry_days", sa.Integer(), nullable=False, server_default="90"),
        sa.Column("violations_days", sa.Integer(), nullable=False, server_default="180"),
        sa.Column("soc_alerts_days", sa.Integer(), nullable=False, server_default="180"),
        sa.Column("audit_log_days", sa.Integer(), nullable=False, server_default="365"),
        sa.Column("auto_purge_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("scrub_pii_after_days", sa.Integer(), nullable=False, server_default="14"),
        sa.Column("last_purged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── 5. Network access rules & IP allowlist ──
    op.create_table(
        "network_access_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_cidr", sa.String(), nullable=False, server_default="0.0.0.0/0"),
        sa.Column("destination_agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=True),
        sa.Column("action", sa.String(), nullable=False, server_default="allow"),
        sa.Column("protocol", sa.String(), nullable=False, server_default="all"),
        sa.Column("port_range", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "ip_allowlist_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cidr_or_ip", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("scope", sa.String(), nullable=False, server_default="all"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── 6. SCIM tokens ──
    op.create_table(
        "scim_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False, server_default="Default SCIM Token"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("scim_tokens")
    op.drop_table("ip_allowlist_entries")
    op.drop_table("network_access_rules")
    op.drop_table("data_retention_policies")
    op.drop_table("audit_logs")
    op.drop_table("custom_roles")
    op.drop_table("workspace_members")
    op.drop_table("spend_ledger")
    op.drop_table("agent_spend_limits")
    op.drop_table("workspace_spend_limits")
