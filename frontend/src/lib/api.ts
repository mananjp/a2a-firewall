import type {
  Agent,
  AgentWithKey,
  FirewallResponse,
  LineageNode,
  LoginResponse,
  Policy,
  ReviewItem,
  StatsOverview,
  TaskDetail,
  TraceEvent,
  Violation,
  Workspace,
  WorkspaceRegisterResponse,
  TelemetryEvent,
  TelemetrySummary,
  DelegationChainEntry,
  DelegationToken,
  AgentIdentity,
  TaskSchema,
  EvidenceEnvelopeSummary,
  EvidenceVerifyResult,
  EvidenceReplayResult,
  MemoryEntryItem,
  MemoryInspectionLogItem,
  MemoryInspectResult,
  MemorySearchResult,
  WorkflowInstanceItem,
  WorkflowStateDetail,
  DlpRuleItem,
  DlpInspectResult,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

const KEY_STORAGE = "a2a_workspace_key";

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_STORAGE);
}

export function setApiKey(key: string): void {
  localStorage.setItem(KEY_STORAGE, key);
  window.dispatchEvent(new Event("apikey-change"));
}

export function clearApiKey(): void {
  localStorage.removeItem(KEY_STORAGE);
  window.dispatchEvent(new Event("apikey-change"));
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal
): Promise<T> {
  const apiKey = getApiKey();
  const headers = new Headers(init.headers);
  if (apiKey && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    signal,
  });
  if (!res.ok) {
    const errBody = await res.text();
    let message = errBody || res.statusText;
    try {
      const parsed = JSON.parse(errBody);
      if (parsed.detail) {
        message = typeof parsed.detail === "string"
          ? parsed.detail
          : Array.isArray(parsed.detail)
            ? parsed.detail.map((d: { msg?: string; loc?: string[] }) => d.msg ?? JSON.stringify(d)).join("; ")
            : JSON.stringify(parsed.detail);
      }
    } catch {
      // not JSON, use raw text
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const auth = {
  login: (email: string) =>
    request<LoginResponse>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
};

export const workspaces = {
  register: (body: { name: string; admin_email: string }) =>
    request<WorkspaceRegisterResponse>("/v1/workspaces/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => request<Workspace>("/v1/workspaces/me"),
  update: (body: {
    fail_mode?: "open" | "closed";
    groq_threshold?: number;
    block_threshold?: number;
    default_deny?: boolean;
    ips_mode?: string;
    jurisdiction?: string;
    industry?: string;
    compliance_frameworks?: string[];
  }) =>
    request<Workspace>("/v1/workspaces/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};

export const agents = {
  list: () => request<Agent[]>("/v1/agents"),
  get: (id: string) => request<Agent>(`/v1/agents/${id}`),
  register: (body: {
    name: string;
    description?: string;
    capabilities?: string[];
  }) =>
    request<AgentWithKey>("/v1/agents", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  suspend: (id: string) =>
    request<{ id: string; status: string }>(`/v1/agents/${id}/suspend`, {
      method: "POST",
    }),
  reactivate: (id: string) =>
    request<{ id: string; status: string }>(`/v1/agents/${id}/reactivate`, {
      method: "POST",
    }),
  rotateKey: (id: string) =>
    request<{ id: string; api_key: string }>(`/v1/agents/${id}/rotate-key`, {
      method: "POST",
    }),
  createPermission: (
    agentId: string,
    body: { receiver_id: string; task_type?: string; allowed?: boolean }
  ) =>
    request<{
      id: string;
      sender_id: string;
      receiver_id: string;
      task_type: string | null;
      allowed: boolean;
    }>(`/v1/agents/${agentId}/permissions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export interface RecentTask {
  id: string;
  task_type: string;
  decision: string;
  risk_score: number;
  decision_reason: string | null;
  total_latency_ms: number | null;
  groq_called: boolean;
  groq_injection_detected: boolean | null;
  depth: number;
  trace_id: string | null;
  created_at: string;
  violating_layer?: string | null;
  violations?: Array<{
    layer: string;
    violation_type?: string;
    type?: string;
    severity?: string;
    details?: Record<string, unknown>;
  }>;
}

export const tasks = {
  recent: (limit = 20) =>
    request<RecentTask[]>(`/v1/tasks?limit=${limit}`),
  get: (taskId: string) => request<TaskDetail>(`/v1/tasks/${taskId}`),
  lineage: (taskId: string) =>
    request<LineageNode[]>(`/v1/tasks/${taskId}/lineage`),
  trace: (traceId: string) =>
    request<TraceEvent[]>(`/v1/tasks/by-trace/${traceId}`),
};

export const violations = {
  list: (severity?: string) => {
    const q = severity ? `?severity=${severity}` : "";
    return request<Violation[]>(`/v1/violations${q}`);
  },
  resolve: (id: string, notes?: string) =>
    request<{ resolved: boolean }>(`/v1/violations/${id}/resolve`, {
      method: "PATCH",
      body: JSON.stringify({ notes }),
    }),
};

export const review = {
  list: () => request<ReviewItem[]>("/v1/review"),
  decide: (token: string, action: "approve" | "reject", notes?: string) =>
    request<{ status: string }>(`/v1/review/${token}/decide`, {
      method: "POST",
      body: JSON.stringify({ action, notes }),
    }),
  status: (token: string) =>
    request<{ status: string }>(`/v1/review/${token}/status`),
};

export const policies = {
  list: () => request<Policy[]>("/v1/policies"),
  create: (body: Omit<Policy, "id">) =>
    request<Policy>("/v1/policies", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  delete: (id: string) =>
    request<{ deleted: string }>(`/v1/policies/${id}`, { method: "DELETE" }),
};

export const stats = {
  overview: () => request<StatsOverview>("/v1/stats/overview"),
};

export const firewall = {
  inspect: (body: Record<string, unknown>) =>
    request<FirewallResponse>("/v1/firewall/inspect", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export interface DemoRunResponse extends FirewallResponse {
  demo_scenario: string;
  demo_label: string;
  demo_description: string;
  demo_payload: Record<string, unknown>;
}

export const demo = {
  bootstrap: () =>
    request<{ scenarios: Array<{ id: string; label: string; description: string }> }>(
      "/v1/demo/bootstrap"
    ),
  run: (scenario: string) =>
    request<DemoRunResponse>("/v1/demo/run", {
      method: "POST",
      body: JSON.stringify({ scenario }),
    }),
  delegationBootstrap: () =>
    request<{
      scenarios: Array<{
        id: string;
        label: string;
        description: string;
        category: string;
      }>;
    }>("/v1/demo/delegation-bootstrap"),
  runDelegation: (scenario: string, useStatic = false) =>
    request<DelegationDemoResponse>("/v1/demo/run-delegation", {
      method: "POST",
      body: JSON.stringify({ scenario, use_static: useStatic }),
    }),
};

export interface DelegationDemoResponse extends FirewallResponse {
  demo_scenario: string;
  demo_label: string;
  demo_description: string;
  demo_payload: Record<string, unknown>;
  is_static?: boolean;
  pipeline_error?: string;
  root_task?: {
    task_id: string;
    decision: string;
    risk_score: number;
    trace_id: string;
  };
  delegation_metadata?: {
    root_token_caveats: string[];
    child_token_caveats: string[];
    delegation_depth: number;
    intent_declared: string | null;
    intent_drift_score: number | null;
    signature_valid: boolean;
    chain_hops: Array<{
      from: string;
      to: string;
      caveats_added: string[];
      valid: boolean;
    }>;
  };
}


export const simulation = {
  run: (steps: Array<{
    sender: string;
    receiver: string;
    task_type?: string;
    payload: Record<string, unknown>;
  }>) =>
    request<{
      steps: Array<{
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
      }>;
      total: number;
    }>("/v1/simulation/run", {
      method: "POST",
      body: JSON.stringify({ steps }),
    }),
  knowledge: () =>
    request<{
      agents: Record<
        string,
        {
          role: string;
          trust_tier: string;
          capabilities: string[];
          accessible_tools: string[];
          known_context: string[];
          strictly_prohibited: string[];
          signing_key: string;
        }
      >;
    }>("/v1/simulation/knowledge"),
};

export const telemetry = {
  events: (
    params?: {
      event_type?: string;
      sender_agent_id?: string;
      decision?: string;
      limit?: number;
    }
  ) => {
    const q = new URLSearchParams();
    if (params?.event_type) q.set("event_type", params.event_type);
    if (params?.sender_agent_id)
      q.set("sender_agent_id", params.sender_agent_id);
    if (params?.decision) q.set("decision", params.decision);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<TelemetryEvent[]>(
      `/v1/telemetry/events${qs ? `?${qs}` : ""}`
    );
  },
  summary: () => request<TelemetrySummary>("/v1/telemetry/summary"),
};

export const delegation = {
  chain: (taskId: string) =>
    request<{ task_id: string; chain: DelegationChainEntry[] }>(
      `/v1/delegation/chain/${taskId}`
    ),
  mint: (agentId: string, caveats?: string[]) =>
    request<{ token: DelegationToken; message: string }>(
      "/v1/delegation/mint",
      {
        method: "POST",
        body: JSON.stringify({ agent_id: agentId, initial_caveats: caveats }),
      }
    ),
  attenuate: (tokenCompact: string, newCaveats: string[]) =>
    request<{ token: DelegationToken; message: string }>(
      "/v1/delegation/attenuate",
      {
        method: "POST",
        body: JSON.stringify({ token_compact: tokenCompact, new_caveats: newCaveats }),
      }
    ),
  verify: (tokenCompact: string) =>
    request<{ valid: boolean; reason: string; caveats: string[]; parsed: Record<string, string> }>(
      "/v1/delegation/verify",
      {
        method: "POST",
        body: JSON.stringify({ token_compact: tokenCompact }),
      }
    ),
  checkCapability: (tokenCompact: string, required: string) =>
    request<{ granted: boolean; token_caveats: string[] }>(
      "/v1/delegation/check-capability",
      {
        method: "POST",
        body: JSON.stringify({ token_compact: tokenCompact, required }),
      }
    ),
};

export const identity = {
  register: (agentId: string, publicKey: string) =>
    request<AgentIdentity>("/v1/identity/register-identity", {
      method: "POST",
      body: JSON.stringify({ agent_id: agentId, public_key: publicKey }),
    }),
  verifyCard: (agentId: string, card: Record<string, unknown>) =>
    request<{ valid: boolean; reason: string; agent_id: string }>(
      "/v1/identity/verify-card",
      {
        method: "POST",
        body: JSON.stringify({ agent_id: agentId, card }),
      }
    ),
  workspaceIdentity: () =>
    request<{ workspace_id: string; root_public_key: string }>(
      "/v1/identity/workspace-identity"
    ),
};

export const schemas = {
  list: () => request<TaskSchema[]>("/v1/schemas"),
  create: (body: { task_type: string; json_schema: Record<string, unknown>; version?: string }) =>
    request<{ id: string; task_type: string; version: string }>("/v1/schemas", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export interface AuditHop {
  id: string;
  task_id: string;
  sender_id: string;
  sender_name: string;
  receiver_id: string;
  receiver_name: string;
  delegation_depth: number;
  caveats: string[];
  signature_valid: boolean;
  chain_hash: string;
  created_at: string | null;
}

export type DelegationHop = AuditHop;

export interface TaskAuditChain {
  task_id: string;
  root_task_id: string;
  declared_intent: string | null;
  intent_drift_score: number | null;
  hops_count: number;
  hops: AuditHop[];
}

export interface AuditChainExport {
  workspace_id: string;
  count: number;
  events: Array<{
    timestamp: string;
    task_id: string;
    sender_id: string;
    sender_name: string;
    receiver_id: string;
    receiver_name: string;
    delegation_depth: number;
    caveats: string;
    signature_valid: boolean;
    chain_hash: string;
  }>;
}

export const audit = {
  taskChain: (taskId: string) =>
    request<TaskAuditChain>(`/v1/audit/tasks/${taskId}/delegation-chain`),
  listChains: (limit = 100, since?: string) => {
    const q = new URLSearchParams();
    q.set("limit", String(limit));
    if (since) q.set("since", since);
    return request<AuditChainExport>(`/v1/audit/delegation-chains?${q.toString()}`);
  },
  exportCsvUrl: (limit = 100, since?: string) => {
    const apiKey = getApiKey();
    const q = new URLSearchParams();
    q.set("limit", String(limit));
    q.set("format", "csv");
    if (since) q.set("since", since);
    return `${API_BASE}/v1/audit/delegation-chains?${q.toString()}`;
  },
};

// ---------------------------------------------------------------------------
// Security Expansion: SOC Integration
// ---------------------------------------------------------------------------

import type {
  SOCAlert,
  SOCAlertSummary,
  IPSSignature,
  MITREMapping,
  ComplianceFramework,
  ComplianceRule,
  ComplianceReport,
  CVEResult,
  AgentVulnerability,
  InventoryComponent,
} from "./types";

export const soc = {
  alerts: (params?: { severity?: string; status?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.severity) q.set("severity", params.severity);
    if (params?.status) q.set("status", params.status);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    const qs = q.toString();
    return request<{ total: number; offset: number; limit: number; alerts: SOCAlert[] }>(
      `/v1/soc/alerts${qs ? `?${qs}` : ""}`
    );
  },
  updateAlert: (alertId: string, body: { status?: string; assigned_analyst?: string }) =>
    request<{ id: string; severity: string; status: string; assigned_analyst: string | null; updated_at: string }>(
      `/v1/soc/alerts/${alertId}`,
      { method: "PATCH", body: JSON.stringify(body) }
    ),
  summary: () => request<SOCAlertSummary>("/v1/soc/alerts/summary"),
  mitreMapping: () => request<MITREMapping[]>("/v1/soc/mitre-mapping"),
};

// ---------------------------------------------------------------------------
// Security Expansion: CVE Lookup
// ---------------------------------------------------------------------------

export const cve = {
  lookup: (cveId: string) => request<CVEResult>(`/v1/cve/${cveId}`),
};

// ---------------------------------------------------------------------------
// Security Expansion: IDS/IPS
// ---------------------------------------------------------------------------

export const ips = {
  signatures: () => request<IPSSignature[]>("/v1/ips/signatures"),
  getMode: () =>
    request<{ ips_mode: string; modes_available: string[]; descriptions: Record<string, string> }>(
      "/v1/ips/mode"
    ),
  setMode: (mode: string) =>
    request<{ ips_mode: string }>("/v1/ips/mode", {
      method: "PATCH",
      body: JSON.stringify({ ips_mode: mode }),
    }),
  reinstateAgent: (agentId: string) =>
    request<{ id: string; name: string; status: string; message: string }>(
      `/v1/ips/agents/${agentId}/reinstate`,
      { method: "POST" }
    ),
  agentViolationCounts: (agentId: string) =>
    request<{
      agent_id: string;
      violation_count: number;
      critical_count: number;
      auto_suspend_threshold: number;
      window_seconds: number;
    }>(`/v1/ips/agents/${agentId}/violation-counts`),
};

// ---------------------------------------------------------------------------
// Security Expansion: Compliance
// ---------------------------------------------------------------------------

export const compliance = {
  frameworks: () =>
    request<{
      frameworks: Record<string, { rules_count: number; rule_names: string[] }>;
      jurisdiction_mapping: Record<string, string[]>;
      industry_mapping: Record<string, string[]>;
    }>("/v1/compliance/frameworks"),
  installed: () => request<ComplianceFramework[]>("/v1/compliance/installed"),
  apply: (framework: string) =>
    request<{ framework: string; installed: number; skipped: number; total_rules: number }>(
      "/v1/compliance/apply",
      { method: "POST", body: JSON.stringify({ framework }) }
    ),
  remove: (framework: string) =>
    request<{ framework: string; removed: number }>("/v1/compliance/remove", {
      method: "POST",
      body: JSON.stringify({ framework }),
    }),
  suggest: () =>
    request<{ jurisdiction: string | null; industry: string | null; suggested_frameworks: string[] }>(
      "/v1/compliance/suggest"
    ),
  rules: (framework?: string) => {
    const q = framework ? `?framework=${framework}` : "";
    return request<ComplianceRule[]>(`/v1/compliance/rules${q}`);
  },
  report: (framework: string, from?: string, to?: string) => {
    const q = new URLSearchParams();
    q.set("framework", framework);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return request<ComplianceReport>(`/v1/compliance/report?${q.toString()}`);
  },
};

// ---------------------------------------------------------------------------
// Security Expansion: Agent Inventory & Vulnerabilities
// ---------------------------------------------------------------------------

export const agentSecurity = {
  getInventory: (agentId: string) =>
    request<{ agent_id: string; components: InventoryComponent[] }>(
      `/v1/agents/${agentId}/inventory`
    ),
  updateInventory: (
    agentId: string,
    components: Array<{ component_name: string; component_version: string; cpe_string?: string }>
  ) =>
    request<{ agent_id: string; components_registered: number }>(
      `/v1/agents/${agentId}/inventory`,
      { method: "POST", body: JSON.stringify({ components }) }
    ),
  scanVulnerabilities: (agentId: string) =>
    request<{
      agent_id: string;
      components_scanned: number;
      vulnerabilities_found: number;
      vulnerabilities: AgentVulnerability[];
    }>(`/v1/agents/${agentId}/vulnerabilities`),
};

// ---------------------------------------------------------------------------
// Spend Limits & Cost Governance
// ---------------------------------------------------------------------------

import type {
  WorkspaceSpendOverview,
  AgentSpendLimitItem,
  SpendLedgerItem,
  WorkspaceMemberItem,
  CustomRoleItem,
  EnterpriseAuditLogItem,
  DataRetentionPolicyItem,
  RetentionCandidates,
  IpAllowlistEntryItem,
  NetworkAccessRuleItem,
  SCIMTokenItem,
} from "./types";

export const spend = {
  overview: () => request<WorkspaceSpendOverview>("/v1/spend/overview"),
  updateWorkspace: (body: {
    monthly_budget_usd?: number;
    token_budget?: number;
    hard_limit_action?: string;
    alert_threshold_pct?: number;
    reset_day_of_month?: number;
  }) =>
    request<WorkspaceSpendOverview>("/v1/spend/workspace", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  agents: () => request<AgentSpendLimitItem[]>("/v1/spend/agents"),
  updateAgent: (
    agentId: string,
    body: { monthly_budget_usd: number; token_budget: number; is_active?: boolean }
  ) =>
    request<AgentSpendLimitItem>(`/v1/spend/agents/${agentId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  ledger: (params?: { agent_id?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.agent_id) q.set("agent_id", params.agent_id);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<{ workspace_id: string; count: number; transactions: SpendLedgerItem[] }>(
      `/v1/spend/ledger${qs ? `?${qs}` : ""}`
    );
  },
  exportCsvUrl: (limit = 500) => `${API_BASE}/v1/spend/ledger?format=csv&limit=${limit}`,
};

// ---------------------------------------------------------------------------
// RBAC & Workspace Members
// ---------------------------------------------------------------------------

export const rbac = {
  members: () => request<WorkspaceMemberItem[]>("/v1/rbac/members"),
  inviteMember: (body: { email: string; name: string; role: string; permissions?: string[] }) =>
    request<WorkspaceMemberItem>("/v1/rbac/members", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateMember: (
    memberId: string,
    body: { name?: string; role?: string; permissions?: string[]; is_active?: boolean }
  ) =>
    request<WorkspaceMemberItem>(`/v1/rbac/members/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  removeMember: (memberId: string) =>
    request<{ status: string; removed_email: string }>(`/v1/rbac/members/${memberId}`, {
      method: "DELETE",
    }),
  roles: () =>
    request<{
      standard_roles: Record<string, { name: string; description: string; permissions: string[] }>;
      custom_roles: CustomRoleItem[];
    }>("/v1/rbac/roles"),
  createRole: (body: { name: string; description?: string; permissions: string[] }) =>
    request<CustomRoleItem>("/v1/rbac/roles", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  permissions: () =>
    request<{
      permissions: Record<string, string>;
      standard_roles: Record<string, { name: string; description: string; permissions: string[] }>;
    }>("/v1/rbac/permissions"),
};

// ---------------------------------------------------------------------------
// SCIM 2.0 Identity Provisioning
// ---------------------------------------------------------------------------

export const scim = {
  tokens: () => request<SCIMTokenItem[]>("/scim/v2/tokens"),
  generateToken: (name = "IdP SCIM Integration") =>
    request<{ id: string; name: string; token: string; scim_base_url: string; warning: string }>(
      "/scim/v2/tokens",
      { method: "POST", body: JSON.stringify({ name }) }
    ),
};

// ---------------------------------------------------------------------------
// Custom Data Retention Controls
// ---------------------------------------------------------------------------

export const retention = {
  getPolicy: () =>
    request<{
      workspace_id: string;
      policy: DataRetentionPolicyItem;
      minimum_compliance_floors: Record<string, number>;
      retention_candidates: RetentionCandidates;
    }>("/v1/retention/policy"),
  updatePolicy: (body: Partial<DataRetentionPolicyItem>) =>
    request<DataRetentionPolicyItem>("/v1/retention/policy", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  purge: (dryRun = true) =>
    request<{
      dry_run: boolean;
      workspace_id: string;
      purged_records: number;
      summary?: RetentionCandidates;
      breakdown?: Record<string, number>;
    }>("/v1/retention/purge", {
      method: "POST",
      body: JSON.stringify({ dry_run: dryRun }),
    }),
  stats: () =>
    request<{
      workspace_id: string;
      total_records: number;
      table_counts: Record<string, number>;
    }>("/v1/retention/stats"),
};

// ---------------------------------------------------------------------------
// Network Security & IP Allowlisting
// ---------------------------------------------------------------------------

export const network = {
  myIp: () => request<{ client_ip: string }>("/v1/network/my-ip"),
  ipAllowlist: () => request<IpAllowlistEntryItem[]>("/v1/network/ip-allowlist"),
  addIpAllowlist: (body: {
    cidr_or_ip: string;
    label: string;
    scope?: string;
    expires_at?: string | null;
  }) =>
    request<IpAllowlistEntryItem>("/v1/network/ip-allowlist", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateIpAllowlist: (
    id: string,
    body: { label?: string; scope?: string; is_enabled?: boolean; expires_at?: string | null }
  ) =>
    request<IpAllowlistEntryItem>(`/v1/network/ip-allowlist/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteIpAllowlist: (id: string) =>
    request<{ status: string; deleted_id: string }>(`/v1/network/ip-allowlist/${id}`, {
      method: "DELETE",
    }),
  rules: () => request<NetworkAccessRuleItem[]>("/v1/network/rules"),
  createRule: (body: {
    priority: number;
    name: string;
    description?: string;
    source_cidr: string;
    destination_agent_id?: string | null;
    action: "allow" | "deny";
    protocol?: string;
    port_range?: string | null;
  }) =>
    request<NetworkAccessRuleItem>("/v1/network/rules", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteRule: (id: string) =>
    request<{ status: string; deleted_id: string }>(`/v1/network/rules/${id}`, {
      method: "DELETE",
    }),
  testPacket: (body: {
    client_ip: string;
    destination_agent_id?: string | null;
    protocol?: string;
    scope?: string;
  }) =>
    request<{
      client_ip: string;
      overall_allowed: boolean;
      ip_allowlist_evaluation: Record<string, unknown>;
      network_rules_evaluation: Record<string, unknown>;
    }>("/v1/network/test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

// ---------------------------------------------------------------------------
// Extended Enterprise Audit
// ---------------------------------------------------------------------------

export const enterpriseAudit = {
  logs: (params?: {
    actor_email?: string;
    action?: string;
    entity_type?: string;
    from?: string;
    to?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.actor_email) q.set("actor_email", params.actor_email);
    if (params?.action) q.set("action", params.action);
    if (params?.entity_type) q.set("entity_type", params.entity_type);
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    if (params?.search) q.set("search", params.search);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    const qs = q.toString();
    return request<{ workspace_id: string; total: number; count: number; logs: EnterpriseAuditLogItem[] }>(
      `/v1/audit/logs${qs ? `?${qs}` : ""}`
    );
  },
  exportCsvUrl: (limit = 500) => `${API_BASE}/v1/audit/logs/export?format=csv&limit=${limit}`,
};

// ---------------------------------------------------------------------------
// Extended Continuous Compliance
// ---------------------------------------------------------------------------

export const complianceExtended = {
  posture: () =>
    request<{
      workspace_id: string;
      overall_compliance_score: number;
      installed_frameworks_count: number;
      frameworks: Record<
        string,
        {
          installed: boolean;
          score: number;
          controls_passing: number;
          controls_total: number;
          pass_rate_pct: number;
          unresolved_violations_count: number;
          total_violations_count: number;
          status: string;
        }
      >;
    }>("/v1/compliance/posture"),
  timeline: (days = 30) =>
    request<Array<{ date: string; blocked: number; critical: number }>>(
      `/v1/compliance/timeline?days=${days}`
    ),
  exportBundle: (framework = "RBI") =>
    request<Record<string, unknown>>(`/v1/compliance/export-bundle?framework=${framework}`),
};

// ---------------------------------------------------------------------------
// Agent Runtime Security Fabric (v1.2.0)
// ---------------------------------------------------------------------------

export const evidenceApi = {
  list: (limit = 50) =>
    request<EvidenceEnvelopeSummary[]>(`/v1/evidence?limit=${limit}`),
  get: (decisionId: string) =>
    request<EvidenceEnvelopeSummary>(`/v1/evidence/${decisionId}`),
  verify: (decisionId: string) =>
    request<EvidenceVerifyResult>(`/v1/evidence/${decisionId}/verify`),
  replay: (decisionId: string) =>
    request<EvidenceReplayResult>(`/v1/evidence/${decisionId}/replay`),
};

export const memoryApi = {
  entries: (limit = 50) =>
    request<MemoryEntryItem[]>(`/v1/memory/entries?limit=${limit}`),
  logs: (limit = 50) =>
    request<MemoryInspectionLogItem[]>(`/v1/memory/logs?limit=${limit}`),
  inspect: (chunk: string, redactPii = true) =>
    request<MemoryInspectResult>("/v1/memory/inspect", {
      method: "POST",
      body: JSON.stringify({ chunk, redact_pii: redactPii }),
    }),
  inspectQuery: (query: string) =>
    request<{ agent_id: string; blocked: boolean; action: string; findings: Array<{ type: string; severity: string; description: string }> }>(
      "/v1/memory/inspect-query",
      {
        method: "POST",
        body: JSON.stringify({ query }),
      }
    ),
  store: (chunk: string, metadata: Record<string, any> = {}, redactPii = true) =>
    request<{ persisted: boolean; deduped?: boolean; content_hash: string; action?: string; reason?: string }>(
      "/v1/memory/store",
      {
        method: "POST",
        body: JSON.stringify({ chunk, metadata, redact_pii: redactPii }),
      }
    ),
  search: (query: string, topK = 5) =>
    request<MemorySearchResult>("/v1/memory/search", {
      method: "POST",
      body: JSON.stringify({ query, top_k: topK }),
    }),
};

export const workflowsApi = {
  list: (limit = 50) =>
    request<WorkflowInstanceItem[]>(`/v1/workflows?limit=${limit}`),
  get: (rootTaskId: string) =>
    request<WorkflowStateDetail>(`/v1/workflows/${rootTaskId}`),
  quarantine: (rootTaskId: string) =>
    request<{ root_task_id: string; quarantined: boolean; message: string }>(
      `/v1/workflows/${rootTaskId}/quarantine`,
      { method: "POST" }
    ),
};

export const dlpApi = {
  getPolicy: () =>
    request<DlpRuleItem[]>("/v1/dlp/policy"),
  putPolicy: (rules: DlpRuleItem[]) =>
    request<DlpRuleItem[]>("/v1/dlp/policy", {
      method: "PUT",
      body: JSON.stringify(rules),
    }),
  inspect: (text: string, destination = "internal", purpose?: string, tokenize = false) =>
    request<DlpInspectResult>("/v1/dlp/inspect", {
      method: "POST",
      body: JSON.stringify({ text, destination, purpose, tokenize }),
    }),
  classify: (text: string, destination = "internal", purpose?: string) =>
    request<DlpInspectResult>("/v1/dlp/classify", {
      method: "POST",
      body: JSON.stringify({ text, destination, purpose }),
    }),
};




