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
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// Keys are stored in localStorage (DEV ONLY — see LandingPage's auth panel for the warning).
const KEY_STORAGE = "a2a_workspace_key";

export function getApiKey(): string | null {
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

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const apiKey = getApiKey();
  const headers = new Headers(init.headers);
  if (apiKey && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, signal });
  if (!res.ok) {
    const errBody = await res.text();
    throw new ApiError(res.status, errBody || res.statusText);
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

// ---------- Auth ----------
export const auth = {
  login: (email: string) =>
    request<LoginResponse>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
};

// ---------- Workspaces ----------
export const workspaces = {
  register: (body: { name: string; admin_email: string }) =>
    request<WorkspaceRegisterResponse>("/v1/workspaces/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => request<Workspace>("/v1/workspaces/me"),
};

// ---------- Agents ----------
export const agents = {
  list: () => request<Agent[]>("/v1/agents"),
  register: (body: { name: string; description?: string; capabilities?: string[] }) =>
    request<AgentWithKey>("/v1/agents", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  suspend: (id: string) =>
    request<{ id: string; status: string }>(`/v1/agents/${id}/suspend`, { method: "POST" }),
  reactivate: (id: string) =>
    request<{ id: string; status: string }>(`/v1/agents/${id}/reactivate`, { method: "POST" }),
  rotateKey: (id: string) =>
    request<{ id: string; api_key: string }>(`/v1/agents/${id}/rotate-key`, { method: "POST" }),
};

// ---------- Tasks ----------
export const tasks = {
  get: (taskId: string) => request<TaskDetail>(`/v1/tasks/${taskId}`),
  lineage: (taskId: string) => request<LineageNode[]>(`/v1/tasks/${taskId}/lineage`),
  trace: (traceId: string) => request<TraceEvent[]>(`/v1/tasks/by-trace/${traceId}`),
};

// ---------- Violations ----------
export const violations = {
  list: (severity?: string) => {
    const q = severity ? `?severity=${severity}` : "";
    return request<Violation[]>(`/v1/violations${q}`);
  },
};

// ---------- Review ----------
export const review = {
  list: () => request<ReviewItem[]>("/v1/review"),
  decide: (token: string, action: "approve" | "reject", notes?: string) =>
    request<{ status: string }>(`/v1/review/${token}/decide`, {
      method: "POST",
      body: JSON.stringify({ action, notes }),
    }),
};

// ---------- Policies ----------
export const policies = {
  list: () => request<Policy[]>("/v1/policies"),
  create: (body: Omit<Policy, "id">) =>
    request<Policy>("/v1/policies", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  delete: (id: string) => request<{ deleted: string }>(`/v1/policies/${id}`, { method: "DELETE" }),
};

// ---------- Stats ----------
export const stats = {
  overview: () => request<StatsOverview>("/v1/stats/overview"),
};

// ---------- Firewall ----------
export const firewall = {
  inspect: (body: Record<string, unknown>) =>
    request<FirewallResponse>("/v1/firewall/inspect", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
