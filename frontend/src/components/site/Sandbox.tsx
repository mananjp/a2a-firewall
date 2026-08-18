"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, RotateCcw, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

export type Verdict = "ALLOW" | "BLOCK" | "REVIEW";

const GATES = [
  { id: "L1", name: "Rate Limiter" },
  { id: "L2", name: "Preflight" },
  { id: "L3", name: "Schema" },
  { id: "L4", name: "Permissions" },
  { id: "L5", name: "Rule Engine" },
  { id: "L6", name: "Groq Guard" },
];

type Scenario = {
  id: string;
  name: string;
  intent: string;
  failAt: number | null;
  verdict: Verdict;
  risk: number;
  logs: string[];
  reason: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: "01",
    name: "Clean Task",
    intent: "market_analytics.summarize",
    failAt: null,
    verdict: "ALLOW",
    risk: 3,
    reason: "All six gates passed. Verdict emitted with cryptographic lineage.",
    logs: [
      "L1 rate_limiter: 12/600 rpm — pass",
      "L2 preflight: ed25519 signature valid, nonce fresh (120ms)",
      "L3 schema: payload conforms to market_analytics.summarize@v2",
      "L4 permissions: macaroon caveat scope:market_analytics.read — ok",
      "L5 rules: 0/48 deny rules matched",
      "L6 groq_guard: intent drift 0.04 — aligned",
    ],
  },
  {
    id: "02",
    name: "Prompt Injection",
    intent: "market_analytics.summarize",
    failAt: 5,
    verdict: "BLOCK",
    risk: 94,
    reason: "Indirect prompt injection detected in tool output at semantic gate L6.",
    logs: [
      "L1 rate_limiter: 41/600 rpm — pass",
      "L2 preflight: ed25519 signature valid",
      "L3 schema: payload conforms — pass",
      "L4 permissions: caveat chain intact — pass",
      "L5 rules: heuristic 'ignore previous instructions' — soft flag",
      "L6 groq_guard: injection confidence 0.97 — DENY",
    ],
  },
  {
    id: "03",
    name: "Privilege Escalation",
    intent: "treasury.transfer",
    failAt: 3,
    verdict: "BLOCK",
    risk: 88,
    reason: "Sub-delegated agent requested scope wider than its attenuated macaroon.",
    logs: [
      "L1 rate_limiter: 7/600 rpm — pass",
      "L2 preflight: signature valid, depth:2",
      "L3 schema: treasury.transfer@v1 — pass",
      "L4 permissions: scope:treasury.write not in caveat chain — DENY",
      "L5 rules: skipped (fail-closed)",
      "L6 groq_guard: skipped (fail-closed)",
    ],
  },
  {
    id: "04",
    name: "Cryptographic Replay",
    intent: "market_analytics.summarize",
    failAt: 1,
    verdict: "BLOCK",
    risk: 76,
    reason: "Nonce already observed within the 300s replay cache window.",
    logs: [
      "L1 rate_limiter: 3/600 rpm — pass",
      "L2 preflight: nonce 0x9f18a24c seen 41s ago — DENY",
      "L3 schema: skipped (fail-closed)",
      "L4 permissions: skipped (fail-closed)",
      "L5 rules: skipped (fail-closed)",
      "L6 groq_guard: skipped (fail-closed)",
    ],
  },
];

type GateState = "idle" | "active" | "pass" | "fail" | "skip";

export function Sandbox() {
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]!);
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setRunning(false);
    setStep(-1);
  }, []);

  useEffect(() => reset, [reset]);

  useEffect(() => {
    if (!running) return;
    if (step >= GATES.length - 1) {
      setRunning(false);
      return;
    }
    timer.current = setTimeout(() => setStep((s) => s + 1), 620 / speed);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [running, step, speed]);

  const dispatch = () => {
    setStep(-1);
    setRunning(true);
    setTimeout(() => setStep(0), 10);
  };

  const failIdx = scenario.failAt;
  const finished = !running && step >= GATES.length - 1;
  const blocked = failIdx !== null && step >= failIdx;

  const gateState = (i: number): GateState => {
    if (step < i) return "idle";
    if (failIdx !== null && i > failIdx && step >= failIdx) return "skip";
    if (failIdx === i) return "fail";
    if (step === i && running) return "active";
    return "pass";
  };

  const latency = step < 0 ? 0 : Math.min((step + 1) * 2.9, 17.4);
  const risk = step < 0 ? 0 : blocked ? scenario.risk : Math.max(3, 3 + step);

  return (
    <div className="border border-ink">
      {/* control bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-ink bg-ink px-4 py-3 text-paper">
        <span className="label-mono">Live Sandbox</span>
        <span className="label-mono text-paper/50">inter-agent request flow</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="label-mono text-paper/50">Speed</span>
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`border px-2 py-1 font-mono text-[11px] ${
                speed === s
                  ? "border-lime bg-lime text-lime-foreground"
                  : "border-paper/30 text-paper/70 hover:border-paper"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* scenarios */}
        <div className="border-b border-ink lg:border-b-0 lg:border-r">
          {SCENARIOS.map((s) => {
            const on = s.id === scenario.id;
            return (
              <button
                key={s.id}
                onClick={() => {
                  reset();
                  setScenario(s);
                }}
                className={`flex w-full items-center gap-3 border-b border-ink/15 px-4 py-4 text-left transition-colors ${
                  on ? "bg-violet text-violet-foreground" : "hover:bg-secondary"
                }`}
              >
                <span className={`font-mono text-xs ${on ? "text-violet-foreground/70" : "text-muted-foreground"}`}>
                  /{s.id}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-sm font-bold uppercase tracking-tight">
                    {s.name}
                  </span>
                  <span className={`block truncate font-mono text-[11px] ${on ? "text-violet-foreground/70" : "text-muted-foreground"}`}>
                    {s.intent}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="flex gap-2 p-4">
            <button
              onClick={dispatch}
              disabled={running}
              className="inline-flex flex-1 items-center justify-center gap-2 border border-ink bg-ink px-3 py-3 label-mono text-paper transition-colors hover:bg-violet hover:border-violet disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" /> Dispatch
            </button>
            <button
              onClick={reset}
              className="inline-flex items-center justify-center border border-ink px-3 py-3 transition-colors hover:bg-secondary"
              aria-label="Reset simulation"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* pipeline */}
        <div className="grid-paper">
          <div className="grid grid-cols-2 border-b border-ink/20 sm:grid-cols-4">
            <Metric label="Status" value={step < 0 ? "READY" : running ? "INSPECTING" : scenario.verdict} />
            <Metric label="Latency" value={`${latency.toFixed(1)}ms`} />
            <Metric label="Risk" value={`${risk}%`} />
            <Metric label="Fail Mode" value="CLOSED" />
          </div>

          <div className="grid gap-px bg-ink/15 p-px sm:grid-cols-3 lg:grid-cols-6">
            {GATES.map((g, i) => {
              const st = gateState(i);
              return (
                <div
                  key={g.id}
                  className={`bg-paper px-3 py-5 ${st === "active" ? "scan-pulse bg-lime" : ""} ${
                    st === "pass" ? "bg-lime/40" : ""
                  } ${st === "fail" ? "bg-danger text-destructive-foreground" : ""} ${
                    st === "skip" ? "opacity-40" : ""
                  }`}
                >
                  <div className="font-mono text-[11px] opacity-70">{g.id}</div>
                  <div className="mt-1 font-display text-xs font-bold uppercase leading-tight">{g.name}</div>
                  <div className="mt-3 h-1 w-full bg-ink/15">
                    <div
                      className="h-full transition-all duration-300 bg-ink"
                      style={{ width: st === "idle" || st === "skip" ? "0%" : "100%" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* terminal */}
          <div className="border-t border-ink/20 bg-ink p-4 text-paper">
            <div className="label-mono text-paper/50">a2a-kernel@mesh-soc:~ kernel trace</div>
            <pre className="mt-3 min-h-[132px] overflow-x-auto font-mono text-[11px] leading-relaxed">
              {step < 0
                ? "// awaiting dispatch..."
                : scenario.logs
                    .slice(0, step + 1)
                    .map((l, i) => `${String(i + 1).padStart(2, "0")}  ${l}`)
                    .join("\n")}
            </pre>
          </div>

          {finished && (
            <div
              className={`flex flex-wrap items-center gap-3 border-t border-ink px-4 py-4 ${
                scenario.verdict === "ALLOW" ? "bg-lime text-lime-foreground" : "bg-danger text-destructive-foreground"
              }`}
            >
              {scenario.verdict === "ALLOW" ? (
                <ShieldCheck className="h-4 w-4" />
              ) : scenario.verdict === "REVIEW" ? (
                <ShieldAlert className="h-4 w-4" />
              ) : (
                <ShieldX className="h-4 w-4" />
              )}
              <span className="label-mono">Verdict: {scenario.verdict}</span>
              <span className="font-mono text-xs">{scenario.reason}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-ink/15 px-4 py-3 last:border-r-0">
      <div className="label-mono text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-sm font-bold">{value}</div>
    </div>
  );
}
