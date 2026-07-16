"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { demo, tasks } from "@/lib/api";
import type { DemoRunResponse } from "@/lib/api";
import type { TraceEvent } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge, decisionVariant, severityVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Loader2, ExternalLink } from "lucide-react";

interface Scenario { id: string; label: string; description: string }
interface RunResult {
  scenario: string; response: DemoRunResponse; timestamp: number;
  traceEvents: TraceEvent[];
}

const FALLBACK_SCENARIOS: Scenario[] = [
  { id: "clean", label: "Clean Request", description: "Normal research query — should pass all layers." },
  { id: "injection", label: "Prompt Injection", description: "Instruction smuggling — blocked at rules layer." },
  { id: "review", label: "Suspicious Request", description: "Ambiguous data export — flagged for review." },
];

export default function LiveDemoPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>(FALLBACK_SCENARIOS);
  const [selected, setSelected] = useState("clean");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<RunResult | null>(null);
  const [history, setHistory] = useState<RunResult[]>([]);

  useEffect(() => {
    demo.bootstrap().then((res) => {
      if (res.scenarios?.length) setScenarios(res.scenarios);
    }).catch(() => {});
  }, []);

  async function runDemo() {
    if (running) return;
    setRunning(true); setError(null); setCurrentResult(null);
    try {
      const res = await demo.run(selected) as DemoRunResponse;
      let traceEvents: TraceEvent[] = [];
      if (res.trace_id) {
        try { traceEvents = await tasks.trace(res.trace_id) as TraceEvent[]; } catch {}
      }
      const result: RunResult = { scenario: selected, response: res, timestamp: Date.now(), traceEvents };
      setCurrentResult(result);
      setHistory((prev) => [result, ...prev].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo failed");
    } finally { setRunning(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Live Attack Demo" description="Real traffic through the inspection pipeline — trace events shown." />
        <div className="flex items-center gap-2 text-xs text-success">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          Real Pipeline
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {scenarios.map((sc) => (
          <button key={sc.id} onClick={() => !running && setSelected(sc.id)} disabled={running}
            className={`rounded-lg border p-3 text-left transition-all ${selected === sc.id ? "border-accent/40 bg-accent/5 ring-1 ring-accent/30" : "border-border bg-surface hover:border-border/80 hover:bg-surface-elevated/50"} ${running ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <div className="text-xs font-medium text-foreground">{sc.label}</div>
            <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">{sc.description}</p>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-6">
        <Button onClick={runDemo} disabled={running} variant="secondary">
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? "Inspecting..." : "Run Demo"}
        </Button>
        {error && <span className="text-xs text-danger bg-danger/5 border border-danger/20 px-2 py-1 rounded">{error}</span>}
      </div>

      {currentResult && <ResultDetail result={currentResult} />}

      {history.length > 1 && (
        <div className="mt-6">
          <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Run History ({history.length})</div>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Scenario</th>
                  <th className="px-4 py-2.5 font-medium">Decision</th>
                  <th className="px-4 py-2.5 font-medium">Layers</th>
                  <th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="px-4 py-2.5 font-medium">Latency</th>
                  <th className="px-4 py-2.5 font-medium">Trace</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.timestamp} className="border-t border-border/50 transition-colors hover:bg-surface-elevated/50">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(r.timestamp).toLocaleTimeString()}</td>
                    <td className="px-4 py-2.5 text-xs">{r.scenario}</td>
                    <td className="px-4 py-2.5"><Badge variant={decisionVariant(r.response.decision)}>{r.response.decision}</Badge></td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{r.traceEvents.length}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.response.risk_score.toFixed(2)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">{r.response.latency_ms}ms</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/traces/${r.response.trace_id}`} className="text-[11px] font-mono text-accent hover:underline inline-flex items-center gap-1">
                        {r.response.trace_id?.slice(0, 8)} <ExternalLink size={10} />
                      </Link>
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

function ResultDetail({ result }: { result: RunResult }) {
  const r = result.response;
  const traceMap = new Map<string, TraceEvent>();
  for (const ev of result.traceEvents) {
    traceMap.set(ev.event_name, ev);
  }
  const preflight = traceMap.get("firewall.preflight");
  const schema = traceMap.get("firewall.schema");
  const perms = traceMap.get("firewall.permissions");
  const rules = traceMap.get("firewall.rules");
  const groq = traceMap.get("firewall.groq");
  const decision = traceMap.get("firewall.decision");

  const a = (e: TraceEvent | undefined) => e?.attributes ?? {};
  const layers: Array<{ name: string; event: TraceEvent | undefined; status: "passed" | "blocked" | "flagged" | "skipped" | "pending" }> = [
    { name: "Layer 0: Preflight", event: preflight, status: preflight ? (a(preflight).blocked ? "blocked" : "passed") : "pending" },
    { name: "Layer 1: Schema", event: schema, status: schema ? (a(schema).valid ? "passed" : "blocked") : "pending" },
    { name: "Layer 2: Permissions", event: perms, status: perms ? (a(perms).allowed ? "passed" : "blocked") : "pending" },
    { name: "Layer 3: Rules", event: rules, status: rules ? ((Number(a(rules).violations_count ?? 0)) > 0 ? "blocked" : "passed") : "pending" },
    { name: "Layer 4: Semantic (Groq)", event: groq, status: groq ? (a(groq).called ? (a(groq).injection_detected ? "blocked" : "passed") : "skipped") : "pending" },
    { name: "Layer 5: Decision", event: decision, status: decision ? (a(decision).decision === "allow" ? "passed" : a(decision).decision === "block" ? "blocked" : "flagged") : "pending" },
  ];

  function statusStyle(s: string) {
    switch (s) {
      case "passed": return "border-success/30 bg-success/10 text-success";
      case "blocked": return "border-danger/30 bg-danger/10 text-danger";
      case "flagged": return "border-warning/30 bg-warning/10 text-warning";
      case "skipped": return "border-border bg-surface-elevated text-muted";
      default: return "border-border bg-surface text-muted";
    }
  }

  function renderLayerDetails(name: string, attrs: Record<string, any> | undefined) {
    if (!attrs) return null;
    switch (name) {
      case "Layer 0: Preflight":
        return attrs.blocked ? <span className="text-[10px]">{attrs.reason || "blocked"}</span>
          : attrs.idempotent_replay ? <span className="text-[10px] text-warning">idempotent replay</span>
          : <span className="text-[10px]">request accepted</span>;
      case "Layer 1: Schema":
        return attrs.valid === false ? <span className="text-[10px]">schema mismatch ({attrs.violations_count} violations)</span>
          : <span className="text-[10px]">payload valid</span>;
      case "Layer 2: Permissions":
        return attrs.allowed === false ? <span className="text-[10px]">sender not permitted</span>
          : <span className="text-[10px]">sender permitted ({attrs.default_deny ? "default_deny" : "default_allow"})</span>;
      case "Layer 3: Rules":
        return (
          <div className="space-y-0.5">
            {Number(attrs.violations_count) > 0 && <span className="text-[10px]">{attrs.violations_count} violation(s) · Δrisk +{attrs.risk_delta}</span>}
            {Number(attrs.violations_count) === 0 && <span className="text-[10px]">no violations</span>}
            {attrs.matched_rule_action && <span className="text-[9px] block">action: {attrs.matched_rule_action}</span>}
          </div>
        );
      case "Layer 4: Semantic (Groq)":
        return attrs.called === false ? <span className="text-[10px]">{attrs.reason || "not triggered"}</span>
          : (
            <div className="space-y-0.5">
              <span className="text-[10px]">{attrs.injection_detected ? "injection detected" : "clean"}</span>
              {attrs.risk_delta != null && <span className="text-[9px] block">Δrisk +{attrs.risk_delta}</span>}
              {attrs.rationale_excerpt && <span className="text-[9px] block opacity-60 truncate max-w-full">{attrs.rationale_excerpt.slice(0, 60)}...</span>}
            </div>
          );
      case "Layer 5: Decision":
        return (
          <div className="space-y-0.5">
            <span className={`text-[10px] font-semibold ${attrs.decision === "allow" ? "text-success" : attrs.decision === "block" ? "text-danger" : "text-warning"}`}>{attrs.decision}</span>
            <span className="text-[9px] block">risk {Number(attrs.risk_score).toFixed(2)}</span>
            {attrs.final_reason && <span className="text-[9px] block opacity-60">{attrs.final_reason}</span>}
          </div>
        );
      default:
        return <pre className="text-[10px] font-mono opacity-60">{JSON.stringify(attrs, null, 1).slice(0, 120)}</pre>;
    }
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Pipeline layers from real trace events */}
      <div className="col-span-4">
        <Card>
          <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Inspection Pipeline <span className="text-muted normal-case">({result.traceEvents.length} events)</span>
          </div>
          <div className="space-y-1.5">
            {layers.map((l, i) => {
              const dur = l.event?.duration_ms;
              const attrs = l.event?.attributes as Record<string, any> | undefined;
              return (
                <div key={i} className={`rounded-md border px-3 py-2 ${statusStyle(l.status)}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{l.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={l.status === "passed" ? "success" : l.status === "blocked" ? "danger" : l.status === "flagged" ? "warning" : l.status === "skipped" ? "info" : "default"}>
                        {l.status}
                      </Badge>
                      {dur != null && <span className="text-[10px] font-mono opacity-60">{dur}ms</span>}
                    </div>
                  </div>
                  {renderLayerDetails(l.name, attrs)}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Decision + Metadata */}
      <div className="col-span-5">
        <Card>
          <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Decision</div>
          <div className="flex items-center gap-3 mb-4">
            <Badge variant={decisionVariant(r.decision)} className="text-sm">{r.decision.toUpperCase()}</Badge>
            <span className="text-sm text-muted-foreground">Risk: <span className="font-mono text-foreground">{r.risk_score.toFixed(2)}</span></span>
          </div>
          {r.block_reason && (
            <div className="mb-3 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">{r.block_reason}</div>
          )}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MetaBox label="Latency" value={`${r.latency_ms}ms`} />
            <MetaBox label="Scenario" value={result.scenario} />
            <MetaBox label="Task ID" value={r.task_id.slice(0, 12) + "..."} mono />
            <div className="rounded-md border border-border bg-surface px-3 py-2">
              <div className="text-[10px] text-muted-foreground uppercase">Trace</div>
              <Link href={`/dashboard/traces/${r.trace_id ?? ""}`} className="text-xs font-mono text-accent hover:underline inline-flex items-center gap-1">
                {r.trace_id?.slice(0, 12)}... <ExternalLink size={10} />
              </Link>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Inspected Payload</div>
            <pre className="rounded-md border border-border bg-surface p-3 text-[11px] font-mono text-muted-foreground overflow-auto max-h-40">
              {JSON.stringify(r.demo_payload ?? {}, null, 2)}
            </pre>
          </div>
        </Card>
      </div>

      {/* Violations */}
      <div className="col-span-3">
        <Card className="h-full">
          <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Violations ({r.violations.length})</div>
          {r.violations.length === 0 ? (
            <div className="text-xs text-success py-4 text-center">No violations detected</div>
          ) : (
            <div className="space-y-2">
              {r.violations.map((v, i) => (
                <div key={i} className="rounded-md border border-border bg-surface px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-foreground">{v.violation_type}</span>
                    <Badge variant={severityVariant(v.severity)}>{v.severity}</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground">Layer: {v.layer}</div>
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
  );
}

function MetaBox({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className={`text-sm font-medium ${mono ? "font-mono text-xs text-muted-foreground truncate" : ""}`}>{value}</div>
    </div>
  );
}
