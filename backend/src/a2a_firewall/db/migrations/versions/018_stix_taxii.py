"""018 – STIX/TAXII Threat Intelligence tables.

Creates:
  - threat_intel_collections: TAXII 2.1 collections per workspace
  - stix_objects:             Persisted STIX 2.1 objects in collections
  - threat_feeds:             External TAXII feed configurations

Revision ID: 018_stix_taxii
Revises: 017_billing_tier
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "018_stix_taxii"
down_revision = "017_billing_tier"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- TAXII Collections --
    op.create_table(
        "threat_intel_collections",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("collection_alias", sa.String, nullable=False),
        sa.Column("title", sa.String, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("can_read", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("can_write", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "idx_tic_workspace_alias",
        "threat_intel_collections",
        ["workspace_id", "collection_alias"],
        unique=True,
    )

    # -- STIX Objects --
    op.create_table(
        "stix_objects",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "collection_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("threat_intel_collections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("stix_id", sa.String, nullable=False),
        sa.Column("stix_type", sa.String, nullable=False),
        sa.Column("spec_version", sa.String, nullable=False, server_default="2.1"),
        sa.Column("stix_data", postgresql.JSONB, nullable=False),
        sa.Column("source", sa.String, nullable=False, server_default="internal"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_stix_objects_collection", "stix_objects", ["collection_id"])
    op.create_index("idx_stix_objects_stix_id", "stix_objects", ["stix_id"])
    op.create_index("idx_stix_objects_stix_type", "stix_objects", ["stix_type"])
    op.create_index("idx_stix_objects_created_at", "stix_objects", ["created_at"])
    op.create_index("idx_stix_objects_workspace", "stix_objects", ["workspace_id"])

    # -- External Threat Feeds --
    op.create_table(
        "threat_feeds",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("taxii_url", sa.String, nullable=False),
        sa.Column("api_root", sa.String, nullable=False),
        sa.Column("collection_id", sa.String, nullable=False),
        sa.Column("auth_type", sa.String, nullable=False, server_default="none"),
        sa.Column("auth_credentials", sa.Text, nullable=True),
        sa.Column("poll_interval_minutes", sa.Integer, nullable=False, server_default="60"),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("last_polled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_poll_status", sa.String, nullable=True),
        sa.Column("objects_received", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_threat_feeds_workspace", "threat_feeds", ["workspace_id"])


def downgrade() -> None:
    op.drop_table("threat_feeds")
    op.drop_table("stix_objects")
    op.drop_table("threat_intel_collections")
