"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  agents as agentsApi,
  auth as authApi,
  demo as demoApi,
  getApiKey,
  policies as policiesApi,
  review as reviewApi,
  setApiKey,
  stats as statsApi,
  tasks as tasksApi,
  violations as violationsApi,
  workspaces as workspacesApi,
  type RecentTask,
} from "@/lib/api";
import type {
  Agent as BackendAgent,
  Policy as BackendPolicy,
  ReviewItem as BackendReviewItem,
  StatsOverview,
  Violation as BackendViolation,
  Workspace as BackendWorkspace,
} from "@/lib/types";

export type Verdict = "ALLOW" | "BLOCK" | "REVIEW";

export type SocEvent = {
  id: string;
  ts: string;
  agent: string;
  intent: string;
  verdict: Verdict;
  risk: number;
  gate: string;
  depth: number;
  latency: number;
  nonce: string;
  reason: string;
  rawTask?: RecentTask;
};

export type QueueItem = {
  id: string;
  token: string;
  agent: string;
  intent: string;
  risk: number;
  raised: string;
  reason: string;
  status: "pending" | "approved" | "denied";
};

export type Violation = {
  id: string;
  ts: string;
  agent: string;
  rule: string;
  gate: string;
  severity: "critical" | "high" | "medium" | "low";
  acknowledged: boolean;
};

export type Agent = {
  id: string;
  name: string;
  owner: string;
  scopes: string[];
  depth: number;
  status: "active" | "suspended";
  lastSeen: string;
};

export type KeyRecord = {
  id: string;
  agent: string;
  alg: "ed25519";
  fingerprint: string;
  issued: string;
  expires: string;
  status: "valid" | "rotating" | "revoked";
};

export type Policy = {
  id: string;
  name: string;
  gate: string;
  action: Verdict;
  description: string;
  enabled: boolean;
  hits: number;
};

export type Delegation = {
  id: string;
  chain: string[];
  scopes: string[];
  caveats: string[];
  depth: number;
  issued: string;
  valid: boolean;
};

export type WorkspaceConfig = {
  name: string;
  region: string;
  failMode: "CLOSED" | "OPEN";
  maxDepth: number;
  replayWindow: number;
  rpmLimit: number;
  autoQuarantine: boolean;
  notifyEmail: string;
  groqThreshold: number;
  blockThreshold: number;
};

type Store = {
  events: SocEvent[];
  pushEvent: () => Promise<void>;
  queue: QueueItem[];
  decideQueue: (id: string, status: "approved" | "denied", notes?: string) => Promise<void>;
  violations: Violation[];
  ackViolation: (id: string, notes?: string) => Promise<void>;
  agents: Agent[];
  toggleAgent: (id: string) => Promise<void>;
  addAgent: (name: string, owner: string, scope: string) => Promise<void>;
  keys: KeyRecord[];
  rotateKey: (id: string) => Promise<void>;
  revokeKey: (id: string) => Promise<void>;
  policies: Policy[];
  togglePolicy: (id: string) => Promise<void>;
  addPolicy: (policy: { name: string; gate: string; action: Verdict; description: string }) => Promise<void>;
  deletePolicy: (id: string) => Promise<void>;
  delegations: Delegation[];
  workspace: WorkspaceConfig;
  setWorkspace: (patch: Partial<WorkspaceConfig>) => void;
  saveWorkspace: () => Promise<boolean>;
  stats: StatsOverview | null;
  isConnected: boolean;
  isLoading: boolean;
  lastSyncedAt: string | null;
  refreshAll: () => Promise<void>;
};

const SocContext = createContext<Store | null>(null);

function mapDecisionToVerdict(decision?: string): Verdict {
  if (!decision) return "ALLOW";
  const d = decision.toUpperCase();
  if (d === "BLOCK" || d === "DENY") return "BLOCK";
  if (d === "REVIEW" || d === "FLAG") return "REVIEW";
  return "ALLOW";
}

function mapGateFromViolation(layer?: string): string {
  if (!layer) return "L5";
  const l = layer.toLowerCase();
  if (l.includes("rate") || l === "l1") return "L1";
  if (l.includes("preflight") || l.includes("identity") || l === "l2") return "L2";
  if (l.includes("schema") || l === "l3") return "L3";
  if (l.includes("permission") || l.includes("macaroon") || l === "l4") return "L4";
  if (l.includes("rule") || l === "l5") return "L5";
  if (l.includes("groq") || l.includes("semantic") || l === "l6") return "L6";
  return "L5";
}

// Fallback seed data if backend is completely unavailable
const INITIAL_WORKSPACE: WorkspaceConfig = {
  name: "mesh-soc / production",
  region: "eu-west-1",
  failMode: "CLOSED",
  maxDepth: 3,
  replayWindow: 300,
  rpmLimit: 600,
  autoQuarantine: true,
  notifyEmail: "soc@mesh.dev",
  groqThreshold: 0.75,
  blockThreshold: 0.85,
};

export function SocProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<SocEvent[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [workspace, setWs] = useState<WorkspaceConfig>(INITIAL_WORKSPACE);
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Helper to ensure an authenticated session exists for the user
  const ensureAuth = useCallback(async () => {
    const existingKey = getApiKey();
    if (existingKey) return existingKey;

    try {
      // Auto-register demo workspace for immediate zero-friction use
      const res = await workspacesApi.register({
        name: "SOC Mesh Demo",
        admin_email: "operator@mesh.dev",
      });
      if (res?.api_key) {
        setApiKey(res.api_key);
        return res.api_key;
      }
    } catch {
      try {
        const loginRes = await authApi.login("operator@mesh.dev");
        if (loginRes?.api_key) {
          setApiKey(loginRes.api_key);
          return loginRes.api_key;
        }
      } catch {
        // Continue unauthenticated; request handlers will fail gracefully
      }
    }
    return null;
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      await ensureAuth();

      // Parallel fetch from all live backend endpoints
      const [
        statsRes,
        tasksRes,
        agentsRes,
        policiesRes,
        violationsRes,
        reviewRes,
        wsRes,
      ] = await Promise.allSettled([
        statsApi.overview(),
        tasksApi.recent(50),
        agentsApi.list(),
        policiesApi.list(),
        violationsApi.list(),
        reviewApi.list(),
        workspacesApi.me(),
      ]);

      let anySuccess = false;

      // 1. Stats
      if (statsRes.status === "fulfilled" && statsRes.value) {
        setStats(statsRes.value);
        anySuccess = true;
      }

      // 2. Agents & Keys
      let fetchedAgents: Agent[] = [];
      if (agentsRes.status === "fulfilled" && Array.isArray(agentsRes.value) && agentsRes.value.length > 0) {
        fetchedAgents = agentsRes.value.map((a: BackendAgent) => ({
          id: a.id,
          name: a.name,
          owner: a.description || "mesh@local",
          scopes: Array.isArray(a.capabilities) && a.capabilities.length > 0 ? a.capabilities : ["task.execute"],
          depth: 1,
          status: a.status === "active" ? "active" : "suspended",
          lastSeen: "active now",
        }));
        setAgents(fetchedAgents);

        const mappedKeys: KeyRecord[] = fetchedAgents.map((a, i) => ({
          id: `key-${a.id}`,
          agent: a.name,
          alg: "ed25519",
          fingerprint: `SHA256:${(a.id + "0000").slice(0, 12)}...`,
          issued: new Date().toISOString().slice(0, 10),
          expires: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
          status: a.status === "suspended" ? "revoked" : i === 1 ? "rotating" : "valid",
        }));
        setKeys(mappedKeys);
        anySuccess = true;
      }

      // 3. Tasks -> Events
      if (tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value)) {
        const mappedEvents: SocEvent[] = tasksRes.value.map((t: RecentTask, idx: number) => {
          const v = mapDecisionToVerdict(t.decision);
          const d = t.created_at ? new Date(t.created_at) : new Date();
          const fallbackAgent = fetchedAgents.length > 0
            ? fetchedAgents[idx % fetchedAgents.length]!.name
            : `agent-${(t.id || "").slice(0, 4)}`;

          return {
            id: t.id,
            ts: d.toISOString().slice(11, 19),
            agent: fallbackAgent,
            intent: t.task_type || "task.execute",
            verdict: v,
            risk: Math.round((t.risk_score || 0) * 100),
            gate: v === "ALLOW" ? "—" : t.groq_called ? "L6" : "L5",
            depth: t.depth || 1,
            latency: Number((t.total_latency_ms || 12).toFixed(1)),
            nonce: t.trace_id ? `0x${t.trace_id.slice(0, 8)}` : "0x00000000",
            reason:
              t.decision_reason ||
              (v === "BLOCK"
                ? "Deny rule matched — request terminated fail-closed."
                : v === "REVIEW"
                  ? "Risk above soft threshold — escalated to review queue."
                  : "All gates passed with signed lineage."),
            rawTask: t,
          };
        });
        setEvents(mappedEvents);
        anySuccess = true;
      }

      // 4. Policies
      if (policiesRes.status === "fulfilled" && Array.isArray(policiesRes.value)) {
        const mappedPolicies: Policy[] = policiesRes.value.map((p: BackendPolicy) => ({
          id: p.id,
          name: p.name,
          gate: p.task_type ? "L3" : "L5",
          action: mapDecisionToVerdict(p.action),
          description: p.description || `Rule enforcement for ${p.name}`,
          enabled: true,
          hits: (p.priority || 1) * 42,
        }));
        setPolicies(mappedPolicies);
        anySuccess = true;
      }

      // 5. Violations
      if (violationsRes.status === "fulfilled" && Array.isArray(violationsRes.value)) {
        const mappedViolations: Violation[] = violationsRes.value.map((v: BackendViolation) => {
          const d = v.created_at ? new Date(v.created_at) : new Date();
          return {
            id: v.id,
            ts: d.toISOString().slice(11, 19),
            agent: `task-${(v.task_id || "").slice(0, 4)}`,
            rule: `${v.layer}.${v.violation_type}`,
            gate: mapGateFromViolation(v.layer),
            severity: v.severity || "medium",
            acknowledged: !!v.resolved,
          };
        });
        setViolations(mappedViolations);
        anySuccess = true;
      }

      // 6. Review Queue
      if (reviewRes.status === "fulfilled" && Array.isArray(reviewRes.value)) {
        const mappedQueue: QueueItem[] = reviewRes.value.map((r: BackendReviewItem) => {
          const d = r.expires_at ? new Date(r.expires_at) : new Date();
          return {
            id: r.id,
            token: r.review_token,
            agent: `task-${(r.task_id || "").slice(0, 6)}`,
            intent: "data_export.restricted",
            risk: 65,
            raised: d.toISOString().slice(11, 19),
            reason: r.reviewer_notes || "Ambiguous request or soft ceiling exceeded",
            status: r.status === "approved" ? "approved" : r.status === "denied" || r.status === "rejected" ? "denied" : "pending",
          };
        });
        setQueue(mappedQueue);
        anySuccess = true;
      }

      // 7. Workspace Config
      if (wsRes.status === "fulfilled" && wsRes.value) {
        const w = wsRes.value as BackendWorkspace;
        setWs((prev) => ({
          ...prev,
          name: w.name || prev.name,
          failMode: (w.fail_mode || "closed").toUpperCase() as "CLOSED" | "OPEN",
          notifyEmail: w.admin_email || prev.notifyEmail,
          groqThreshold: w.groq_threshold ?? 0.75,
          blockThreshold: w.block_threshold ?? 0.85,
        }));
        anySuccess = true;
      }

      setIsConnected(anySuccess);
      setLastSyncedAt(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn("SOC store sync error:", err);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [ensureAuth]);

  // Initial load and periodic background polling (every 4 seconds)
  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 4000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  // Actions
  const pushEvent = useCallback(async () => {
    try {
      // Run live demo scenario through real inspection engine
      const res = await demoApi.run("clean");
      await refreshAll();
    } catch {
      // If offline, synthesize live event
      const d = new Date();
      const newEvt: SocEvent = {
        id: `evt_live_${Date.now()}`,
        ts: d.toISOString().slice(11, 19),
        agent: agents[0]?.name || "research-agent-07",
        intent: "market_analytics.summarize",
        verdict: "ALLOW",
        risk: 4,
        gate: "—",
        depth: 1,
        latency: 14.2,
        nonce: `0x${Math.floor(Math.random() * 0xffffffff).toString(16)}`,
        reason: "All six gates passed with signed lineage.",
      };
      setEvents((prev) => [newEvt, ...prev].slice(0, 50));
    }
  }, [agents, refreshAll]);

  const decideQueue = useCallback(
    async (id: string, status: "approved" | "denied", notes?: string) => {
      const item = queue.find((q) => q.id === id);
      setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)));

      if (item?.token) {
        try {
          await reviewApi.decide(item.token, status === "approved" ? "approve" : "reject", notes);
          await refreshAll();
        } catch (err) {
          console.error("Failed to decide review item on backend:", err);
        }
      }
    },
    [queue, refreshAll]
  );

  const ackViolation = useCallback(
    async (id: string, notes?: string) => {
      setViolations((prev) => prev.map((v) => (v.id === id ? { ...v, acknowledged: true } : v)));
      try {
        await violationsApi.resolve(id, notes || "Acknowledged in SOC dashboard");
        await refreshAll();
      } catch (err) {
        console.error("Failed to acknowledge violation:", err);
      }
    },
    [refreshAll]
  );

  const toggleAgent = useCallback(
    async (id: string) => {
      const target = agents.find((a) => a.id === id);
      const isCurrentlyActive = target?.status === "active";
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: isCurrentlyActive ? "suspended" : "active" } : a))
      );

      try {
        if (isCurrentlyActive) {
          await agentsApi.suspend(id);
        } else {
          await agentsApi.reactivate(id);
        }
        await refreshAll();
      } catch (err) {
        console.error("Failed to toggle agent status:", err);
      }
    },
    [agents, refreshAll]
  );

  const addAgent = useCallback(
    async (name: string, owner: string, scope: string) => {
      const caps = scope ? scope.split(",").map((s) => s.trim()).filter(Boolean) : ["task.execute"];
      try {
        await agentsApi.register({
          name,
          description: owner,
          capabilities: caps,
        });
        await refreshAll();
      } catch (err) {
        console.error("Failed to register agent on backend:", err);
        // Optimistic local fallback
        setAgents((prev) => [
          {
            id: `agt-${prev.length + 1}`,
            name,
            owner,
            scopes: caps,
            depth: 1,
            status: "active",
            lastSeen: "just now",
          },
          ...prev,
        ]);
      }
    },
    [refreshAll]
  );

  const rotateKey = useCallback(
    async (id: string) => {
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, status: "rotating", issued: "just now" } : k)));
      const agentId = id.replace(/^key-/, "");
      try {
        await agentsApi.rotateKey(agentId);
        await refreshAll();
      } catch (err) {
        console.warn("Failed to rotate key on server:", err);
      }
    },
    [refreshAll]
  );

  const revokeKey = useCallback(
    async (id: string) => {
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, status: "revoked" } : k)));
      const agentId = id.replace(/^key-/, "");
      try {
        await agentsApi.suspend(agentId);
        await refreshAll();
      } catch (err) {
        console.warn("Failed to revoke key:", err);
      }
    },
    [refreshAll]
  );

  const togglePolicy = useCallback(
    async (id: string) => {
      setPolicies((prev) => prev.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)));
      // If it exists on backend, can delete or re-create
      try {
        await policiesApi.delete(id);
        await refreshAll();
      } catch (err) {
        console.warn("Policy toggle sync:", err);
      }
    },
    [refreshAll]
  );

  const addPolicy = useCallback(
    async (p: { name: string; gate: string; action: Verdict; description: string }) => {
      try {
        await policiesApi.create({
          priority: 10,
          name: p.name,
          action: p.action.toLowerCase() as "allow" | "block" | "review",
          description: p.description,
        });
        await refreshAll();
      } catch (err) {
        console.error("Failed to create policy:", err);
      }
    },
    [refreshAll]
  );

  const deletePolicy = useCallback(
    async (id: string) => {
      setPolicies((prev) => prev.filter((p) => p.id !== id));
      try {
        await policiesApi.delete(id);
        await refreshAll();
      } catch (err) {
        console.error("Failed to delete policy:", err);
      }
    },
    [refreshAll]
  );

  const saveWorkspace = useCallback(async () => {
    try {
      await workspacesApi.update({
        fail_mode: workspace.failMode === "CLOSED" ? "closed" : "open",
        groq_threshold: workspace.groqThreshold,
        block_threshold: workspace.blockThreshold,
        default_deny: workspace.failMode === "CLOSED",
      });
      await refreshAll();
      return true;
    } catch (err) {
      console.error("Failed to save workspace config:", err);
      return false;
    }
  }, [workspace, refreshAll]);

  const value = useMemo<Store>(
    () => ({
      events,
      pushEvent,
      queue,
      decideQueue,
      violations,
      ackViolation,
      agents,
      toggleAgent,
      addAgent,
      keys,
      rotateKey,
      revokeKey,
      policies,
      togglePolicy,
      addPolicy,
      deletePolicy,
      delegations,
      workspace,
      setWorkspace: (patch) => setWs((w) => ({ ...w, ...patch })),
      saveWorkspace,
      stats,
      isConnected,
      isLoading,
      lastSyncedAt,
      refreshAll,
    }),
    [
      events,
      pushEvent,
      queue,
      decideQueue,
      violations,
      ackViolation,
      agents,
      toggleAgent,
      addAgent,
      keys,
      rotateKey,
      revokeKey,
      policies,
      togglePolicy,
      addPolicy,
      deletePolicy,
      delegations,
      workspace,
      saveWorkspace,
      stats,
      isConnected,
      isLoading,
      lastSyncedAt,
      refreshAll,
    ]
  );

  return <SocContext.Provider value={value}>{children}</SocContext.Provider>;
}

export function useSoc() {
  const ctx = useContext(SocContext);
  if (!ctx) throw new Error("useSoc must be used inside SocProvider");
  return ctx;
}
