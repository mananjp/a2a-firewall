"""security expansion: CVE, SOC, IPS, compliance tables and columns

Revision ID: 006
Revises: 005
Create Date: 2026-08-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── New columns on existing tables ──

    # Workspace: jurisdiction, industry, compliance_frameworks, ips_mode
    op.add_column("workspaces", sa.Column("jurisdiction", sa.String(), nullable=True))
    op.add_column("workspaces", sa.Column("industry", sa.String(), nullable=True))
    op.add_column(
        "workspaces",
        sa.Column("compliance_frameworks", JSONB, server_default="[]", nullable=True),
    )
    op.add_column(
        "workspaces",
        sa.Column("ips_mode", sa.String(), server_default="block", nullable=False),
    )

    # PolicyRule: framework_tag
    op.add_column("policy_rules", sa.Column("framework_tag", sa.String(), nullable=True))

    # DelegationChain: revoked_at
    op.add_column(
        "delegation_chains",
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── New tables ──

    # CVE cache
    op.create_table(
        "cve_cache",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("cve_id", sa.String(), nullable=False, unique=True),
        sa.Column("cvss_score", sa.Float(), default=0.0),
        sa.Column("severity", sa.String(), nullable=False, server_default="unknown"),
        sa.Column("vector_string", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("published_date", sa.String(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_cve_cache_cve_id", "cve_cache", ["cve_id"])

    # Agent software inventory
    op.create_table(
        "agent_software_inventory",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "agent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("agents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("component_name", sa.String(), nullable=False),
        sa.Column("component_version", sa.String(), nullable=False),
        sa.Column("cpe_string", sa.String(), nullable=True),
        sa.Column("last_scanned_at", sa.DateTime(timezone=True)),
    )

    # SOC alerts
    op.create_table(
        "soc_alerts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_violation_id",
            UUID(as_uuid=True),
            sa.ForeignKey("violations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "task_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("severity", sa.String(), nullable=False, server_default="P3"),
        sa.Column("status", sa.String(), nullable=False, server_default="new"),
        sa.Column("assigned_analyst", sa.String(), nullable=True),
        sa.Column("mitre_technique", sa.String(), nullable=True),
        sa.Column("chain_hash", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=False, server_default="Security Alert"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("details", JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )

    # Rule-to-MITRE mapping
    op.create_table(
        "rule_to_mitre_technique",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("rule_type", sa.String(), nullable=False, unique=True),
        sa.Column("mitre_technique_id", sa.String(), nullable=False),
        sa.Column("mitre_technique_name", sa.String(), nullable=True),
        sa.Column("mitre_tactic", sa.String(), nullable=True),
    )

    # Seed MITRE mapping
    op.execute("""
        INSERT INTO rule_to_mitre_technique (id, rule_type, mitre_technique_id, mitre_technique_name, mitre_tactic) VALUES
        (gen_random_uuid(), 'prompt_injection', 'T1059', 'Command and Scripting Interpreter', 'Execution'),
        (gen_random_uuid(), 'sql_injection', 'T1190', 'Exploit Public-Facing Application', 'Initial Access'),
        (gen_random_uuid(), 'confused_deputy_attempt', 'T1134', 'Access Token Manipulation', 'Privilege Escalation'),
        (gen_random_uuid(), 'known_vulnerable_component', 'T1195', 'Supply Chain Compromise', 'Initial Access'),
        (gen_random_uuid(), 'delegation_depth_exceeded', 'T1078', 'Valid Accounts', 'Persistence'),
        (gen_random_uuid(), 'invalid_delegation_token', 'T1550', 'Use Alternate Authentication Material', 'Defense Evasion'),
        (gen_random_uuid(), 'invalid_signature', 'T1557', 'Adversary-in-the-Middle', 'Credential Access'),
        (gen_random_uuid(), 'data_exfiltration', 'T1041', 'Exfiltration Over C2 Channel', 'Exfiltration'),
        (gen_random_uuid(), 'privilege_escalation', 'T1078', 'Valid Accounts', 'Privilege Escalation'),
        (gen_random_uuid(), 'social_engineering', 'T1564', 'Hide Artifacts', 'Defense Evasion'),
        (gen_random_uuid(), 'command_injection', 'T1059', 'Command and Scripting Interpreter', 'Execution'),
        (gen_random_uuid(), 'pii_exposure_credit_card', 'T1005', 'Data from Local System', 'Collection'),
        (gen_random_uuid(), 'pii_exposure_ssn', 'T1005', 'Data from Local System', 'Collection'),
        (gen_random_uuid(), 'pii_exposure_aadhaar', 'T1005', 'Data from Local System', 'Collection'),
        (gen_random_uuid(), 'high_value_transaction', 'T1657', 'Financial Theft', 'Impact'),
        (gen_random_uuid(), 'suspicious_beneficiary', 'T1657', 'Financial Theft', 'Impact'),
        (gen_random_uuid(), 'intent_drift', 'T1059', 'Command and Scripting Interpreter', 'Execution')
    """)

    # Agent violation counters
    op.create_table(
        "agent_violation_counters",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "agent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("agents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("violation_count", sa.Integer(), default=0),
        sa.Column("critical_count", sa.Integer(), default=0),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )

    # Compliance rule packs
    op.create_table(
        "compliance_rule_packs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("framework", sa.String(), nullable=False),
        sa.Column("version", sa.String(), server_default="1.0"),
        sa.Column("rules_count", sa.Integer(), default=0),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    # Update violations layer constraint to include new layer values
    op.execute("ALTER TABLE violations DROP CONSTRAINT IF EXISTS ck_violations_layer")
    op.execute(
        "ALTER TABLE violations ADD CONSTRAINT ck_violations_layer "
        "CHECK (layer IN ('schema', 'rule', 'semantic', 'policy', 'identity', 'delegation', 'preflight', 'cve', 'ips', 'compliance'))"
    )


def downgrade() -> None:
    op.drop_table("compliance_rule_packs")
    op.drop_table("agent_violation_counters")
    op.drop_table("rule_to_mitre_technique")
    op.drop_table("soc_alerts")
    op.drop_table("agent_software_inventory")
    op.drop_index("ix_cve_cache_cve_id", "cve_cache")
    op.drop_table("cve_cache")
    op.drop_column("delegation_chains", "revoked_at")
    op.drop_column("policy_rules", "framework_tag")
    op.drop_column("workspaces", "ips_mode")
    op.drop_column("workspaces", "compliance_frameworks")
    op.drop_column("workspaces", "industry")
    op.drop_column("workspaces", "jurisdiction")

    # Restore original violations layer constraint
    op.execute("ALTER TABLE violations DROP CONSTRAINT IF EXISTS ck_violations_layer")
    op.execute(
        "ALTER TABLE violations ADD CONSTRAINT ck_violations_layer "
        "CHECK (layer IN ('schema', 'rule', 'semantic', 'policy', 'identity', 'delegation', 'preflight'))"
    )
