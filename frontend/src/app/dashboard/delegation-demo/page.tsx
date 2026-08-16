"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { demo, tasks } from "@/lib/api";
import type { DelegationDemoResponse } from "@/lib/api";
import type { TraceEvent } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge, decisionVariant, severityVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Play,
  Loader2,
  ExternalLink,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  ChevronDown,
  Lock,
  Unlock,
  ArrowDown,
  Fingerprint,
  Link2,
  Eye,
} from "lucide-react";

interface Scenario {
  id: string;
  label: string;
  description: string;
  category: string;
}

interface RunResult {
  scenario: string;
  response: DelegationDemoResponse;
  timestamp: number;
  traceEvents: TraceEvent[];
}

const FALLBACK_SCENARIOS: Scenario[] = [
  { id: "delegation_clean", label: "Clean Delegation", description: "Valid chain with consistent intent.", category: "Normal" },
  { id: "delegation_drift", label: "Intent Drift", description: "Child payload drifts from declared intent.", category: "Attack" },
  { id: "delegation_escalation", label: "Scope Escalation", description: "Child exceeds parent caveats.", category: "Attack" },
  { id: "delegation_tampered", label: "Tampered Token", description: "Corrupted delegation token signature.", category: "Attack" },
];

const AGENT_COLORS: Record<string, string> = {
  "orchestrator agent": "#8b5cf6",
  "research agent": "#3b82f6",
  "payments agent": "#22c55e",
};

function agentColor(name: string) {
  return AGENT_COLORS[name.toLowerCase()] || "#71717a";
}
function agentInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function DelegationDemoPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>(FALLBACK_SCENARIOS);
  const [selected, setSelected] = useState("delegation_clean");
  const [running, setRunning] = useState(false);
  const [useStatic, setUseStatic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<RunResult | null>(null);
  const [history, setHistory] = useState<RunResult[]>([]);

  useEffect(() => {
    demo.delegationBootstrap().then((res) => {
      if (res.scenarios?.length) setScenarios(res.scenarios);
    }).catch(() => {});
  }, []);

  async function runDemo() {
    if (running) return;
    setRunning(true);
    setError(null);
    setCurrentResult(null);
    try {
      const res = await demo.runDelegation(selected, useStatic);
      let traceEvents: TraceEvent[] = [];
      if (res.trace_id) {
        try {
          traceEvents = (await tasks.trace(res.trace_id)) as TraceEvent[];
        } catch {}
      }
      const result: RunResult = {
        scenario: selected,
        response: res,
        timestamp: Date.now(),
        traceEvents,
      };
      setCurrentResult(result);
      setHistory((prev) => [result, ...prev].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo failed");
    } finally {
      setRunning(false);
    }
  }

  const normalScenarios = scenarios.filter((s) => s.category === "Normal");
  const attackScenarios = scenarios.filter((s) => s.category === "Attack");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="Delegation Chain Demo"
          description="Multi-hop delegation pipeline — token minting, attenuation, intent verification, and non-amplification enforcement."
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useStatic}
              onChange={(e) => setUseStatic(e.target.checked)}
              className="accent-accent h-3.5 w-3.5"
            />
            Static fallback
          </label>
          <div className="flex items-center gap-2 text-xs text-success">
            <span className="h-2 w-2 rounded-full bg-success" />
            Real Pipeline
          </div>
        </div>
      </div>

      {/* Scenario selector */}
      {normalScenarios.length > 0 && (
        <>
          <div className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Normal Traffic
          </div>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {normalScenarios.map((sc) => (
              <ScenarioCard
                key={sc.id}
                scenario={sc}
                selected={selected === sc.id}
                disabled={running}
                onClick={() => !running && setSelected(sc.id)}
              />
            ))}
          </div>
        </>
      )}
      {attackScenarios.length > 0 && (
        <>
          <div className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Attack Scenarios
          </div>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {attackScenarios.map((sc) => (
              <ScenarioCard
                key={sc.id}
                scenario={sc}
                selected={selected === sc.id}
                disabled={running}
                onClick={() => !running && setSelected(sc.id)}
              />
            ))}
          </div>
        </>
      )}

      <div className="flex items-center gap-3 mb-6">
        <Button onClick={runDemo} disabled={running} variant="secondary">
          {running ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          {running ? "Running Delegation..." : "Run Delegation Demo"}
        </Button>
        {error && (
          <span className="text-xs text-danger bg-danger/5 border border-danger/20 px-2 py-1 rounded">
            {error}
          </span>
        )}
      </div>

      {currentResult && <DelegationResult result={currentResult} />}

      {history.length > 1 && (
        <div className="mt-6">
          <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Run History ({history.length})
          </div>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Scenario</th>
                  <th className="px-4 py-2.5 font-medium">Decision</th>
                  <th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="px-4 py-2.5 font-medium">Delegation</th>
                  <th className="px-4 py-2.5 font-medium">Latency</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr
                    key={r.timestamp}
                    className="border-t border-border/50 transition-colors hover:bg-surface-elevated/50"
                  >
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {new Date(r.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{r.response.demo_label}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={decisionVariant(r.response.decision)}>
                        {r.response.decision}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {r.response.risk_score.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {r.response.delegation_metadata?.signature_valid ? (
                        <span className="text-allow font-medium">valid</span>
                      ) : (
                        <span className="text-block font-medium">invalid</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">
                      {r.response.latency_ms}ms
                    </td>
                    <td className="px-4 py-2.5 text-[10px]">
                      {r.response.is_static ? (
                        <Badge variant="default">static</Badge>
                      ) : (
                        <Badge variant="info">live</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ─── Scenario Card ─────────────────────────────────────────────────── */

function ScenarioCard({
  scenario,
  selected,
  disabled,
  onClick,
}: {
  scenario: Scenario;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const isAttack = scenario.category === "Attack";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border p-3 text-left transition-all ${
        selected
          ? "border-accent/40 bg-accent/5 ring-1 ring-accent/30"
          : "border-border bg-surface hover:border-border/80 hover:bg-surface-elevated/50"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div className="flex items-center gap-1.5">
        {isAttack ? (
          <ShieldX size={13} className="text-danger shrink-0" />
        ) : (
          <ShieldCheck size={13} className="text-success shrink-0" />
        )}
        <span className="text-xs font-medium text-foreground">
          {scenario.label}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
        {scenario.description}
      </p>
      <div className="mt-2">
        <Badge variant={isAttack ? "danger" : "success"}>
          {scenario.category}
        </Badge>
      </div>
    </button>
  );
}

/* ─── Main Result Display ───────────────────────────────────────────── */

function DelegationResult({ result }: { result: RunResult }) {
  const r = result.response;
  const dm = r.delegation_metadata;
  const traceMap = new Map<string, TraceEvent>();
  for (const ev of result.traceEvents) {
    traceMap.set(ev.event_name, ev);
  }

  return (
    <div className="space-y-4">
      {/* Row 1: Decision hero + Delegation chain */}
      <div className="grid grid-cols-12 gap-4">
        {/* Decision Hero */}
        <div className="col-span-3">
          <Card className="h-full flex flex-col items-center justify-center text-center">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-xl mb-3 ${
                r.decision === "allow"
                  ? "bg-success/10 border border-success/30"
                  : r.decision === "block"
                  ? "bg-danger/10 border border-danger/30"
                  : "bg-warning/10 border border-warning/30"
              }`}
            >
              {r.decision === "allow" ? (
                <ShieldCheck size={28} className="text-success" />
              ) : r.decision === "block" ? (
                <ShieldX size={28} className="text-danger" />
              ) : (
                <AlertTriangle size={28} className="text-warning" />
              )}
            </div>
            <span
              className={`text-lg font-bold ${
                r.decision === "allow"
                  ? "text-success"
                  : r.decision === "block"
                  ? "text-danger"
                  : "text-warning"
              }`}
            >
              {r.decision.toUpperCase()}
            </span>
            <span className="text-[11px] font-mono text-muted-foreground mt-1">
              risk {r.risk_score.toFixed(2)}
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              {r.latency_ms}ms
            </span>
            {r.is_static && (
              <Badge variant="default" className="mt-2">
                static fallback
              </Badge>
            )}
            {r.block_reason && (
              <div className="mt-2 rounded-md border border-danger/20 bg-danger/5 px-2 py-1 text-[10px] text-danger">
                {r.block_reason}
              </div>
            )}
          </Card>
        </div>

        {/* Delegation Chain Visualizer */}
        <div className="col-span-5">
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Link2 size={14} className="text-accent" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Delegation Chain
              </span>
              {dm && (
                <span className="text-[10px] text-muted-foreground ml-auto">
                  depth {dm.delegation_depth}
                </span>
              )}
            </div>

            {dm ? (
              <div className="space-y-0">
                {/* Root Token */}
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-[11px] font-bold text-white shrink-0"
                    style={{ background: agentColor("orchestrator agent") }}
                  >
                    {agentInitials("Orchestrator Agent")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium">Orchestrator Agent</div>
                    <div className="text-[10px] text-muted-foreground">
                      Root token holder
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Fingerprint size={12} className="text-accent/60" />
                    <span className="text-[10px] font-mono text-muted-foreground">
                      root
                    </span>
                  </div>
                </div>

                {/* Root caveats */}
                <div className="ml-4 pl-4 border-l-2 border-accent/20 py-2">
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">
                    Root Caveats
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {dm.root_token_caveats.map((c, i) => (
                      <span
                        key={i}
                        className="rounded bg-accent/10 border border-accent/20 px-1.5 py-0.5 text-[10px] font-mono text-accent"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Chain hops */}
                {dm.chain_hops.map((hop, i) => (
                  <div key={i}>
                    {/* Arrow with caveat additions */}
                    <div className="ml-4 pl-4 border-l-2 border-accent/20 py-1.5">
                      <div className="flex items-center gap-2">
                        <ArrowDown size={12} className="text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          attenuate
                        </span>
                        {hop.caveats_added.length > 0 && (
                          <div className="flex gap-1">
                            {hop.caveats_added.map((c, ci) => (
                              <span
                                key={ci}
                                className="rounded bg-warning/10 border border-warning/20 px-1.5 py-0.5 text-[10px] font-mono text-warning"
                              >
                                +{c}
                              </span>
                            ))}
                          </div>
                        )}
                        {hop.valid ? (
                          <Lock size={11} className="text-success ml-auto" />
                        ) : (
                          <Unlock size={11} className="text-danger ml-auto" />
                        )}
                      </div>
                    </div>

                    {/* Receiver */}
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-[11px] font-bold text-white shrink-0"
                        style={{ background: agentColor(hop.to) }}
                      >
                        {agentInitials(hop.to)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">{hop.to}</div>
                        <div className="text-[10px] text-muted-foreground">
                          Delegated token holder
                        </div>
                      </div>
                      <Badge
                        variant={hop.valid ? "success" : "danger"}
                      >
                        {hop.valid ? "valid" : "tampered"}
                      </Badge>
                    </div>

                    {/* Child caveats */}
                    <div className="ml-4 pl-4 border-l-2 border-border/30 py-2">
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">
                        Effective Caveats
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {dm.child_token_caveats.map((c, ci) => (
                          <span
                            key={ci}
                            className="rounded bg-surface-elevated border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted py-4 text-center">
                No delegation metadata available
              </div>
            )}
          </Card>
        </div>

        {/* Intent + Token Info */}
        <div className="col-span-4 space-y-4">
          {/* Intent Drift Gauge */}
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Eye size={14} className="text-accent" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Intent Verification
              </span>
            </div>
            {dm?.intent_declared ? (
              <div>
                <div className="rounded-md border border-border bg-surface-elevated/30 px-3 py-2 mb-3">
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">
                    Declared Intent
                  </div>
                  <div className="text-xs text-foreground">
                    {dm.intent_declared}
                  </div>
                </div>

                {dm.intent_drift_score != null ? (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-muted-foreground">
                        Drift Score
                      </span>
                      <span
                        className={`text-xs font-mono font-bold ${
                          dm.intent_drift_score > 0.7
                            ? "text-danger"
                            : dm.intent_drift_score > 0.4
                            ? "text-warning"
                            : "text-success"
                        }`}
                      >
                        {dm.intent_drift_score.toFixed(2)}
                      </span>
                    </div>
                    {/* Gauge bar */}
                    <div className="relative h-3 rounded-full bg-surface-elevated border border-border overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${
                          dm.intent_drift_score > 0.7
                            ? "bg-danger"
                            : dm.intent_drift_score > 0.4
                            ? "bg-warning"
                            : "bg-success"
                        }`}
                        style={{
                          width: `${Math.min(100, dm.intent_drift_score * 100)}%`,
                        }}
                      />
                      {/* Threshold marker */}
                      <div
                        className="absolute inset-y-0 w-0.5 bg-danger/60"
                        style={{ left: "70%" }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[9px] text-success">0.0 consistent</span>
                      <span className="text-[9px] text-danger">
                        threshold 0.7 ↑
                      </span>
                      <span className="text-[9px] text-danger">1.0 drifted</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground/60 text-center py-2">
                    Intent drift not evaluated (scenario does not trigger
                    semantic check)
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted py-4 text-center">
                No intent declared
              </div>
            )}
          </Card>

          {/* Signature Validity */}
          <Card>
            <div className="mb-2 flex items-center gap-2">
              <Lock size={14} className="text-accent" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Token Signature
              </span>
            </div>
            {dm ? (
              <div
                className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${
                  dm.signature_valid
                    ? "border-success/30 bg-success/5"
                    : "border-danger/30 bg-danger/5"
                }`}
              >
                {dm.signature_valid ? (
                  <Lock size={16} className="text-success shrink-0" />
                ) : (
                  <Unlock size={16} className="text-danger shrink-0" />
                )}
                <div>
                  <div
                    className={`text-sm font-medium ${
                      dm.signature_valid ? "text-success" : "text-danger"
                    }`}
                  >
                    {dm.signature_valid
                      ? "HMAC-SHA256 Valid"
                      : "Signature Mismatch"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {dm.signature_valid
                      ? "Token integrity verified via root key"
                      : "Token has been tampered with — HMAC chain broken"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted py-2 text-center">
                No token info
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Row 2: Pipeline Layers + Violations */}
      <div className="grid grid-cols-12 gap-4">
        {/* Pipeline */}
        <div className="col-span-8">
          <Card>
            <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Inspection Pipeline{" "}
              <span className="text-muted normal-case">
                ({result.traceEvents.length} events)
              </span>
            </div>
            <PipelineLayers
              events={[
                traceMap.get("firewall.rate_limit"),
                traceMap.get("firewall.preflight"),
                traceMap.get("firewall.schema"),
                traceMap.get("firewall.permissions"),
                traceMap.get("firewall.rules"),
                traceMap.get("firewall.groq"),
                traceMap.get("firewall.decision"),
              ]}
              labels={[
                "Rate Limit",
                "Preflight",
                "Schema",
                "Permissions",
                "Rules",
                "Semantic",
                "Decision",
              ]}
            />

            {/* Payload preview */}
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
                Inspected Payload (child task)
              </div>
              <pre className="rounded-md border border-border bg-surface p-3 text-[11px] font-mono text-muted-foreground overflow-auto max-h-28">
                {JSON.stringify(r.demo_payload ?? {}, null, 2)}
              </pre>
            </div>

            {/* Trace link */}
            {r.trace_id && (
              <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                <Link
                  href={`/dashboard/traces/${r.trace_id}`}
                  className="font-mono text-accent hover:underline inline-flex items-center gap-1"
                >
                  trace {r.trace_id.slice(0, 12)}...{" "}
                  <ExternalLink size={10} />
                </Link>
                <span className="font-mono">
                  task {r.task_id.slice(0, 12)}...
                </span>
              </div>
            )}
          </Card>
        </div>

        {/* Violations */}
        <div className="col-span-4">
          <Card className="h-full">
            <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Violations ({r.violations.length})
            </div>
            {r.violations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <ShieldCheck size={24} className="text-success mb-2" />
                <div className="text-xs text-success font-medium">
                  No violations detected
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Delegation chain is valid
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {r.violations.map((v, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-border bg-surface px-3 py-2"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-foreground">
                        {v.violation_type}
                      </span>
                      <Badge variant={severityVariant(v.severity)}>
                        {v.severity}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Layer: {v.layer}
                    </div>
                    {Object.keys(v.details).length > 0 && (
                      <pre className="mt-1 text-[10px] font-mono text-muted overflow-auto max-h-20">
                        {JSON.stringify(v.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ─── Pipeline Layers ───────────────────────────────────────────────── */

function PipelineLayers({
  events,
  labels,
}: {
  events: (TraceEvent | undefined)[];
  labels: string[];
}) {
  const statuses = events.map((e, i) => {
    if (!e) return { status: "pending" as const, label: "—", dur: null, detailLine: "" };
    const a = e.attributes as Record<string, unknown>;
    const dur = e.duration_ms;
    let status: "passed" | "blocked" | "flagged" | "skipped" | "pending" = "pending";
    let label = "";
    let detailLine = "";

    switch (labels[i]) {
      case "Rate Limit":
        status = a.allowed === false ? "blocked" : "passed";
        label = a.allowed === false ? "throttled" : "ok";
        break;
      case "Preflight":
        status = a.blocked ? "blocked" : a.idempotent_replay ? "flagged" : "passed";
        label = a.blocked ? "blocked" : a.idempotent_replay ? "replay" : "passed";
        detailLine = a.blocked ? (a.reason as string) || "" : "";
        break;
      case "Schema":
        status = a.valid ? "passed" : "blocked";
        label = a.valid ? "valid" : "mismatch";
        break;
      case "Permissions":
        status = a.allowed ? "passed" : "blocked";
        label = a.allowed ? "permitted" : "denied";
        detailLine = a.non_amplification_enforced ? "non-amplification active" : (a.default_deny ? "default_deny" : "default_allow");
        break;
      case "Rules":
        status = Number(a.violations_count ?? 0) > 0 ? "blocked" : "passed";
        label = Number(a.violations_count ?? 0) > 0 ? `${a.violations_count} match` : "clean";
        if (a.risk_delta != null && Number(a.risk_delta) > 0) detailLine = `Δrisk +${a.risk_delta}`;
        break;
      case "Semantic":
        status = a.called ? (a.injection_detected ? "blocked" : "passed") : "skipped";
        label = a.called ? (a.injection_detected ? "injection" : "clean") : (a.reason as string) || "skipped";
        if (a.called && a.risk_delta != null) detailLine = `Δrisk ${a.risk_delta}`;
        break;
      case "Decision":
        status = a.decision === "allow" ? "passed" : a.decision === "block" ? "blocked" : "flagged";
        label = a.decision as string;
        detailLine = (a.final_reason as string) || `risk ${Number(a.risk_score).toFixed(2)}`;
        break;
    }

    return { status, label, dur, detailLine };
  });

  const colBg = (s: string) =>
    s === "passed" ? "bg-success/5" : s === "blocked" ? "bg-danger/5" : s === "flagged" ? "bg-warning/5" : s === "skipped" ? "bg-surface-elevated/30" : "bg-surface/30";
  const colBorder = (s: string) =>
    s === "passed" ? "border-success/20" : s === "blocked" ? "border-danger/20" : s === "flagged" ? "border-warning/20" : "border-border/50";
  const colText = (s: string) =>
    s === "passed" ? "text-success" : s === "blocked" ? "text-danger" : s === "flagged" ? "text-warning" : "text-muted";
  const dotBg = (s: string) =>
    s === "passed" ? "bg-success" : s === "blocked" ? "bg-danger" : s === "flagged" ? "bg-warning" : "bg-muted";

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {statuses.map((s, i) => (
        <div key={i} className={`rounded border px-2 py-1.5 ${colBg(s.status)} ${colBorder(s.status)}`}>
          <div className="text-[9px] font-medium text-muted-foreground uppercase">{labels[i]}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotBg(s.status)}`} />
            <span className={`text-[10px] font-mono font-medium ${colText(s.status)}`}>{s.label}</span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            {s.detailLine && (
              <span className={`text-[9px] ${colText(s.status)} opacity-70 truncate max-w-[80px]`}>
                {s.detailLine}
              </span>
            )}
            {s.dur != null && (
              <span className={`text-[9px] font-mono ${colText(s.status)} opacity-50 ml-auto`}>
                {s.dur}ms
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
