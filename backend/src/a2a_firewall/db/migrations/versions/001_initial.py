"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-06-25
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table(
        "workspaces",
        sa.Column(
            "id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("admin_email", sa.Text(), nullable=False),
        sa.Column("api_key_hash", sa.Text(), nullable=False),
        sa.Column(
            "fail_mode",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'closed'"),
        ),
        sa.Column("groq_threshold", sa.Float(), nullable=False, server_default=sa.text("0.3")),
        sa.Column("block_threshold", sa.Float(), nullable=False, server_default=sa.text("0.8")),
        sa.Column("default_deny", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("admin_email"),
        sa.CheckConstraint("fail_mode IN ('open','closed')", name="ck_workspaces_fail_mode"),
    )

    op.create_table(
        "agents",
        sa.Column(
            "id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("api_key_hash", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'active'")),
        sa.Column(
            "capabilities",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("workspace_id", "name"),
        sa.CheckConstraint("status IN ('active','suspended')", name="ck_agents_status"),
    )

    op.create_table(
        "task_schemas",
        sa.Column(
            "id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("task_type", sa.Text(), nullable=False),
        sa.Column("version", sa.Text(), nullable=False, server_default=sa.text("'v1'")),
        sa.Column("json_schema", postgresql.JSONB(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("TRUE")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("workspace_id", "task_type", "version"),
    )

    op.create_table(
        "agent_permissions",
        sa.Column(
            "id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sender_id", postgresql.UUID(), sa.ForeignKey("agents.id", ondelete="CASCADE")),
        sa.Column("receiver_id", postgresql.UUID(), sa.ForeignKey("agents.id", ondelete="CASCADE")),
        sa.Column("task_type", sa.Text()),
        sa.Column("allowed", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "policy_rules",
        sa.Column(
            "id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("sender_id", postgresql.UUID(), sa.ForeignKey("agents.id")),
        sa.Column("receiver_id", postgresql.UUID(), sa.ForeignKey("agents.id")),
        sa.Column("task_type", sa.Text()),
        sa.Column("condition_expr", postgresql.JSONB()),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("block_reason", sa.Text()),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("TRUE")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.CheckConstraint(
            "action IN ('allow','block','review','flag')", name="ck_policy_rules_action"
        ),
    )
    op.create_index(
        "idx_policy_rules_workspace_priority",
        "policy_rules",
        ["workspace_id", "priority"],
    )

    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(), primary_key=True),
        sa.Column(
            "workspace_id",
            postgresql.UUID(),
            sa.ForeignKey("workspaces.id"),
            nullable=False,
        ),
        sa.Column("root_task_id", postgresql.UUID(), nullable=False),
        sa.Column("parent_task_id", postgresql.UUID(), sa.ForeignKey("tasks.id")),
        sa.Column("depth", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("sender_id", postgresql.UUID(), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("receiver_id", postgresql.UUID(), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("task_type", sa.Text(), nullable=False),
        sa.Column("schema_version", sa.Text(), nullable=False, server_default=sa.text("'v1'")),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("payload_hash", sa.Text(), nullable=False),
        sa.Column("payload_size_bytes", sa.Integer(), nullable=False),
        sa.Column("risk_score", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("decision", sa.Text(), nullable=False),
        sa.Column("decision_reason", sa.Text()),
        sa.Column("matched_rule_id", postgresql.UUID(), sa.ForeignKey("policy_rules.id")),
        sa.Column("groq_called", sa.Boolean(), server_default=sa.text("FALSE")),
        sa.Column("groq_model", sa.Text()),
        sa.Column("groq_injection_detected", sa.Boolean()),
        sa.Column("groq_hallucination_flags", postgresql.JSONB()),
        sa.Column("groq_risk_delta", sa.Float()),
        sa.Column("groq_rationale", sa.Text()),
        sa.Column("groq_latency_ms", sa.Integer()),
        sa.Column("total_latency_ms", sa.Integer()),
        sa.Column("trace_id", sa.Text()),
        sa.Column("span_id", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.CheckConstraint(
            "decision IN ('allow','block','review','error')", name="ck_tasks_decision"
        ),
    )
    op.create_index("idx_tasks_workspace", "tasks", ["workspace_id", sa.text("created_at DESC")])
    op.create_index("idx_tasks_root", "tasks", ["root_task_id"])
    op.create_index("idx_tasks_parent", "tasks", ["parent_task_id"])
    op.create_index("idx_tasks_decision", "tasks", ["workspace_id", "decision"])

    op.create_table(
        "violations",
        sa.Column(
            "id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "workspace_id", postgresql.UUID(), sa.ForeignKey("workspaces.id"), nullable=False
        ),
        sa.Column("task_id", postgresql.UUID(), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("layer", sa.Text(), nullable=False),
        sa.Column("violation_type", sa.Text(), nullable=False),
        sa.Column("severity", sa.Text(), nullable=False),
        sa.Column("details", postgresql.JSONB(), nullable=False),
        sa.Column("resolved", sa.Boolean(), server_default=sa.text("FALSE")),
        sa.Column("resolved_by", sa.Text()),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.CheckConstraint(
            "layer IN ('schema','rule','semantic','policy')", name="ck_violations_layer"
        ),
        sa.CheckConstraint(
            "severity IN ('low','medium','high','critical')", name="ck_violations_severity"
        ),
    )
    op.create_index("idx_violations_task", "violations", ["task_id"])
    op.create_index(
        "idx_violations_workspace", "violations", ["workspace_id", sa.text("created_at DESC")]
    )

    op.create_table(
        "review_items",
        sa.Column(
            "id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "workspace_id", postgresql.UUID(), sa.ForeignKey("workspaces.id"), nullable=False
        ),
        sa.Column(
            "task_id",
            postgresql.UUID(),
            sa.ForeignKey("tasks.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("review_token", sa.Text(), nullable=False, unique=True),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("reviewer_notes", sa.Text()),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("on_expire", sa.Text(), nullable=False, server_default=sa.text("'block'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.CheckConstraint(
            "status IN ('pending','approved','rejected','expired')",
            name="ck_review_items_status",
        ),
        sa.CheckConstraint("on_expire IN ('allow','block')", name="ck_review_items_on_expire"),
    )

    op.create_table(
        "trace_events",
        sa.Column(
            "id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "workspace_id", postgresql.UUID(), sa.ForeignKey("workspaces.id"), nullable=False
        ),
        sa.Column("task_id", postgresql.UUID(), sa.ForeignKey("tasks.id")),
        sa.Column("trace_id", sa.Text(), nullable=False),
        sa.Column("span_id", sa.Text(), nullable=False),
        sa.Column("parent_span_id", sa.Text()),
        sa.Column("event_name", sa.Text(), nullable=False),
        sa.Column(
            "attributes", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column("duration_ms", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_trace_events_trace_id", "trace_events", ["trace_id"])


def downgrade() -> None:
    op.drop_index("idx_trace_events_trace_id", table_name="trace_events")
    op.drop_table("trace_events")
    op.drop_table("review_items")
    op.drop_index("idx_violations_workspace", table_name="violations")
    op.drop_index("idx_violations_task", table_name="violations")
    op.drop_table("violations")
    op.drop_index("idx_tasks_decision", table_name="tasks")
    op.drop_index("idx_tasks_parent", table_name="tasks")
    op.drop_index("idx_tasks_root", table_name="tasks")
    op.drop_index("idx_tasks_workspace", table_name="tasks")
    op.drop_table("tasks")
    op.drop_index("idx_policy_rules_workspace_priority", table_name="policy_rules")
    op.drop_table("policy_rules")
    op.drop_table("agent_permissions")
    op.drop_table("task_schemas")
    op.drop_table("agents")
    op.drop_table("workspaces")
