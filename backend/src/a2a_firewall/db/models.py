import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from a2a_firewall.db.database import Base


class Workspace(Base):
    __tablename__ = "workspaces"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    admin_email = Column(String, nullable=False, unique=True)
    api_key_hash = Column(String, nullable=False)
    password_hash = Column(String, nullable=True)  # Argon2id hash, nullable for legacy rows
    fail_mode = Column(String, default="closed")
    groq_threshold = Column(Float, default=0.3)
    block_threshold = Column(Float, default=0.8)
    review_threshold = Column(Float, default=0.5)
    default_deny = Column(Boolean, default=True)
    # Security expansion: compliance & IPS
    jurisdiction = Column(String, nullable=True)  # e.g. "IN", "EU", "US-CA"
    industry = Column(String, nullable=True)  # e.g. "banking", "healthcare"
    compliance_frameworks = Column(JSONB, default=list)  # e.g. ["RBI", "DPDP"]
    ips_mode = Column(String, default="block")  # monitor | block | block_and_suspend
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class Agent(Base):
    __tablename__ = "agents"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    name = Column(String, nullable=False)
    description = Column(Text)
    api_key_hash = Column(String, nullable=False)
    status = Column(String, default="active")
    capabilities = Column(JSONB, default=list)
    metadata_ = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class TaskSchema(Base):
    __tablename__ = "task_schemas"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    task_type = Column(String, nullable=False)
    version = Column(String, default="v1")
    json_schema = Column(JSONB, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class AgentPermission(Base):
    __tablename__ = "agent_permissions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    sender_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=True
    )
    receiver_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=True
    )
    task_type = Column(String, nullable=True)
    allowed = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class ResourcePermission(Base):
    __tablename__ = "resource_permissions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    resource_type = Column(String, nullable=False)
    action = Column(String, nullable=False)
    allowed = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class PolicyRule(Base):
    __tablename__ = "policy_rules"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    priority = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    sender_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True)
    receiver_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True)
    task_type = Column(String, nullable=True)
    condition_expr = Column(JSONB, nullable=True)
    action = Column(String, nullable=False)
    block_reason = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    framework_tag = Column(String, nullable=True)  # compliance framework, e.g. "RBI", "PCI-DSS"
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class Task(Base):
    __tablename__ = "tasks"
    id = Column(UUID(as_uuid=True), primary_key=True)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False)
    root_task_id = Column(UUID(as_uuid=True), nullable=False)
    parent_task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    depth = Column(Integer, default=0)
    sender_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    receiver_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    task_type = Column(String, nullable=False)
    schema_version = Column(String, default="v1")
    resource_type = Column(String, nullable=True)
    resource_id = Column(String, nullable=True)
    action = Column(String, nullable=True)
    payload = Column(JSONB, nullable=False)
    payload_hash = Column(String, nullable=False)
    payload_size_bytes = Column(Integer, nullable=False)
    risk_score = Column(Float, default=0.0)
    decision = Column(String, nullable=False)
    decision_reason = Column(Text)
    matched_rule_id = Column(UUID(as_uuid=True), ForeignKey("policy_rules.id"), nullable=True)
    groq_called = Column(Boolean, default=False)
    groq_model = Column(String, nullable=True)
    groq_injection_detected = Column(Boolean, nullable=True)
    groq_hallucination_flags = Column(JSONB, nullable=True)
    groq_risk_delta = Column(Float, nullable=True)
    groq_rationale = Column(Text, nullable=True)
    groq_latency_ms = Column(Integer, nullable=True)
    total_latency_ms = Column(Integer, nullable=True)
    trace_id = Column(String, nullable=True)
    span_id = Column(String, nullable=True)
    declared_intent = Column(Text, nullable=True)  # root task's purpose statement
    intent_drift_score = Column(Float, nullable=True)  # 0.0–1.0 semantic drift from root intent
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class Violation(Base):
    __tablename__ = "violations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    layer = Column(String, nullable=False)
    violation_type = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    details = Column(JSONB, nullable=False)
    resolved = Column(Boolean, default=False)
    resolved_by = Column(String, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class ReviewItem(Base):
    __tablename__ = "review_items"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), unique=True, nullable=False)
    review_token = Column(String, unique=True, nullable=False)
    status = Column(String, default="pending")
    reviewer_notes = Column(Text, nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    on_expire = Column(String, default="block")
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class TraceEvent(Base):
    __tablename__ = "trace_events"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    trace_id = Column(String, nullable=False)
    span_id = Column(String, nullable=False)
    parent_span_id = Column(String, nullable=True)
    event_name = Column(String, nullable=False)
    attributes = Column(JSONB, default=dict)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Identity & Delegation (new)
# ---------------------------------------------------------------------------


class AgentIdentity(Base):
    """Ed25519 identity record for each agent."""

    __tablename__ = "agent_identities"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    public_key = Column(String, nullable=False)  # hex-encoded Ed25519 public key
    card_signature = Column(Text, nullable=False)  # signed agent card
    card_issued_at = Column(DateTime(timezone=True), nullable=False)
    card_expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class WorkspaceIdentity(Base):
    """Workspace root Ed25519 keypair (public key stored, private key never in DB)."""

    __tablename__ = "workspace_identities"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    root_public_key = Column(String, nullable=False)  # hex-encoded Ed25519 public key
    root_hmac_key_hash = Column(
        String, nullable=False
    )  # SHA-256 of HMAC root key (for verification)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class DelegationChain(Base):
    """Records every delegation hop for audit and lineage."""

    __tablename__ = "delegation_chains"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    sender_agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    receiver_agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    delegation_depth = Column(Integer, nullable=False, default=0)
    caveats = Column(JSONB, nullable=False, default=list)
    delegation_token = Column(Text, nullable=False)  # compact serialized DelegationToken
    signature_valid = Column(Boolean, nullable=False, default=True)
    chain_hash = Column(String, nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)  # IPS: token revocation timestamp
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class TelemetryRow(Base):
    """Structured telemetry events for the correlation engine.

    Every inspection, identity failure, scope violation, and delegation event
    produces a row here. The correlation engine queries this table.
    """

    __tablename__ = "telemetry_events"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(String, nullable=False, unique=True)
    event_type = Column(String, nullable=False)  # "a2a.inspection" | "a2a.identity_failure" | etc.
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    sender_agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True)
    receiver_agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True)
    task_type = Column(String, nullable=True)
    decision = Column(String, nullable=True)
    risk_score = Column(Float, default=0.0)
    violations = Column(JSONB, default=list)
    delegation_chain = Column(JSONB, default=list)
    delegation_depth = Column(Integer, default=0)
    message_hash = Column(String, nullable=True)
    chain_hash = Column(String, nullable=True)
    signature_valid = Column(Boolean, nullable=True)
    cipher_suite = Column(String, default="TLS_AES_256_GCM_SHA384")
    key_exchange = Column(String, default="X25519Kyber768")
    otel_trace_id = Column(String, nullable=True)
    otel_span_id = Column(String, nullable=True)
    latency_ms = Column(Integer, default=0)
    groq_called = Column(Boolean, default=False)
    groq_rationale = Column(Text, nullable=True)
    payload_snapshot = Column(JSONB, nullable=True)  # truncated payload for audit
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Security Expansion: CVE / CVSS
# ---------------------------------------------------------------------------


class CVECache(Base):
    """Local cache of NVD CVE data to avoid rate-limiting."""

    __tablename__ = "cve_cache"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cve_id = Column(String, nullable=False, unique=True, index=True)
    cvss_score = Column(Float, default=0.0)
    severity = Column(String, nullable=False, default="unknown")
    vector_string = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    published_date = Column(String, nullable=True)
    fetched_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class AgentSoftwareInventory(Base):
    """Software/model/library stack each agent declares."""

    __tablename__ = "agent_software_inventory"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    component_name = Column(String, nullable=False)
    component_version = Column(String, nullable=False)
    cpe_string = Column(String, nullable=True)  # CPE 2.3 format
    last_scanned_at = Column(DateTime(timezone=True), default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Security Expansion: SOC Integration
# ---------------------------------------------------------------------------


class SOCAlert(Base):
    """SOC-facing triage object, separate from raw violations."""

    __tablename__ = "soc_alerts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    source_violation_id = Column(
        UUID(as_uuid=True), ForeignKey("violations.id", ondelete="SET NULL"), nullable=True
    )
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    severity = Column(String, nullable=False, default="P3")  # P1-P4
    status = Column(String, nullable=False, default="new")  # new/acknowledged/investigating/resolved/false_positive
    assigned_analyst = Column(String, nullable=True)
    mitre_technique = Column(String, nullable=True)  # e.g. "T1059"
    chain_hash = Column(String, nullable=True)  # delegation chain hash for context
    title = Column(String, nullable=False, default="Security Alert")
    description = Column(Text, nullable=True)
    details = Column(JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class RuleToMitreTechnique(Base):
    """Static mapping: violation/rule types → MITRE ATT&CK technique IDs."""

    __tablename__ = "rule_to_mitre_technique"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_type = Column(String, nullable=False, unique=True)  # e.g. "prompt_injection"
    mitre_technique_id = Column(String, nullable=False)  # e.g. "T1059"
    mitre_technique_name = Column(String, nullable=True)  # e.g. "Command and Scripting Interpreter"
    mitre_tactic = Column(String, nullable=True)  # e.g. "Execution"


# ---------------------------------------------------------------------------
# Security Expansion: IDS/IPS
# ---------------------------------------------------------------------------


class AgentViolationCounterRow(Base):
    """Persistent sliding-window counters for agent violations (IPS auto-containment)."""

    __tablename__ = "agent_violation_counters"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    window_start = Column(DateTime(timezone=True), nullable=False)
    violation_count = Column(Integer, default=0)
    critical_count = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Security Expansion: Compliance
# ---------------------------------------------------------------------------


class ComplianceRulePack(Base):
    """Records which compliance frameworks are installed per workspace."""

    __tablename__ = "compliance_rule_packs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    framework = Column(String, nullable=False)  # e.g. "RBI", "PCI-DSS"
    version = Column(String, default="1.0")
    rules_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Spend & Budget Governance
# ---------------------------------------------------------------------------


class WorkspaceSpendLimit(Base):
    """Organization/Workspace level monthly financial and token spend budgets."""

    __tablename__ = "workspace_spend_limits"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    monthly_budget_usd = Column(Float, default=1000.0, nullable=False)
    token_budget = Column(Integer, default=10000000, nullable=False)
    current_spend_usd = Column(Float, default=0.0, nullable=False)
    current_tokens = Column(Integer, default=0, nullable=False)
    hard_limit_action = Column(String, default="block", nullable=False)  # block | warn
    alert_threshold_pct = Column(Float, default=80.0, nullable=False)
    reset_day_of_month = Column(Integer, default=1, nullable=False)
    last_reset_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class AgentSpendLimit(Base):
    """Per-agent or user financial and token spend limit."""

    __tablename__ = "agent_spend_limits"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    monthly_budget_usd = Column(Float, default=100.0, nullable=False)
    token_budget = Column(Integer, default=1000000, nullable=False)
    current_spend_usd = Column(Float, default=0.0, nullable=False)
    current_tokens = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class SpendLedger(Base):
    """Immutable ledger recording cost and token consumption per task or inspection."""

    __tablename__ = "spend_ledger"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    task_id = Column(UUID(as_uuid=True), nullable=True)
    tokens_used = Column(Integer, default=0, nullable=False)
    cost_usd = Column(Float, default=0.0, nullable=False)
    model_name = Column(String, nullable=True)
    operation = Column(String, default="inspect", nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


# ---------------------------------------------------------------------------
# RBAC & Organization Member Management
# ---------------------------------------------------------------------------


class WorkspaceMember(Base):
    """Workspace users and operators with assigned roles and fine-grained permissions."""

    __tablename__ = "workspace_members"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    email = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, default="developer", nullable=False)  # admin | security_admin | soc_analyst | auditor | developer | viewer | custom
    permissions = Column(JSONB, default=list, nullable=False)  # explicit permission grant overrides
    is_active = Column(Boolean, default=True, nullable=False)
    scim_external_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class CustomRole(Base):
    """Custom fine-grained role definition with tailored permission matrix."""

    __tablename__ = "custom_roles"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    permissions = Column(JSONB, default=list, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Enterprise Audit Trail
# ---------------------------------------------------------------------------


class AuditLog(Base):
    """Immutable audit trail for all workspace, security, governance, and policy actions."""

    __tablename__ = "audit_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    actor_id = Column(String, nullable=True)
    actor_email = Column(String, nullable=False, default="system")
    actor_type = Column(String, default="user", nullable=False)  # user | agent | scim | system
    action = Column(String, nullable=False)  # e.g. "policy.create", "spend.update", "member.invite"
    entity_type = Column(String, nullable=False)  # policy | spend_limit | member | agent | ip_allowlist | network_rule | retention | scim
    entity_id = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    diff = Column(JSONB, default=dict, nullable=False)  # {"before": {...}, "after": {...}}
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    status = Column(String, default="success", nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Custom Data Retention & Privacy Controls
# ---------------------------------------------------------------------------


class DataRetentionPolicy(Base):
    """Data lifecycle retention periods and automatic scrubbing configurations."""

    __tablename__ = "data_retention_policies"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    task_payload_days = Column(Integer, default=30, nullable=False)
    telemetry_days = Column(Integer, default=90, nullable=False)
    violations_days = Column(Integer, default=180, nullable=False)
    soc_alerts_days = Column(Integer, default=180, nullable=False)
    audit_log_days = Column(Integer, default=365, nullable=False)  # compliance minimum
    auto_purge_enabled = Column(Boolean, default=False, nullable=False)
    scrub_pii_after_days = Column(Integer, default=14, nullable=False)
    last_purged_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# Network-Level Access Control & IP Allowlisting
# ---------------------------------------------------------------------------


class NetworkAccessRule(Base):
    """CIDR and protocol-level network boundaries for agent mesh communication."""

    __tablename__ = "network_access_rules"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    priority = Column(Integer, nullable=False, default=100)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    source_cidr = Column(String, nullable=False, default="0.0.0.0/0")
    destination_agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=True
    )
    action = Column(String, nullable=False, default="allow")  # allow | deny
    protocol = Column(String, default="all", nullable=False)  # all | http | grpc | websocket
    port_range = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class IpAllowlistEntry(Base):
    """IP / CIDR allowlisting for dashboard and API access."""

    __tablename__ = "ip_allowlist_entries"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    cidr_or_ip = Column(String, nullable=False)
    label = Column(String, nullable=False)
    scope = Column(String, default="all", nullable=False)  # all | dashboard | api
    is_enabled = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


# ---------------------------------------------------------------------------
# SCIM 2.0 Integration
# ---------------------------------------------------------------------------


class SCIMToken(Base):
    """Authentication tokens for SCIM 2.0 IdP provisioning."""

    __tablename__ = "scim_tokens"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    token_hash = Column(String, nullable=False, unique=True)
    name = Column(String, default="Default SCIM Token", nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

