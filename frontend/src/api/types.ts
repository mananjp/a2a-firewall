// Mirror backend response shapes — keep these in sync with backend/app/api/routes/*.py

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
