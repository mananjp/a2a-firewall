export type Decision = "allow" | "block" | "review" | "error";
export type Severity = "low" | "medium" | "high" | "critical";
export type ViolationLayer = "schema" | "rule" | "semantic" | "policy";
export type AgentStatus = "active" | "suspended";
export type PolicyAction = "allow" | "block" | "review" | "flag";

export interface Workspace {
  id: string;
  name: string;
  admin_email: string;
  fail_mode: "open" | "closed";
  groq_threshold: number;
  block_threshold: number;
  default_deny: boolean;
  jurisdiction?: string | null;
  industry?: string | null;
  compliance_frameworks?: string[];
  ips_mode?: string;
  created_at: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  status: AgentStatus;
  capabilities: string[];
  workspace_id?: string;
}

export interface AgentWithKey extends Agent {
  api_key: string;
}

export interface Violation {
  id: string;
  task_id: string;
  layer: ViolationLayer;
  violation_type: string;
  severity: Severity;
  resolved: boolean;
  created_at: string;
}

export interface Policy {
  id: string;
  priority: number;
  name: string;
  action: PolicyAction;
  task_type?: string;
  description?: string;
}

export interface ReviewItem {
  id: string;
  task_id: string;
  review_token: string;
  expires_at: string;
  status?: string;
  reviewer_notes?: string;
}

export interface FirewallResponse {
  task_id: string;
  decision: Decision;
  allowed_to_proceed: boolean;
  risk_score: number;
  violations: Array<{
    layer: string;
    violation_type: string;
    severity: Severity;
    details: Record<string, unknown>;
  }>;
  review_token: string | null;
  block_reason: string | null;
  latency_ms: number;
  trace_id?: string;
}

export interface TaskDetail {
  id: string;
  decision: Decision;
  risk_score: number;
  groq_rationale: string | null;
  groq_injection_detected: boolean | null;
  groq_hallucination_flags: unknown;
  depth: number;
  task_type: string;
  trace_id?: string;
  span_id?: string;
  violating_layer?: string;
  intent_drift_score?: number;
  violations: Array<{
    layer: string;
    type: string;
    severity: Severity;
    details: Record<string, unknown>;
  }>;
}

export interface LineageNode {
  id: string;
  parent_task_id: string | null;
  sender_id: string;
  receiver_id: string;
  task_type: string;
  decision: Decision;
  depth: number;
}

export interface TraceEvent {
  id: string;
  event_name: string;
  span_id: string;
  parent_span_id: string | null;
  duration_ms: number | null;
  task_id: string | null;
  attributes: Record<string, unknown>;
  created_at: string;
}

export interface StatsOverview {
  total_tasks: number;
  blocked: number;
  blocked_pct: number;
  groq_calls_today: number;
  avg_latency_ms: number;
}

export interface LoginResponse {
  workspace_id: string;
  admin_email: string;
  api_key: string;
  warning: string;
}

export interface WorkspaceRegisterResponse {
  workspace_id: string;
  api_key: string;
  name: string;
}

export interface AgentIdentity {
  agent_id: string;
  workspace_id: string;
  public_key: string;
  card: Record<string, unknown>;
  message: string;
}

export interface DelegationToken {
  location: string;
  identifier: string;
  caveats: string[];
  signature: string;
}

export interface DelegationChainEntry {
  depth: number;
  sender: string;
  receiver: string;
  caveats: string[];
  signature_valid: boolean;
  chain_hash: string;
  created_at: string | null;
}

export interface TelemetryEvent {
  event_id: string;
  event_type: string;
  timestamp: string;
  workspace_id: string;
  sender_agent_id: string | null;
  receiver_agent_id: string | null;
  task_type: string | null;
  decision: string | null;
  risk_score: number;
  violations: Array<Record<string, unknown>>;
  delegation_chain: string[];
  delegation_depth: number;
  message_hash: string | null;
  chain_hash: string | null;
  signature_valid: boolean | null;
  latency_ms: number;
  groq_called: boolean;
  created_at: string;
}

export interface TelemetrySummary {
  total_events: number;
  events_by_type: Record<string, number>;
  events_by_decision: Record<string, number>;
  avg_risk_score: number;
  identity_failures: number;
  scope_violations: number;
}

export interface TaskSchema {
  id: string;
  task_type: string;
  version: string;
  is_active: boolean;
  created_at: string;
}

export interface SimulationStep {
  sender: string;
  receiver: string;
  task_type: string;
  payload: Record<string, unknown>;
}

export interface SimulationResult {
  step: number;
  sender: string;
  receiver: string;
  task_type: string;
  task_id: string;
  decision: string;
  allowed_to_proceed: boolean;
  risk_score: number;
  violations: Array<{
    layer: string;
    violation_type: string;
    severity: string;
    details: Record<string, unknown>;
  }>;
  review_token: string | null;
  block_reason: string | null;
  latency_ms: number;
  trace_id: string;
}

// ---------------------------------------------------------------------------
// Security Expansion types
// ---------------------------------------------------------------------------

export interface SOCAlert {
  id: string;
  workspace_id: string;
  source_violation_id: string | null;
  task_id: string | null;
  severity: "P1" | "P2" | "P3" | "P4";
  status: "new" | "acknowledged" | "investigating" | "resolved" | "false_positive";
  assigned_analyst: string | null;
  mitre_technique: string | null;
  chain_hash: string | null;
  title: string;
  description: string | null;
  details: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface SOCAlertSummary {
  total: number;
  new: number;
  p1_open: number;
  by_severity: Record<string, number>;
  by_status: Record<string, number>;
}

export interface IPSSignature {
  id: string;
  category: string;
  description: string;
  severity: string;
  action: string;
  enabled: boolean;
  hit_count: number;
  pattern: string;
  mitre_technique: string;
}

export interface MITREMapping {
  rule_type: string;
  mitre_technique_id: string;
  mitre_technique_name: string | null;
  mitre_tactic: string | null;
}

export interface ComplianceFramework {
  framework: string;
  version: string;
  rules_count: number;
  is_active: boolean;
  installed_at: string | null;
}

export interface ComplianceRule {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  action: string;
  block_reason: string | null;
  framework_tag: string | null;
  is_active: boolean;
}

export interface ComplianceReport {
  framework: string;
  workspace_id: string;
  period: { from: string | null; to: string | null };
  summary: {
    total_framework_violations: number;
    total_all_violations: number;
    total_soc_alerts: number;
  };
  violations_by_type: Record<string, number>;
  violations_by_severity: Record<string, number>;
  compliance_status: string;
}

export interface CVEResult {
  cve_id: string;
  cvss_score: number;
  severity: string;
  vector_string: string;
  published_date: string;
  description: string;
  found: boolean;
}

export interface AgentVulnerability {
  component: string;
  version: string;
  cve_id: string;
  cvss_score: number;
  severity: string;
  vector_string: string;
  description: string;
  published_date: string;
}

export interface InventoryComponent {
  id: string;
  component_name: string;
  component_version: string;
  cpe_string: string | null;
  last_scanned_at: string | null;
}

// ---------------------------------------------------------------------------
// Spend Limits & Cost Governance
// ---------------------------------------------------------------------------

export interface WorkspaceSpendOverview {
  workspace_id: string;
  monthly_budget_usd: number;
  current_spend_usd: number;
  spend_percentage: number;
  token_budget: number;
  current_tokens: number;
  token_percentage: number;
  hard_limit_action: "block" | "warn";
  alert_threshold_pct: number;
  alert_triggered: boolean;
  pricing_rates_per_million: Record<string, number>;
  top_spending_agents: Array<{
    agent_id: string;
    agent_name: string;
    current_spend_usd: number;
    monthly_budget_usd: number;
    current_tokens: number;
    token_budget: number;
    is_active: boolean;
    spend_pct: number;
  }>;
  last_reset_at: string | null;
}

export interface AgentSpendLimitItem {
  agent_id: string;
  agent_name: string;
  status: string;
  monthly_budget_usd: number;
  token_budget: number;
  current_spend_usd: number;
  current_tokens: number;
  is_active: boolean;
  has_custom_limit: boolean;
}

export interface SpendLedgerItem {
  id: string;
  task_id: string | null;
  agent_id: string | null;
  agent_name: string;
  tokens_used: number;
  cost_usd: number;
  model_name: string;
  operation: string;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// RBAC & Organization Members
// ---------------------------------------------------------------------------

export interface WorkspaceMemberItem {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  effective_permissions: string[];
  is_active: boolean;
  scim_external_id: string | null;
  created_at: string | null;
}

export interface CustomRoleItem {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// Enterprise Audit Trail
// ---------------------------------------------------------------------------

export interface EnterpriseAuditLogItem {
  id: string;
  actor_id: string | null;
  actor_email: string;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string | null;
  diff: Record<string, unknown>;
  ip_address: string | null;
  status: string;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// Data Retention & Privacy Controls
// ---------------------------------------------------------------------------

export interface DataRetentionPolicyItem {
  task_payload_days: number;
  telemetry_days: number;
  violations_days: number;
  soc_alerts_days: number;
  audit_log_days: number;
  auto_purge_enabled: boolean;
  scrub_pii_after_days: number;
  last_purged_at: string | null;
}

export interface RetentionCandidates {
  cutoffs: Record<string, string>;
  candidates: {
    expired_tasks: number;
    expired_telemetry: number;
    expired_violations: number;
    expired_soc_alerts: number;
    expired_audit_logs: number;
    pii_scrub_eligible_tasks: number;
  };
  total_records_eligible: number;
}

// ---------------------------------------------------------------------------
// Network Access & IP Allowlisting
// ---------------------------------------------------------------------------

export interface IpAllowlistEntryItem {
  id: string;
  cidr_or_ip: string;
  label: string;
  scope: string;
  is_enabled: boolean;
  is_expired: boolean;
  expires_at: string | null;
  created_by: string | null;
  created_at: string | null;
}

export interface NetworkAccessRuleItem {
  id: string;
  priority: number;
  name: string;
  description: string | null;
  source_cidr: string;
  destination_agent_id: string | null;
  destination_agent_name?: string;
  action: "allow" | "deny";
  protocol: string;
  port_range: string | null;
  is_active: boolean;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// SCIM Provisioning
// ---------------------------------------------------------------------------

export interface SCIMTokenItem {
  id: string;
  name: string;
  last_used_at: string | null;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// Agent Runtime Security Fabric (v1.2.0)
// ---------------------------------------------------------------------------

// Evidence Envelopes
export interface EvidenceEnvelopeSummary {
  decision_id: string;
  task_id: string;
  final_action: string;
  risk_score: number;
  envelope_version: string;
  signature: string;
  signer_public_key: string;
  envelope: Record<string, any>;
  created_at?: string | null;
}

export interface EvidenceVerifyResult {
  decision_id: string;
  checks: Record<string, boolean>;
  valid: boolean;
}

export interface EvidenceReplayResult {
  decision_id: string;
  replay: Record<string, boolean>;
}

// Memory / RAG Firewall
export interface MemoryEntryItem {
  id: string;
  content: string;
  content_hash: string;
  source_agent_id?: string | null;
  metadata?: Record<string, any>;
  created_at?: string | null;
}

export interface MemoryInspectionLogItem {
  id: string;
  content_hash: string;
  action: string;
  blocked: boolean;
  findings: Array<{
    finding_type?: string;
    type?: string;
    severity?: string;
    description?: string;
  }>;
  created_at?: string | null;
}

export interface MemoryInspectResult {
  agent_id: string;
  inspection: {
    action: string;
    blocked: boolean;
    content_hash: string;
    findings: Array<{
      finding_type: string;
      severity: string;
      description: string;
    }>;
    redacted_chunk?: string;
  };
  store_policy: {
    persist: boolean;
    reason: string;
    content_hash: string;
  };
}

export interface MemorySearchResult {
  blocked: boolean;
  query_action: string;
  result_count: number;
  results: Array<{
    entry_id: string;
    content: string;
    content_hash: string;
    score: number;
    metadata?: Record<string, any>;
  }>;
}

// Multi-Agent Workflows
export interface WorkflowAnomaly {
  anomaly_type: string;
  severity: string;
  description: string;
  agents_involved?: string[];
}

export interface WorkflowInstanceItem {
  id: string;
  root_task_id: string;
  node_count: number;
  depth: number;
  cumulative_risk: number;
  cumulative_exposure: number;
  distinct_agents: number;
  anomalies: WorkflowAnomaly[];
  quarantined: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WorkflowNodeItem {
  task_id: string;
  parent_task_id?: string | null;
  sender_agent_id: string;
  receiver_agent_id: string;
  depth: number;
  risk_score: number;
  decision: string;
}

export interface WorkflowStateDetail {
  state: {
    root_task_id: string;
    node_count: number;
    depth: number;
    cumulative_risk: number;
    cumulative_exposure: number;
    distinct_agents: number;
    anomalies: WorkflowAnomaly[];
    quarantine_recommended: boolean;
  };
  nodes: WorkflowNodeItem[];
}

// Lineage-Aware DLP
export interface DlpRuleItem {
  data_class: "financial" | "identity" | "health" | "contact" | "sensitive";
  destination: string;
  action: "allow" | "redact" | "tokenize" | "hash" | "block";
  allowed_purposes?: string[] | null;
  enabled: boolean;
}

export interface DlpFindingItem {
  pattern_type: string;
  matched_text: string;
  confidence: number;
  framework_tags: string[];
  data_class?: string;
  span?: [number, number];
}

export interface DlpInspectResult {
  action: string;
  blocked: boolean;
  transformed_text?: string | null;
  derived: boolean;
  source_digest?: string | null;
  findings: DlpFindingItem[];
}



