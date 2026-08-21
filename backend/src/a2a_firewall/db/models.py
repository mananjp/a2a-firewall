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
    fail_mode = Column(String, default="closed")
    groq_threshold = Column(Float, default=0.3)
    block_threshold = Column(Float, default=0.8)
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
