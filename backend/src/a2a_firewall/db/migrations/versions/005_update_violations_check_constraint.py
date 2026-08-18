"""update ck_violations_layer check constraint

Revision ID: 005
Revises: 004
Create Date: 2026-08-18
"""

from __future__ import annotations

from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old check constraint and recreate with extended layer values
    op.execute("ALTER TABLE violations DROP CONSTRAINT IF EXISTS ck_violations_layer")
    op.execute(
        "ALTER TABLE violations ADD CONSTRAINT ck_violations_layer "
        "CHECK (layer IN ('schema', 'rule', 'semantic', 'policy', 'identity', 'delegation', 'preflight'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE violations DROP CONSTRAINT IF EXISTS ck_violations_layer")
    op.execute(
        "ALTER TABLE violations ADD CONSTRAINT ck_violations_layer "
        "CHECK (layer IN ('schema', 'rule', 'semantic', 'policy'))"
    )
