"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

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
};

export type QueueItem = {
  id: string;
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

const AGENT_NAMES = [
  "portfolio-manager-01",
  "research-agent-07",
  "ops-agent-02",
  "market-analyst-02",
  "summarizer-11",
  "planner-agent-01",
  "unknown-agent-xx",
];

const INTENTS = [
  "market_analytics.summarize",
  "web.fetch",
  "treasury.transfer",
  "doc.summarize",
  "task.delegate",
  "kernel.exec",
  "vault.read",
];

const GATES = ["L1", "L2", "L3", "L4", "L5", "L6"];

let seed = 20260818;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

export function makeEvent(offsetSec: number): SocEvent {
  const r = rnd();
  const verdict: Verdict = r > 0.82 ? "BLOCK" : r > 0.68 ? "REVIEW" : "ALLOW";
  const risk = verdict === "BLOCK" ? 72 + Math.floor(rnd() * 26) : verdict === "REVIEW" ? 30 + Math.floor(rnd() * 25) : Math.floor(rnd() * 12);
  const d = new Date(Date.UTC(2026, 7, 18, 10, 44, 2) - offsetSec * 1000);
  return {
    id: `evt_${offsetSec}_${Math.floor(rnd() * 100000)}`,
    ts: d.toISOString().slice(11, 19),
    agent: AGENT_NAMES[Math.floor(rnd() * AGENT_NAMES.length)]!,
    intent: INTENTS[Math.floor(rnd() * INTENTS.length)]!,
    verdict,
    risk,
    gate: verdict === "ALLOW" ? "—" : GATES[Math.floor(rnd() * 6)]!,
    depth: 1 + Math.floor(rnd() * 3),
    latency: Number((6 + rnd() * 12).toFixed(1)),
    nonce: `0x${Math.floor(rnd() * 0xffffffff).toString(16).padStart(8, "0")}`,
    reason:
      verdict === "BLOCK"
        ? "Deny rule matched — request terminated fail-closed."
        : verdict === "REVIEW"
          ? "Risk above soft threshold — escalated to human review queue."
          : "All six gates passed with signed lineage.",
  };
}

const INITIAL_EVENTS = Array.from({ length: 24 }, (_, i) => makeEvent(i * 7));

const INITIAL_QUEUE: QueueItem[] = [
  { id: "rq-2041", agent: "research-agent-07", intent: "web.fetch", risk: 48, raised: "10:43:58", reason: "Outbound domain not in allow-list (arxiv-mirror.io)", status: "pending" },
  { id: "rq-2040", agent: "planner-agent-01", intent: "task.delegate", risk: 35, raised: "10:42:59", reason: "Delegation depth 3 equals configured maximum", status: "pending" },
  { id: "rq-2038", agent: "summarizer-11", intent: "vault.read", risk: 41, raised: "10:39:14", reason: "Scope requested outside normal working envelope", status: "pending" },
  { id: "rq-2035", agent: "ops-agent-02", intent: "treasury.transfer", risk: 66, raised: "10:31:07", reason: "Amount exceeds soft ceiling of 5,000 USDC", status: "pending" },
];

const INITIAL_VIOLATIONS: Violation[] = [
  { id: "vio-9912", ts: "10:43:51", agent: "ops-agent-02", rule: "scope.treasury.write.denied", gate: "L4", severity: "critical", acknowledged: false },
  { id: "vio-9911", ts: "10:43:31", agent: "unknown-agent-xx", rule: "identity.unregistered", gate: "L2", severity: "critical", acknowledged: false },
  { id: "vio-9908", ts: "10:41:02", agent: "research-agent-07", rule: "injection.indirect_prompt", gate: "L6", severity: "high", acknowledged: false },
  { id: "vio-9903", ts: "10:37:44", agent: "market-analyst-02", rule: "schema.unknown_field", gate: "L3", severity: "medium", acknowledged: true },
  { id: "vio-9899", ts: "10:29:18", agent: "summarizer-11", rule: "ratelimit.burst", gate: "L1", severity: "low", acknowledged: true },
];

const INITIAL_AGENTS: Agent[] = [
  { id: "agt-01", name: "portfolio-manager-01", owner: "trading@mesh", scopes: ["market_analytics.read", "market_analytics.summarize"], depth: 1, status: "active", lastSeen: "10:44:02" },
  { id: "agt-02", name: "research-agent-07", owner: "research@mesh", scopes: ["web.fetch", "doc.summarize"], depth: 2, status: "active", lastSeen: "10:43:58" },
  { id: "agt-03", name: "ops-agent-02", owner: "ops@mesh", scopes: ["ops.read"], depth: 2, status: "suspended", lastSeen: "10:43:51" },
  { id: "agt-04", name: "market-analyst-02", owner: "trading@mesh", scopes: ["market_analytics.read"], depth: 1, status: "active", lastSeen: "10:43:44" },
  { id: "agt-05", name: "summarizer-11", owner: "content@mesh", scopes: ["doc.summarize"], depth: 3, status: "active", lastSeen: "10:43:12" },
  { id: "agt-06", name: "planner-agent-01", owner: "ops@mesh", scopes: ["task.delegate", "doc.summarize"], depth: 1, status: "active", lastSeen: "10:42:59" },
];

const INITIAL_KEYS: KeyRecord[] = INITIAL_AGENTS.map((a, i) => ({
  id: `key-${i + 1}`,
  agent: a.name,
  alg: "ed25519",
  fingerprint: `SHA256:${(a.name + "keymaterial").slice(0, 6)}${(i * 7717).toString(16)}a4f${i}`,
  issued: "2026-07-2" + ((i % 9) + 1),
  expires: "2026-10-2" + ((i % 9) + 1),
  status: a.status === "suspended" ? "revoked" : i === 1 ? "rotating" : "valid",
}));

const INITIAL_POLICIES: Policy[] = [
  { id: "pol-01", name: "Deny unsigned envelopes", gate: "L2", action: "BLOCK", description: "Every envelope must carry a valid ed25519 signature and fresh nonce.", enabled: true, hits: 1204 },
  { id: "pol-02", name: "Replay window 300s", gate: "L2", action: "BLOCK", description: "Reject nonces already observed inside the replay cache window.", enabled: true, hits: 318 },
  { id: "pol-03", name: "Strict schema conformance", gate: "L3", action: "BLOCK", description: "Payload must validate against the registered intent schema version.", enabled: true, hits: 942 },
  { id: "pol-04", name: "Macaroon caveat chain", gate: "L4", action: "BLOCK", description: "Requested scope must be present in the attenuated caveat chain.", enabled: true, hits: 511 },
  { id: "pol-05", name: "Treasury human-in-loop", gate: "L5", action: "REVIEW", description: "Any treasury.* intent above 5,000 USDC escalates to review queue.", enabled: true, hits: 87 },
  { id: "pol-06", name: "Semantic drift guard", gate: "L6", action: "BLOCK", description: "Groq guard blocks tool output whose intent drift exceeds 0.75.", enabled: true, hits: 233 },
  { id: "pol-07", name: "Domain allow-list", gate: "L5", action: "REVIEW", description: "Outbound web.fetch to non-listed domains is held for review.", enabled: false, hits: 44 },
];

const INITIAL_DELEGATIONS: Delegation[] = [
  { id: "dlg-771", chain: ["portfolio-manager-01", "market-analyst-02"], scopes: ["market_analytics.read"], caveats: ["exp<=300s", "scope:market_analytics.read", "depth<=2"], depth: 2, issued: "10:41:12", valid: true },
  { id: "dlg-770", chain: ["planner-agent-01", "research-agent-07", "summarizer-11"], scopes: ["doc.summarize"], caveats: ["exp<=600s", "scope:doc.summarize", "depth<=3"], depth: 3, issued: "10:38:44", valid: true },
  { id: "dlg-768", chain: ["ops-agent-02", "unknown-agent-xx"], scopes: ["treasury.transfer"], caveats: ["scope:ops.read"], depth: 2, issued: "10:33:02", valid: false },
];

type Workspace = {
  name: string;
  region: string;
  failMode: "CLOSED" | "OPEN";
  maxDepth: number;
  replayWindow: number;
  rpmLimit: number;
  autoQuarantine: boolean;
  notifyEmail: string;
};

type Store = {
  events: SocEvent[];
  pushEvent: () => void;
  queue: QueueItem[];
  decideQueue: (id: string, status: "approved" | "denied") => void;
  violations: Violation[];
  ackViolation: (id: string) => void;
  agents: Agent[];
  toggleAgent: (id: string) => void;
  addAgent: (name: string, owner: string, scope: string) => void;
  keys: KeyRecord[];
  rotateKey: (id: string) => void;
  revokeKey: (id: string) => void;
  policies: Policy[];
  togglePolicy: (id: string) => void;
  delegations: Delegation[];
  workspace: Workspace;
  setWorkspace: (patch: Partial<Workspace>) => void;
};

const SocContext = createContext<Store | null>(null);

export function SocProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<SocEvent[]>(INITIAL_EVENTS);
  const [queue, setQueue] = useState<QueueItem[]>(INITIAL_QUEUE);
  const [violations, setViolations] = useState<Violation[]>(INITIAL_VIOLATIONS);
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [keys, setKeys] = useState<KeyRecord[]>(INITIAL_KEYS);
  const [policies, setPolicies] = useState<Policy[]>(INITIAL_POLICIES);
  const [delegations] = useState<Delegation[]>(INITIAL_DELEGATIONS);
  const [workspace, setWs] = useState<Workspace>({
    name: "mesh-soc / production",
    region: "eu-west-1",
    failMode: "CLOSED",
    maxDepth: 3,
    replayWindow: 300,
    rpmLimit: 600,
    autoQuarantine: true,
    notifyEmail: "soc@mesh.dev",
  });

  const value = useMemo<Store>(
    () => ({
      events,
      pushEvent: () =>
        setEvents((prev) => {
          const e = makeEvent(0);
          e.ts = new Date().toISOString().slice(11, 19);
          return [e, ...prev].slice(0, 60);
        }),
      queue,
      decideQueue: (id, status) => setQueue((p) => p.map((q) => (q.id === id ? { ...q, status } : q))),
      violations,
      ackViolation: (id) => setViolations((p) => p.map((v) => (v.id === id ? { ...v, acknowledged: true } : v))),
      agents,
      toggleAgent: (id) =>
        setAgents((p) => p.map((a) => (a.id === id ? { ...a, status: a.status === "active" ? "suspended" : "active" } : a))),
      addAgent: (name, owner, scope) =>
        setAgents((p) => [
          { id: `agt-${p.length + 1}`, name, owner, scopes: scope ? scope.split(",").map((s) => s.trim()) : [], depth: 1, status: "active", lastSeen: "just now" },
          ...p,
        ]),
      keys,
      rotateKey: (id) => setKeys((p) => p.map((k) => (k.id === id ? { ...k, status: "rotating", issued: "just now" } : k))),
      revokeKey: (id) => setKeys((p) => p.map((k) => (k.id === id ? { ...k, status: "revoked" } : k))),
      policies,
      togglePolicy: (id) => setPolicies((p) => p.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x))),
      delegations,
      workspace,
      setWorkspace: (patch) => setWs((w) => ({ ...w, ...patch })),
    }),
    [events, queue, violations, agents, keys, policies, delegations, workspace],
  );

  return <SocContext.Provider value={value}>{children}</SocContext.Provider>;
}

export function useSoc() {
  const ctx = useContext(SocContext);
  if (!ctx) throw new Error("useSoc must be used inside SocProvider");
  return ctx;
}
