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
};

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
