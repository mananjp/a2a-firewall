"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, demo, getApiKey, setApiKey, tasks, ApiError } from "@/lib/api";
import type { DemoRunResponse } from "@/lib/api";
import type { TraceEvent } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge, decisionVariant, severityVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  Play,
  Loader2,
  ExternalLink,
  KeyRound,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Gauge,
  Layers,
  Bot,
  Database,
  Lock,
  Binary,
  BrainCircuit,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Fingerprint,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Scenario {
  id: string;
  label: string;
  description: string;
  category?: string;
}

interface RunResult {
  scenario: string;
  response: DemoRunResponse;
  timestamp: number;
  traceEvents: TraceEvent[];
}

const FALLBACK_SCENARIOS: Scenario[] = [
  { id: "clean", label: "Clean Request", description: "Normal research query — passes all 6 inspection layers.", category: "Normal" },
  { id: "injection", label: "Prompt Injection", description: "Instruction smuggling & key exfiltration — blocked at Groq/Rules layer.", category: "Attack" },
  { id: "review", label: "Suspicious Export", description: "Ambiguous customer record export with PII — routed to SOC review.", category: "Suspicious" },
  { id: "sql_injection", label: "SQL Injection Attack", description: "Malicious UNION SELECT targeting credential table — blocked at Layer 3 Rule Engine.", category: "Attack" },
  { id: "agentic_pentest", label: "Anti-Pentest Immunity", description: "Automated honeypot canary probe & reconnaissance storm — quarantined at Layer 0 Preflight.", category: "Attack" },
];

export default function LiveDemoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [scenarios, setScenarios] = useState<Scenario[]>(FALLBACK_SCENARIOS);
  const [selected, setSelected] = useState("clean");
  const [running, setRunning] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [currentResult, setCurrentResult] = useState<RunResult | null>(null);
  const [history, setHistory] = useState<RunResult[]>([]);

  useEffect(() => {
    const key = getApiKey();
    setHasApiKey(Boolean(key));
    demo
      .bootstrap()
      .then((res) => {
        if (res.scenarios?.length) {
          // Merge with custom descriptions if needed
          setScenarios(
            res.scenarios.map((s) => ({
              ...s,
              category:
                s.id === "clean"
                  ? "Normal"
                  : s.id === "review"
                  ? "Suspicious"
                  : "Attack",
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  async function handleQuickAuth() {
    setRunning(true);
    setError(null);
    try {
      const res = await auth.login("admin@a2afirewall.dev");
      setApiKey(res.api_key);
      setHasApiKey(true);
      toast({
        title: "Workspace Connected",
        description: "Authenticated with demo workspace key.",
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Authentication Failed",
        description: err instanceof Error ? err.message : "Could not provision demo key. Please use Sign In.",
        variant: "error",
      });
    } finally {
      setRunning(false);
    }
  }

  async function runDemo() {
    if (running) return;
    setRunning(true);
    setError(null);
    setCurrentResult(null);
    setActiveStep(0);

    // Simulate animated packet progress through stages
    const stepInterval = setInterval(() => {
      setActiveStep((prev) => (prev < 6 ? prev + 1 : prev));
    }, 180);

    try {
      const res = (await demo.run(selected)) as DemoRunResponse;
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
      clearInterval(stepInterval);
      setActiveStep(6);
      setCurrentResult(result);
      setHistory((prev) => [result, ...prev].slice(0, 20));
    } catch (err) {
      clearInterval(stepInterval);
      setActiveStep(-1);
      if (err instanceof ApiError && (err.status === 401 || err.message.toLowerCase().includes("workspace key"))) {
        setHasApiKey(false);
        setError("Invalid or missing workspace key. Please connect credentials.");
        toast({
          title: "Authentication Required",
          description: "Your workspace key is missing or expired. Click 'Quick Connect' or sign in.",
          variant: "error",
        });
      } else {
        setError(err instanceof Error ? err.message : "Demo failed");
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          eyebrow="Interactive Attack Simulator"
          title="Live Firewall Attack & Defense Demo"
          description="Simulate live multi-agent attacks against the 6-layer inspection pipeline with real-time packet tracking and diagnostic explainability."
        />
        <div className="flex items-center gap-2 text-[12.5px] text-allow font-mono font-semibold px-3 py-1 rounded-full border border-allow/30 bg-allow/10">
          <span className="h-2 w-2 rounded-full bg-allow animate-pulse" />
          Live Inspection Pipeline
        </div>
      </div>

      {!hasApiKey && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-warning/30 bg-warning-soft/60 p-4 text-warning">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} className="shrink-0" />
            <div className="text-[13px]">
              <span className="font-semibold">Workspace Authentication Required:</span> You need a valid workspace key to inspect live traffic.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button onClick={handleQuickAuth} disabled={running} variant="secondary" className="text-[12px] h-8 font-mono">
              <Sparkles size={13} className="mr-1 text-accent" />
              Quick Connect
            </Button>
            <Button onClick={() => router.push("/login")} variant="secondary" className="text-[12px] h-8 font-mono">
              <KeyRound size={13} className="mr-1" />
              Sign In
            </Button>
          </div>
        </div>
      )}

      {/* Scenario Selector Cards */}
      <div>
        <div className="eyebrow mb-2.5 flex items-center gap-1.5">
          <Sparkles size={13} className="text-accent" />
          <span>Select Attack Scenario or Normal Baseline</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {scenarios.map((sc) => {
            const isSel = selected === sc.id;
            return (
              <button
                key={sc.id}
                onClick={() => !running && setSelected(sc.id)}
                disabled={running}
                className={`rounded-xl border p-3.5 text-left transition-all duration-150 relative ${
                  isSel
                    ? "border-accent bg-accent/10 ring-2 ring-accent/30 shadow-card-hover"
                    : "border-hairline bg-surface hover:border-hairline-strong hover:bg-surface-elevated"
                } ${running ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`text-[9.5px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${
                      sc.id === "clean"
                        ? "text-allow bg-allow/10 border-allow/30"
                        : sc.id === "review"
                        ? "text-review bg-review/10 border-review/30"
                        : "text-block bg-block/10 border-block/30"
                    }`}
                  >
                    {sc.id === "clean" ? "BENIGN" : sc.id === "review" ? "SUSPICIOUS" : "ATTACK"}
                  </span>
                </div>
                <div className="text-[13px] font-semibold text-ink-primary">{sc.label}</div>
                <p className="mt-1 text-[11px] text-ink-muted leading-relaxed line-clamp-2">{sc.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Run Action Bar */}
      <div className="flex items-center gap-3">
        <Button onClick={runDemo} disabled={running} variant="primary" size="lg" className="gap-2 font-mono text-[13px]">
          {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          {running ? "Inspecting Wire Packet..." : "Run Live Attack Demo"}
        </Button>
        {error && (
          <span className="text-[12.5px] text-block bg-block/10 border border-block/30 px-3 py-1.5 rounded-lg font-mono">
            {error}
          </span>
        )}
      </div>

      {/* Live Architecture Flow Diagram & Packet Journey */}
      <div className="material-panel rounded-2xl p-6 relative overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-hairline mb-5">
          <div>
            <div className="eyebrow mb-1 flex items-center gap-1.5">
              <Layers size={13} className="text-accent" />
              <span>Mesh Architecture & Realtime Packet Journey</span>
            </div>
            <h3 className="text-[17px] font-bold text-ink-primary">
              Multi-Layer Inspection Wire Graph
            </h3>
          </div>
          {currentResult && (
            <div className="flex items-center gap-3">
              <Badge
                variant={
                  currentResult.response.decision === "allow"
                    ? "allow"
                    : currentResult.response.decision === "block"
                    ? "block"
                    : "review"
                }
                className="text-[12px] font-mono px-3 py-1 font-bold uppercase"
              >
                FINAL VERDICT: {currentResult.response.decision}
              </Badge>
            </div>
          )}
        </div>

        {/* Horizontal Flow Diagram Nodes */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 relative">
          {/* Node 1: Sender */}
          <FlowDiagramNode
            label="Planner Agent"
            sub="Sender Node"
            icon={<Bot size={15} />}
            step={0}
            activeStep={activeStep}
            status={activeStep >= 0 ? "done" : "idle"}
          />

          {/* Node 2: Ingress Sentinel */}
          <FlowDiagramNode
            label="Sentinel Gateway"
            sub="Wire Ingress"
            icon={<Fingerprint size={15} />}
            step={1}
            activeStep={activeStep}
            status={activeStep >= 1 ? "done" : "idle"}
          />

          {/* Node 3: Layer 0 Preflight */}
          <FlowDiagramNode
            label="L0 Preflight"
            sub="Anti-Pentest & Nonce"
            icon={<ShieldCheck size={15} />}
            step={2}
            activeStep={activeStep}
            status={
              currentResult
                ? currentResult.response.violations.some((v) => v.layer === "preflight")
                  ? "blocked"
                  : "done"
                : activeStep >= 2
                ? "running"
                : "idle"
            }
          />

          {/* Node 4: Layer 1 Schema */}
          <FlowDiagramNode
            label="L1 Schema"
            sub="Type Safety"
            icon={<Binary size={15} />}
            step={3}
            activeStep={activeStep}
            status={
              currentResult
                ? currentResult.response.violations.some((v) => v.layer === "schema")
                  ? "blocked"
                  : "done"
                : activeStep >= 3
                ? "running"
                : "idle"
            }
          />

          {/* Node 5: Layer 2 Permissions */}
          <FlowDiagramNode
            label="L2 Permissions"
            sub="RBAC & Scopes"
            icon={<Lock size={15} />}
            step={4}
            activeStep={activeStep}
            status={
              currentResult
                ? currentResult.response.violations.some((v) => v.layer === "permission")
                  ? "blocked"
                  : "done"
                : activeStep >= 4
                ? "running"
                : "idle"
            }
          />

          {/* Node 6: Layer 3 Rules & SQL Guard */}
          <FlowDiagramNode
            label="L3 Rules & SQL"
            sub="Regex & Queries"
            icon={<Database size={15} />}
            step={5}
            activeStep={activeStep}
            status={
              currentResult
                ? currentResult.response.violations.some((v) => v.layer === "rule" || v.violation_type === "sql_injection")
                  ? "blocked"
                  : "done"
                : activeStep >= 5
                ? "running"
                : "idle"
            }
          />

          {/* Node 7: Layer 4 Groq AI Guard */}
          <FlowDiagramNode
            label="L4 Groq AI"
            sub="Semantic Guard"
            icon={<BrainCircuit size={15} />}
            step={6}
            activeStep={activeStep}
            status={
              currentResult
                ? currentResult.response.violations.some((v) => v.layer === "groq")
                  ? "blocked"
                  : "done"
                : activeStep >= 6
                ? "running"
                : "idle"
            }
          />

          {/* Node 8: Final Destination / Quarantine */}
          <FlowDiagramNode
            label={
              currentResult?.response.decision === "block"
                ? "Quarantine Vault"
                : currentResult?.response.decision === "review"
                ? "SOC Review Queue"
                : "Research Agent"
            }
            sub={
              currentResult?.response.decision === "block"
                ? "Packet Dropped"
                : currentResult?.response.decision === "review"
                ? "Held for Approval"
                : "Authorized Delivery"
            }
            icon={
              currentResult?.response.decision === "block" ? (
                <ShieldAlert size={15} />
              ) : (
                <Bot size={15} />
              )
            }
            step={7}
            activeStep={activeStep}
            status={
              currentResult
                ? currentResult.response.decision === "block"
                  ? "blocked"
                  : currentResult.response.decision === "review"
                  ? "review"
                  : "done"
                : "idle"
            }
          />
        </div>
      </div>

      {/* Result Detail with Risk Meter & Layer Diagnostics */}
      {currentResult && <ResultDetail result={currentResult} />}

      {/* Run History */}
      {history.length > 1 && (
        <div className="mt-6">
          <div className="eyebrow mb-3">Live Run History ({history.length} executions)</div>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-hairline text-left text-[10.5px] uppercase tracking-wide text-ink-muted bg-surface-elevated/40">
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Scenario</th>
                  <th className="px-4 py-2.5 font-medium">Verdict</th>
                  <th className="px-4 py-2.5 font-medium">Violations</th>
                  <th className="px-4 py-2.5 font-medium">Risk Score</th>
                  <th className="px-4 py-2.5 font-medium">Latency</th>
                  <th className="px-4 py-2.5 font-medium">Trace ID</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.timestamp} className="border-t border-hairline/60 transition-colors duration-120 hover:bg-surface-elevated">
                    <td className="px-4 py-2.5 text-[12px] tabular-nums font-mono text-ink-muted">{new Date(r.timestamp).toLocaleTimeString()}</td>
                    <td className="px-4 py-2.5 text-[12px] font-medium text-ink-primary">{r.scenario}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={decisionVariant(r.response.decision)}>{r.response.decision}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11.5px] tabular-nums text-ink-muted">{r.response.violations.length}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] tabular-nums font-bold">{r.response.risk_score.toFixed(2)}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] tabular-nums text-ink-muted">{r.response.latency_ms}ms</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/traces/${r.response.trace_id}`} className="text-[11.5px] font-mono text-accent hover:underline inline-flex items-center gap-1">
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

function FlowDiagramNode({
  label,
  sub,
  icon,
  step,
  activeStep,
  status,
}: {
  label: string;
  sub: string;
  icon: React.ReactNode;
  step: number;
  activeStep: number;
  status: "idle" | "running" | "done" | "blocked" | "review";
}) {
  return (
    <div
      className={`p-3 rounded-xl border flex flex-col items-center text-center transition-all duration-200 relative ${
        status === "blocked"
          ? "border-block/50 bg-block/10 text-block ring-2 ring-block/30 glow-block"
          : status === "review"
          ? "border-review/50 bg-review/10 text-review ring-2 ring-review/30"
          : status === "done"
          ? "border-allow/50 bg-allow/10 text-allow"
          : status === "running"
          ? "border-accent bg-accent/15 text-accent animate-pulse ring-2 ring-accent/30"
          : "border-hairline bg-surface text-ink-muted opacity-60"
      }`}
    >
      <div className="mb-1.5 p-2 rounded-lg bg-surface border border-hairline shadow-sm">
        {icon}
      </div>
      <div className="text-[12px] font-semibold tracking-tight text-ink-primary line-clamp-1">{label}</div>
      <div className="text-[10px] font-mono opacity-80 mt-0.5">{sub}</div>
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
  const layers: Array<{
    name: string;
    event: TraceEvent | undefined;
    status: "passed" | "blocked" | "flagged" | "skipped" | "pending";
  }> = [
    { name: "Layer 0: Preflight & Anti-Pentest", event: preflight, status: preflight ? (a(preflight).blocked ? "blocked" : "passed") : "pending" },
    { name: "Layer 1: Schema", event: schema, status: schema ? (a(schema).valid ? "passed" : "blocked") : "pending" },
    { name: "Layer 2: Permissions", event: perms, status: perms ? (a(perms).allowed ? "passed" : "blocked") : "pending" },
    { name: "Layer 3: Rules & SQL Guard", event: rules, status: rules ? (Number(a(rules).violations_count ?? 0) > 0 ? "blocked" : "passed") : "pending" },
    { name: "Layer 4: Semantic (Groq)", event: groq, status: groq ? (a(groq).called ? (a(groq).injection_detected ? "blocked" : "passed") : "skipped") : "pending" },
    { name: "Layer 5: Decision Gate", event: decision, status: decision ? (a(decision).decision === "allow" ? "passed" : a(decision).decision === "block" ? "blocked" : "flagged") : "pending" },
  ];

  function statusStyle(s: string) {
    switch (s) {
      case "passed":
        return "border-allow/30 bg-allow/10 text-allow";
      case "blocked":
        return "border-block/30 bg-block/10 text-block";
      case "flagged":
        return "border-review/30 bg-review/10 text-review";
      case "skipped":
        return "border-hairline bg-surface-elevated text-ink-muted";
      default:
        return "border-hairline bg-surface text-ink-muted";
    }
  }

  const riskPct = Math.min(100, Math.max(0, r.risk_score * 100));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* 6-Layer Diagnostic Breakdown */}
      <div className="lg:col-span-4">
        <Card className="h-full">
          <div className="eyebrow mb-3 flex items-center justify-between">
            <span>Inspection Layer Verdicts</span>
            <span className="text-[10.5px] font-mono text-ink-muted">6 Sequential Gates</span>
          </div>
          <div className="space-y-2">
            {layers.map((l, i) => {
              const dur = l.event?.duration_ms;
              return (
                <div key={i} className={`rounded-xl border p-3 ${statusStyle(l.status)}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-ink-primary">{l.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={l.status === "passed" ? "allow" : l.status === "blocked" ? "block" : "review"}>
                        {l.status}
                      </Badge>
                      {dur != null && <span className="text-[10.5px] font-mono tabular-nums text-ink-muted">{dur}ms</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Decision & Risk Meter Gauge */}
      <div className="lg:col-span-5">
        <Card className="h-full space-y-4">
          <div>
            <div className="eyebrow mb-2">Verdict & Risk Analysis</div>
            <div className="flex items-center justify-between p-3 rounded-xl border border-hairline bg-surface-elevated">
              <div className="flex items-center gap-2.5">
                {r.decision === "allow" ? (
                  <CheckCircle2 size={22} className="text-allow" />
                ) : r.decision === "block" ? (
                  <XCircle size={22} className="text-block" />
                ) : (
                  <AlertTriangle size={22} className="text-review" />
                )}
                <div>
                  <div className="text-[15px] font-bold text-ink-primary font-mono uppercase">{r.decision}</div>
                  <div className="text-[11px] text-ink-muted font-mono">{r.latency_ms}ms total execution time</div>
                </div>
              </div>
              <Badge variant={decisionVariant(r.decision)} className="text-[12px] font-mono px-3 py-1">
                {r.decision.toUpperCase()}
              </Badge>
            </div>
          </div>

          {/* Risk Gauge Bar */}
          <div>
            <div className="flex items-center justify-between text-[11.5px] font-mono mb-1.5">
              <span className="text-ink-muted">Cumulative Risk Score</span>
              <span className="font-bold text-ink-primary font-mono">{r.risk_score.toFixed(3)} / 1.000</span>
            </div>
            <div className="h-3 w-full rounded-full bg-surface-sunken border border-hairline overflow-hidden p-0.5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${riskPct}%` }}
                transition={{ duration: 0.5 }}
                className={`h-full rounded-full ${
                  r.risk_score >= 0.8
                    ? "bg-block glow-block"
                    : r.risk_score >= 0.3
                    ? "bg-review"
                    : "bg-allow"
                }`}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-ink-muted mt-1">
              <span>0.0 (Safe)</span>
              <span>0.3 (Groq Review)</span>
              <span>0.8 (Hard Block)</span>
            </div>
          </div>

          {r.block_reason && (
            <div className="rounded-xl border border-block/40 bg-block/10 p-3 text-[12px] text-block font-mono">
              <span className="font-bold">Interception Reason:</span> {r.block_reason}
            </div>
          )}

          <div>
            <div className="eyebrow mb-1.5">Inspected Wire Payload</div>
            <pre className="rounded-xl border border-hairline bg-surface-sunken p-3 text-[11px] font-mono text-ink-primary overflow-auto max-h-36">
              {JSON.stringify(r.demo_payload ?? {}, null, 2)}
            </pre>
          </div>
        </Card>
      </div>

      {/* Violations Details */}
      <div className="lg:col-span-3">
        <Card className="h-full">
          <div className="eyebrow mb-3 flex items-center justify-between">
            <span>Violations ({r.violations.length})</span>
            <ShieldAlert size={14} className="text-block" />
          </div>
          {r.violations.length === 0 ? (
            <div className="text-[12.5px] text-allow py-8 text-center border border-dashed border-allow/30 rounded-xl bg-allow/5">
              Zero security violations. Payload is clean.
            </div>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {r.violations.map((v, i) => (
                <div key={i} className="rounded-xl border border-hairline bg-surface-elevated p-3 text-[12px]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono font-bold text-ink-primary">{v.violation_type}</span>
                    <Badge variant={severityVariant(v.severity)}>{v.severity}</Badge>
                  </div>
                  <div className="text-[10.5px] text-ink-muted font-mono mb-1">Trigger Layer: {v.layer}</div>
                  {Object.keys(v.details).length > 0 && (
                    <pre className="p-2 rounded-lg bg-surface-sunken text-[10px] font-mono text-ink-muted overflow-auto max-h-24">
                      {JSON.stringify(v.details, null, 1)}
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
