import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped

from a2a_firewall.db.database import Base


class Workspace(Base):
    __tablename__ = "workspaces"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    name: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    admin_email: Mapped[str] = Column(String, nullable=False, unique=True)  # type: ignore[assignment]
    api_key_hash: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    password_hash: Mapped[str | None] = Column(  # type: ignore[assignment]
        String, nullable=True
    )  # Argon2id hash, nullable for legacy rows
    fail_mode: Mapped[str | None] = Column(String, default="closed")  # type: ignore[assignment]
    groq_threshold: Mapped[float | None] = Column(Float, default=0.3)  # type: ignore[assignment]
    block_threshold: Mapped[float | None] = Column(Float, default=0.8)  # type: ignore[assignment]
    review_threshold: Mapped[float | None] = Column(Float, default=0.5)  # type: ignore[assignment]
    default_deny: Mapped[bool | None] = Column(Boolean, default=True)  # type: ignore[assignment]
    # Security expansion: compliance & IPS
    jurisdiction: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]  # e.g. "IN", "EU", "US-CA"

    industry: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]  # e.g. "banking", "healthcare"

    compliance_frameworks: Mapped[Any] = Column(JSONB, default=list)  # type: ignore[assignment]  # e.g. ["RBI", "DPDP"]

    ips_mode: Mapped[str | None] = Column(  # type: ignore[assignment]
        String, default="block"
    )  # monitor | block | block_and_suspend
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    description: Mapped[str | None] = Column(Text)  # type: ignore[assignment]
    api_key_hash: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    status: Mapped[str | None] = Column(String, default="active")  # type: ignore[assignment]
    capabilities: Mapped[Any] = Column(JSONB, default=list)  # type: ignore[assignment]
    metadata_: Mapped[Any] = Column("metadata", JSONB, default=dict)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


class TaskSchema(Base):
    __tablename__ = "task_schemas"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    task_type: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    version: Mapped[str | None] = Column(String, default="v1")  # type: ignore[assignment]
    json_schema: Mapped[Any] = Column(JSONB, nullable=False)  # type: ignore[assignment]
    is_active: Mapped[bool | None] = Column(Boolean, default=True)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


class AgentPermission(Base):
    __tablename__ = "agent_permissions"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[uuid.UUID | None] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=True
    )
    receiver_id: Mapped[uuid.UUID | None] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=True
    )
    task_type: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    allowed: Mapped[bool | None] = Column(Boolean, default=True)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


class ResourcePermission(Base):
    __tablename__ = "resource_permissions"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    agent_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    resource_type: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    action: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    allowed: Mapped[bool | None] = Column(Boolean, default=True)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


class PolicyRule(Base):
    __tablename__ = "policy_rules"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    priority: Mapped[int] = Column(Integer, nullable=False)  # type: ignore[assignment]
    name: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    description: Mapped[str | None] = Column(Text)  # type: ignore[assignment]
    sender_id: Mapped[uuid.UUID | None] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True
    )
    receiver_id: Mapped[uuid.UUID | None] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True
    )
    task_type: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    condition_expr: Mapped[Any] = Column(JSONB, nullable=True)  # type: ignore[assignment]
    action: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    block_reason: Mapped[str | None] = Column(Text, nullable=True)  # type: ignore[assignment]
    is_active: Mapped[bool | None] = Column(Boolean, default=True)  # type: ignore[assignment]
    framework_tag: Mapped[str | None] = Column(  # type: ignore[assignment]
        String, nullable=True
    )  # compliance framework, e.g. "RBI", "PCI-DSS"
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False
    )
    root_task_id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), nullable=False)  # type: ignore[assignment]
    parent_task_id: Mapped[uuid.UUID | None] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True
    )
    depth: Mapped[int | None] = Column(Integer, default=0)  # type: ignore[assignment]
    sender_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False
    )
    receiver_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False
    )
    task_type: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    schema_version: Mapped[str | None] = Column(String, default="v1")  # type: ignore[assignment]
    resource_type: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    resource_id: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    action: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    payload: Mapped[Any] = Column(JSONB, nullable=False)  # type: ignore[assignment]
    payload_hash: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    payload_size_bytes: Mapped[int] = Column(Integer, nullable=False)  # type: ignore[assignment]
    risk_score: Mapped[float | None] = Column(Float, default=0.0)  # type: ignore[assignment]
    decision: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    decision_reason: Mapped[str | None] = Column(Text)  # type: ignore[assignment]
    matched_rule_id: Mapped[uuid.UUID | None] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("policy_rules.id"), nullable=True
    )
    groq_called: Mapped[bool | None] = Column(Boolean, default=False)  # type: ignore[assignment]
    groq_model: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    groq_injection_detected: Mapped[bool | None] = Column(Boolean, nullable=True)  # type: ignore[assignment]
    groq_hallucination_flags: Mapped[Any] = Column(JSONB, nullable=True)  # type: ignore[assignment]
    groq_risk_delta: Mapped[float | None] = Column(Float, nullable=True)  # type: ignore[assignment]
    groq_rationale: Mapped[str | None] = Column(Text, nullable=True)  # type: ignore[assignment]
    groq_latency_ms: Mapped[int | None] = Column(Integer, nullable=True)  # type: ignore[assignment]
    total_latency_ms: Mapped[int | None] = Column(Integer, nullable=True)  # type: ignore[assignment]
    trace_id: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    span_id: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    declared_intent: Mapped[str | None] = Column(  # type: ignore[assignment]
        Text, nullable=True
    )  # root task's purpose statement
    intent_drift_score: Mapped[float | None] = Column(  # type: ignore[assignment]
        Float, nullable=True
    )  # 0.0–1.0 semantic drift from root intent
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


class Violation(Base):
    __tablename__ = "violations"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False
    )
    task_id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)  # type: ignore[assignment]
    layer: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    violation_type: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    severity: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    details: Mapped[Any] = Column(JSONB, nullable=False)  # type: ignore[assignment]
    resolved: Mapped[bool | None] = Column(Boolean, default=False)  # type: ignore[assignment]
    resolved_by: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    resolved_at: Mapped[datetime | None] = Column(DateTime(timezone=True), nullable=True)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


class ReviewItem(Base):
    __tablename__ = "review_items"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False
    )
    task_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("tasks.id"), unique=True, nullable=False
    )
    review_token: Mapped[str] = Column(String, unique=True, nullable=False)  # type: ignore[assignment]
    status: Mapped[str | None] = Column(String, default="pending")  # type: ignore[assignment]
    reviewer_notes: Mapped[str | None] = Column(Text, nullable=True)  # type: ignore[assignment]
    decided_at: Mapped[datetime | None] = Column(DateTime(timezone=True), nullable=True)  # type: ignore[assignment]
    expires_at: Mapped[datetime] = Column(DateTime(timezone=True), nullable=False)  # type: ignore[assignment]
    on_expire: Mapped[str | None] = Column(String, default="block")  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


class TraceEvent(Base):
    __tablename__ = "trace_events"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False
    )
    task_id: Mapped[uuid.UUID | None] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True
    )
    trace_id: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    span_id: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    parent_span_id: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    event_name: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    attributes: Mapped[Any] = Column(JSONB, default=dict)  # type: ignore[assignment]
    duration_ms: Mapped[int | None] = Column(Integer, nullable=True)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Identity & Delegation (new)
# ---------------------------------------------------------------------------


class AgentIdentity(Base):
    """Ed25519 identity record for each agent."""

    __tablename__ = "agent_identities"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    agent_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    public_key: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]  # hex-encoded Ed25519 public key

    card_signature: Mapped[str] = Column(Text, nullable=False)  # type: ignore[assignment]  # signed agent card

    card_issued_at: Mapped[datetime] = Column(DateTime(timezone=True), nullable=False)  # type: ignore[assignment]
    card_expires_at: Mapped[datetime] = Column(DateTime(timezone=True), nullable=False)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


class WorkspaceIdentity(Base):
    """Workspace root Ed25519 keypair (public key stored, private key never in DB)."""

    __tablename__ = "workspace_identities"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    root_public_key: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]  # hex-encoded Ed25519 public key

    root_hmac_key_hash: Mapped[str] = Column(  # type: ignore[assignment]
        String, nullable=False
    )  # SHA-256 of HMAC root key (for verification)
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


class DelegationChain(Base):
    """Records every delegation hop for audit and lineage."""

    __tablename__ = "delegation_chains"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    task_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    sender_agent_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False
    )
    receiver_agent_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False
    )
    delegation_depth: Mapped[int] = Column(Integer, nullable=False, default=0)  # type: ignore[assignment]
    caveats: Mapped[Any] = Column(JSONB, nullable=False, default=list)  # type: ignore[assignment]
    delegation_token: Mapped[str] = Column(  # type: ignore[assignment]
        Text, nullable=False
    )  # compact serialized DelegationToken
    signature_valid: Mapped[bool] = Column(Boolean, nullable=False, default=True)  # type: ignore[assignment]
    chain_hash: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    revoked_at: Mapped[datetime | None] = Column(  # type: ignore[assignment]
        DateTime(timezone=True), nullable=True
    )  # IPS: token revocation timestamp
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


class TelemetryRow(Base):
    """Structured telemetry events for the correlation engine.

    Every inspection, identity failure, scope violation, and delegation event
    produces a row here. The correlation engine queries this table.
    """

    __tablename__ = "telemetry_events"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    event_id: Mapped[str] = Column(String, nullable=False, unique=True)  # type: ignore[assignment]
    event_type: Mapped[str] = Column(  # type: ignore[assignment]
        String, nullable=False
    )  # "a2a.inspection" | "a2a.identity_failure" | etc.
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    sender_agent_id: Mapped[uuid.UUID | None] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True
    )
    receiver_agent_id: Mapped[uuid.UUID | None] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True
    )
    task_type: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    decision: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    risk_score: Mapped[float | None] = Column(Float, default=0.0)  # type: ignore[assignment]
    violations: Mapped[Any] = Column(JSONB, default=list)  # type: ignore[assignment]
    delegation_chain: Mapped[Any] = Column(JSONB, default=list)  # type: ignore[assignment]
    delegation_depth: Mapped[int | None] = Column(Integer, default=0)  # type: ignore[assignment]
    message_hash: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    chain_hash: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    signature_valid: Mapped[bool | None] = Column(Boolean, nullable=True)  # type: ignore[assignment]
    cipher_suite: Mapped[str | None] = Column(String, default="TLS_AES_256_GCM_SHA384")  # type: ignore[assignment]
    key_exchange: Mapped[str | None] = Column(String, default="X25519Kyber768")  # type: ignore[assignment]
    otel_trace_id: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    otel_span_id: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    latency_ms: Mapped[int | None] = Column(Integer, default=0)  # type: ignore[assignment]
    groq_called: Mapped[bool | None] = Column(Boolean, default=False)  # type: ignore[assignment]
    groq_rationale: Mapped[str | None] = Column(Text, nullable=True)  # type: ignore[assignment]
    payload_snapshot: Mapped[Any] = Column(JSONB, nullable=True)  # type: ignore[assignment]  # truncated payload for audit

    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Security Expansion: CVE / CVSS
# ---------------------------------------------------------------------------


class CVECache(Base):
    """Local cache of NVD CVE data to avoid rate-limiting."""

    __tablename__ = "cve_cache"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    cve_id: Mapped[str] = Column(String, nullable=False, unique=True, index=True)  # type: ignore[assignment]
    cvss_score: Mapped[float | None] = Column(Float, default=0.0)  # type: ignore[assignment]
    severity: Mapped[str] = Column(String, nullable=False, default="unknown")  # type: ignore[assignment]
    vector_string: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    description: Mapped[str | None] = Column(Text, nullable=True)  # type: ignore[assignment]
    published_date: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    fetched_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


class AgentSoftwareInventory(Base):
    """Software/model/library stack each agent declares."""

    __tablename__ = "agent_software_inventory"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    agent_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    component_name: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    component_version: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    cpe_string: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]  # CPE 2.3 format

    last_scanned_at: Mapped[datetime | None] = Column(  # type: ignore[assignment]
        DateTime(timezone=True), default=datetime.utcnow
    )


# ---------------------------------------------------------------------------
# Security Expansion: SOC Integration
# ---------------------------------------------------------------------------


class SOCAlert(Base):
    """SOC-facing triage object, separate from raw violations."""

    __tablename__ = "soc_alerts"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    source_violation_id: Mapped[uuid.UUID | None] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("violations.id", ondelete="SET NULL"), nullable=True
    )
    task_id: Mapped[uuid.UUID | None] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    severity: Mapped[str] = Column(String, nullable=False, default="P3")  # type: ignore[assignment]  # P1-P4

    status: Mapped[str] = Column(  # type: ignore[assignment]
        String, nullable=False, default="new"
    )  # new/acknowledged/investigating/resolved/false_positive
    assigned_analyst: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    mitre_technique: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]  # e.g. "T1059"

    chain_hash: Mapped[str | None] = Column(  # type: ignore[assignment]
        String, nullable=True
    )  # delegation chain hash for context
    title: Mapped[str] = Column(String, nullable=False, default="Security Alert")  # type: ignore[assignment]
    description: Mapped[str | None] = Column(Text, nullable=True)  # type: ignore[assignment]
    details: Mapped[Any] = Column(JSONB, default=dict)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]
    updated_at: Mapped[datetime | None] = Column(  # type: ignore[assignment]
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class RuleToMitreTechnique(Base):
    """Static mapping: violation/rule types → MITRE ATT&CK technique IDs."""

    __tablename__ = "rule_to_mitre_technique"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    rule_type: Mapped[str] = Column(String, nullable=False, unique=True)  # type: ignore[assignment]  # e.g. "prompt_injection"

    mitre_technique_id: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]  # e.g. "T1059"

    mitre_technique_name: Mapped[str | None] = Column(  # type: ignore[assignment]
        String, nullable=True
    )  # e.g. "Command and Scripting Interpreter"
    mitre_tactic: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]  # e.g. "Execution"


# ---------------------------------------------------------------------------
# Security Expansion: IDS/IPS
# ---------------------------------------------------------------------------


class AgentViolationCounterRow(Base):
    """Persistent sliding-window counters for agent violations (IPS auto-containment)."""

    __tablename__ = "agent_violation_counters"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    agent_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    window_start: Mapped[datetime] = Column(DateTime(timezone=True), nullable=False)  # type: ignore[assignment]
    violation_count: Mapped[int | None] = Column(Integer, default=0)  # type: ignore[assignment]
    critical_count: Mapped[int | None] = Column(Integer, default=0)  # type: ignore[assignment]
    updated_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Security Expansion: Compliance
# ---------------------------------------------------------------------------


class ComplianceRulePack(Base):
    """Records which compliance frameworks are installed per workspace."""

    __tablename__ = "compliance_rule_packs"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    framework: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]  # e.g. "RBI", "PCI-DSS"

    version: Mapped[str | None] = Column(String, default="1.0")  # type: ignore[assignment]
    rules_count: Mapped[int | None] = Column(Integer, default=0)  # type: ignore[assignment]
    is_active: Mapped[bool | None] = Column(Boolean, default=True)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Spend & Budget Governance
# ---------------------------------------------------------------------------


class WorkspaceSpendLimit(Base):
    """Organization/Workspace level monthly financial and token spend budgets."""

    __tablename__ = "workspace_spend_limits"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    monthly_budget_usd: Mapped[float] = Column(Float, default=1000.0, nullable=False)  # type: ignore[assignment]
    token_budget: Mapped[int] = Column(Integer, default=10000000, nullable=False)  # type: ignore[assignment]
    current_spend_usd: Mapped[float] = Column(Float, default=0.0, nullable=False)  # type: ignore[assignment]
    current_tokens: Mapped[int] = Column(Integer, default=0, nullable=False)  # type: ignore[assignment]
    hard_limit_action: Mapped[str] = Column(String, default="block", nullable=False)  # type: ignore[assignment]  # block | warn

    alert_threshold_pct: Mapped[float] = Column(Float, default=80.0, nullable=False)  # type: ignore[assignment]
    reset_day_of_month: Mapped[int] = Column(Integer, default=1, nullable=False)  # type: ignore[assignment]
    last_reset_at: Mapped[datetime | None] = Column(  # type: ignore[assignment]
        DateTime(timezone=True), default=datetime.utcnow
    )
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]
    updated_at: Mapped[datetime | None] = Column(  # type: ignore[assignment]
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class AgentSpendLimit(Base):
    """Per-agent or user financial and token spend limit."""

    __tablename__ = "agent_spend_limits"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    agent_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    monthly_budget_usd: Mapped[float] = Column(Float, default=100.0, nullable=False)  # type: ignore[assignment]
    token_budget: Mapped[int] = Column(Integer, default=1000000, nullable=False)  # type: ignore[assignment]
    current_spend_usd: Mapped[float] = Column(Float, default=0.0, nullable=False)  # type: ignore[assignment]
    current_tokens: Mapped[int] = Column(Integer, default=0, nullable=False)  # type: ignore[assignment]
    is_active: Mapped[bool] = Column(Boolean, default=True, nullable=False)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]
    updated_at: Mapped[datetime | None] = Column(  # type: ignore[assignment]
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class SpendLedger(Base):
    """Immutable ledger recording cost and token consumption per task or inspection."""

    __tablename__ = "spend_ledger"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    agent_id: Mapped[uuid.UUID | None] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True
    )
    task_id: Mapped[uuid.UUID | None] = Column(UUID(as_uuid=True), nullable=True)  # type: ignore[assignment]
    tokens_used: Mapped[int] = Column(Integer, default=0, nullable=False)  # type: ignore[assignment]
    cost_usd: Mapped[float] = Column(Float, default=0.0, nullable=False)  # type: ignore[assignment]
    model_name: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    operation: Mapped[str] = Column(String, default="inspect", nullable=False)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# RBAC & Organization Member Management
# ---------------------------------------------------------------------------


class WorkspaceMember(Base):
    """Workspace users and operators with assigned roles and fine-grained permissions."""

    __tablename__ = "workspace_members"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    name: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    role: Mapped[str] = Column(  # type: ignore[assignment]
        String, default="developer", nullable=False
    )  # admin | security_admin | soc_analyst | auditor | developer | viewer | custom
    permissions: Mapped[Any] = Column(  # type: ignore[assignment]
        JSONB, default=list, nullable=False
    )  # explicit permission grant overrides
    is_active: Mapped[bool] = Column(Boolean, default=True, nullable=False)  # type: ignore[assignment]
    scim_external_id: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]
    updated_at: Mapped[datetime | None] = Column(  # type: ignore[assignment]
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class CustomRole(Base):
    """Custom fine-grained role definition with tailored permission matrix."""

    __tablename__ = "custom_roles"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    description: Mapped[str | None] = Column(Text, nullable=True)  # type: ignore[assignment]
    permissions: Mapped[Any] = Column(JSONB, default=list, nullable=False)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Enterprise Audit Trail
# ---------------------------------------------------------------------------


class AuditLog(Base):
    """Immutable audit trail for all workspace, security, governance, and policy actions."""

    __tablename__ = "audit_logs"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    actor_email: Mapped[str] = Column(String, nullable=False, default="system")  # type: ignore[assignment]
    actor_type: Mapped[str] = Column(  # type: ignore[assignment]
        String, default="user", nullable=False
    )  # user | agent | scim | system
    action: Mapped[str] = Column(  # type: ignore[assignment]
        String, nullable=False
    )  # e.g. "policy.create", "spend.update", "member.invite"
    entity_type: Mapped[str] = Column(  # type: ignore[assignment]
        String, nullable=False
    )  # policy | spend_limit | member | agent | ip_allowlist | network_rule | retention | scim
    entity_id: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    description: Mapped[str | None] = Column(Text, nullable=True)  # type: ignore[assignment]
    diff: Mapped[Any] = Column(  # type: ignore[assignment]
        JSONB, default=dict, nullable=False
    )  # {"before": {...}, "after": {...}}
    ip_address: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    user_agent: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    status: Mapped[str] = Column(String, default="success", nullable=False)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Custom Data Retention & Privacy Controls
# ---------------------------------------------------------------------------


class DataRetentionPolicy(Base):
    """Data lifecycle retention periods and automatic scrubbing configurations."""

    __tablename__ = "data_retention_policies"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    task_payload_days: Mapped[int] = Column(Integer, default=30, nullable=False)  # type: ignore[assignment]
    telemetry_days: Mapped[int] = Column(Integer, default=90, nullable=False)  # type: ignore[assignment]
    violations_days: Mapped[int] = Column(Integer, default=180, nullable=False)  # type: ignore[assignment]
    soc_alerts_days: Mapped[int] = Column(Integer, default=180, nullable=False)  # type: ignore[assignment]
    audit_log_days: Mapped[int] = Column(Integer, default=365, nullable=False)  # type: ignore[assignment]  # compliance minimum

    auto_purge_enabled: Mapped[bool] = Column(Boolean, default=False, nullable=False)  # type: ignore[assignment]
    scrub_pii_after_days: Mapped[int] = Column(Integer, default=14, nullable=False)  # type: ignore[assignment]
    last_purged_at: Mapped[datetime | None] = Column(DateTime(timezone=True), nullable=True)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]
    updated_at: Mapped[datetime | None] = Column(  # type: ignore[assignment]
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ---------------------------------------------------------------------------
# Network-Level Access Control & IP Allowlisting
# ---------------------------------------------------------------------------


class NetworkAccessRule(Base):
    """CIDR and protocol-level network boundaries for agent mesh communication."""

    __tablename__ = "network_access_rules"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    priority: Mapped[int] = Column(Integer, nullable=False, default=100)  # type: ignore[assignment]
    name: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    description: Mapped[str | None] = Column(Text, nullable=True)  # type: ignore[assignment]
    source_cidr: Mapped[str] = Column(String, nullable=False, default="0.0.0.0/0")  # type: ignore[assignment]
    destination_agent_id: Mapped[uuid.UUID | None] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=True
    )
    action: Mapped[str] = Column(String, nullable=False, default="allow")  # type: ignore[assignment]  # allow | deny

    protocol: Mapped[str] = Column(  # type: ignore[assignment]
        String, default="all", nullable=False
    )  # all | http | grpc | websocket
    port_range: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    is_active: Mapped[bool] = Column(Boolean, default=True, nullable=False)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


class IpAllowlistEntry(Base):
    """IP / CIDR allowlisting for dashboard and API access."""

    __tablename__ = "ip_allowlist_entries"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    cidr_or_ip: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    label: Mapped[str] = Column(String, nullable=False)  # type: ignore[assignment]
    scope: Mapped[str] = Column(String, default="all", nullable=False)  # type: ignore[assignment]  # all | dashboard | api

    is_enabled: Mapped[bool] = Column(Boolean, default=True, nullable=False)  # type: ignore[assignment]
    expires_at: Mapped[datetime | None] = Column(DateTime(timezone=True), nullable=True)  # type: ignore[assignment]
    created_by: Mapped[str | None] = Column(String, nullable=True)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# SCIM 2.0 Integration
# ---------------------------------------------------------------------------


class SCIMToken(Base):
    """Authentication tokens for SCIM 2.0 IdP provisioning."""

    __tablename__ = "scim_tokens"
    id: Mapped[uuid.UUID] = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)  # type: ignore[assignment]
    workspace_id: Mapped[uuid.UUID] = Column(  # type: ignore[assignment]
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = Column(String, nullable=False, unique=True)  # type: ignore[assignment]
    name: Mapped[str] = Column(String, default="Default SCIM Token", nullable=False)  # type: ignore[assignment]
    expires_at: Mapped[datetime | None] = Column(DateTime(timezone=True), nullable=True)  # type: ignore[assignment]
    last_used_at: Mapped[datetime | None] = Column(DateTime(timezone=True), nullable=True)  # type: ignore[assignment]
    created_at: Mapped[datetime | None] = Column(DateTime(timezone=True), default=datetime.utcnow)  # type: ignore[assignment]
