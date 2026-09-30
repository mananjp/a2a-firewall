"""Add SaaS Accounts, Multi-API Keys, and BYOK LLM Configuration.

Tables introduced:
- ``accounts``: User identity for self-serve signups, OAuth, and workspace ownership.
- ``account_workspaces``: N:M association between accounts and workspaces with roles.
- ``api_key_records``: Fine-grained multi-key records with custom names, prefixes, revocation, and last-used tracking.
- ``workspace_llm_configs``: Per-workspace LLM provider settings (BYOK) with encrypted API keys.

Revision ID: 016
Revises: 015
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Accounts
    op.create_table(
        "accounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("provider", sa.String(), nullable=False, server_default="email"),
        sa.Column("provider_user_id", sa.String(), nullable=True),
        sa.Column("full_name", sa.String(), nullable=True),
        sa.Column("avatar_url", sa.String(), nullable=True),
        sa.Column("tier", sa.String(), nullable=False, server_default="free"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_accounts_email", "accounts", ["email"], unique=True)

    # 2. Account-Workspaces membership
    op.create_table(
        "account_workspaces",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(), nullable=False, server_default="owner"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_account_workspaces_account_id", "account_workspaces", ["account_id"])
    op.create_index("ix_account_workspaces_workspace_id", "account_workspaces", ["workspace_id"])
    op.create_index(
        "ix_account_workspaces_unique",
        "account_workspaces",
        ["account_id", "workspace_id"],
        unique=True,
    )

    # 3. API Key Records
    op.create_table(
        "api_key_records",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False, server_default="Default Key"),
        sa.Column("key_prefix", sa.String(), nullable=False),
        sa.Column("key_hash", sa.String(), nullable=False),
        sa.Column(
            "created_by_account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_api_key_records_workspace_id", "api_key_records", ["workspace_id"])
    op.create_index("ix_api_key_records_key_hash", "api_key_records", ["key_hash"], unique=True)

    # 4. Workspace LLM Configs (BYOK)
    op.create_table(
        "workspace_llm_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(), nullable=False, server_default="groq"),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("base_url", sa.String(), nullable=True),
        sa.Column("api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("llm_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("timeout_seconds", sa.Float(), nullable=False, server_default="5.0"),
        sa.Column("cache_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_workspace_llm_configs_workspace_id",
        "workspace_llm_configs",
        ["workspace_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_workspace_llm_configs_workspace_id", table_name="workspace_llm_configs")
    op.drop_table("workspace_llm_configs")

    op.drop_index("ix_api_key_records_key_hash", table_name="api_key_records")
    op.drop_index("ix_api_key_records_workspace_id", table_name="api_key_records")
    op.drop_table("api_key_records")

    op.drop_index("ix_account_workspaces_unique", table_name="account_workspaces")
    op.drop_index("ix_account_workspaces_workspace_id", table_name="account_workspaces")
    op.drop_index("ix_account_workspaces_account_id", table_name="account_workspaces")
    op.drop_table("account_workspaces")

    op.drop_index("ix_accounts_email", table_name="accounts")
    op.drop_table("accounts")
