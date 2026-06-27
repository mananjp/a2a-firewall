import { useState, useCallback, useRef } from "react";
import { demo } from "../api/client";
import type { DemoRunResponse } from "../api/client";
import DemoTrafficLane from "../components/demo/DemoTrafficLane";
import DemoLayerTimeline from "../components/demo/DemoLayerTimeline";
import type { LayerState, LayerStatus } from "../components/demo/DemoLayerTimeline";
import DemoEventFeed from "../components/demo/DemoEventFeed";
import type { DemoEvent } from "../components/demo/DemoEventFeed";
import DemoRiskGauge from "../components/demo/DemoRiskGauge";
import DemoViolationPanel from "../components/demo/DemoViolationPanel";

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------
type ScenarioId = "clean" | "injection" | "review";

interface Scenario {
  id: ScenarioId;
  label: string;
  icon: string;
  description: string;
  badgeColor: string;
  expectedOutcome: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "clean",
    label: "Clean Request",
    icon: "✅",
    description: "A normal research query — should pass all layers.",
    badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    expectedOutcome: "Allowed",
  },
  {
    id: "injection",
    label: "Prompt Injection",
    icon: "🚨",
    description: "Contains instruction smuggling — should be blocked.",
    badgeColor: "bg-red-500/15 text-red-400 border-red-500/30",
    expectedOutcome: "Blocked",
  },
  {
    id: "review",
    label: "Suspicious Request",
    icon: "⚠️",
    description: "Ambiguous data export — may be flagged for human review.",
    badgeColor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    expectedOutcome: "Review",
  },
];

// ---------------------------------------------------------------------------
// Initial layer states
// ---------------------------------------------------------------------------
function initialLayers(): LayerState[] {
  return [
    { name: "preflight", label: "Layer 0 — Preflight", status: "pending" },
    { name: "schema", label: "Layer 1 — Schema", status: "pending" },
    { name: "permissions", label: "Layer 2 — Permissions", status: "pending" },
    { name: "rules", label: "Layer 3 — Rules/Patterns", status: "pending" },
    { name: "groq", label: "Layer 4 — Semantic (Groq)", status: "pending" },
    { name: "decision", label: "Layer 5 — Final Decision", status: "pending" },
  ];
}

// ---------------------------------------------------------------------------
// Demo phase type
// ---------------------------------------------------------------------------
type TrafficPhase = "idle" | "sending" | "inspecting" | "allowed" | "blocked" | "review";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function LiveDemoPage() {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>("clean");
  const [running, setRunning] = useState(false);
  const [trafficPhase, setTrafficPhase] = useState<TrafficPhase>("idle");
  const [layers, setLayers] = useState<LayerState[]>(initialLayers());
  const [animateLayers, setAnimateLayers] = useState(false);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [riskScore, setRiskScore] = useState(0);
  const [animateGauge, setAnimateGauge] = useState(false);
  const [result, setResult] = useState<DemoRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoHistory, setDemoHistory] = useState<Array<{ scenario: ScenarioId; decision: string; risk: number; time: string }>>([]);

  const eventIdCounter = useRef(0);

  const addEvent = useCallback((label: string, type: DemoEvent["type"] = "info") => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    eventIdCounter.current += 1;
    const ev: DemoEvent = { id: `evt-${eventIdCounter.current}`, time, label, type };
    setEvents((prev) => [...prev, ev]);
  }, []);

  const updateLayer = useCallback((index: number, status: LayerStatus, detail?: string) => {
    setLayers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], status, detail: detail ?? next[index].detail };
      return next;
    });
  }, []);

  // -----------------------------------------------------------------------
  // Run demo
  // -----------------------------------------------------------------------
  const runDemo = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setEvents([]);
    setLayers(initialLayers());
    setRiskScore(0);
    setAnimateGauge(false);
    setAnimateLayers(true);

    // Phase 1: Sending
    setTrafficPhase("sending");
    addEvent("Demo initiated — scenario: " + selectedScenario, "info");

    await sleep(400);
    addEvent("Planner agent received task", "info");

    await sleep(500);
    addEvent("Task forwarded to firewall for inspection", "info");
    setTrafficPhase("inspecting");

    // Phase 2: Simulate layers running while API call happens
    addEvent("Firewall inspection started", "info");
    updateLayer(0, "running");

    await sleep(300);
    updateLayer(0, "passed", "Identity verified");
    addEvent("Preflight check passed", "success");
    updateLayer(1, "running");

    await sleep(250);
    updateLayer(1, "passed", "Schema valid");
    addEvent("Schema validation passed", "success");
    updateLayer(2, "running");

    await sleep(250);
    updateLayer(2, "passed", "Permissions verified");
    addEvent("Permission check passed", "success");
    updateLayer(3, "running");
    addEvent("Running pattern rules…", "info");

    // Fire the actual API call
    let apiResult: DemoRunResponse;
    try {
      apiResult = await demo.run(selectedScenario);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setRunning(false);
      setTrafficPhase("idle");
      addEvent("Error: " + msg, "danger");
      return;
    }

    // Phase 3: Resolve remaining layers based on actual result
    const isBlocked = apiResult.decision === "block";
    const isReview = apiResult.decision === "review";
    const hasViolations = apiResult.violations.length > 0;

    await sleep(300);

    if (hasViolations && isBlocked) {
      // Check if it's a rule-level block or semantic
      const hasRuleViolation = apiResult.violations.some((v) => v.layer === "rule");
      const hasSemanticViolation = apiResult.violations.some((v) => v.layer === "semantic");

      if (hasRuleViolation) {
        updateLayer(3, "flagged", "Forbidden pattern detected");
        addEvent("⚠ Forbidden pattern matched in payload", "warning");
      } else {
        updateLayer(3, "passed");
        addEvent("Pattern rules passed", "success");
      }

      await sleep(300);
      addEvent("Risk score elevated — invoking Groq semantic analysis", "warning");
      updateLayer(4, "running");

      await sleep(500);

      if (hasSemanticViolation) {
        updateLayer(4, "blocked", "Prompt injection detected");
        addEvent("🚨 Groq detected prompt injection attempt", "danger");
      } else {
        updateLayer(4, hasRuleViolation ? "flagged" : "passed", hasRuleViolation ? "Risk elevated" : "No semantic issues");
        addEvent("Groq analysis complete", "info");
      }

      await sleep(300);
      updateLayer(5, "blocked", `Decision: BLOCK — risk ${apiResult.risk_score.toFixed(2)}`);
      addEvent(`DECISION: BLOCKED — risk score ${apiResult.risk_score.toFixed(2)}`, "danger");

      if (apiResult.block_reason) {
        addEvent(`Reason: ${apiResult.block_reason}`, "danger");
      }
    } else if (isReview) {
      updateLayer(3, "flagged", "Suspicious patterns found");
      addEvent("⚠ Suspicious patterns detected", "warning");

      await sleep(300);
      updateLayer(4, "running");
      addEvent("Invoking Groq for semantic analysis…", "info");

      await sleep(500);
      updateLayer(4, "flagged", "Content flagged for review");
      addEvent("Groq flagged content for human review", "warning");

      await sleep(300);
      updateLayer(5, "flagged", `Decision: REVIEW — risk ${apiResult.risk_score.toFixed(2)}`);
      addEvent(`DECISION: HELD FOR REVIEW — risk score ${apiResult.risk_score.toFixed(2)}`, "warning");
      addEvent("Review token generated for human reviewer", "info");
    } else {
      // Allowed
      updateLayer(3, "passed", "No rule matches");
      addEvent("Pattern rules passed — no matches", "success");

      await sleep(300);
      updateLayer(4, "skipped", "Below threshold");
      addEvent("Groq skipped — risk below threshold", "info");

      await sleep(200);
      updateLayer(5, "passed", `Decision: ALLOW — risk ${apiResult.risk_score.toFixed(2)}`);
      addEvent(`DECISION: ALLOWED — risk score ${apiResult.risk_score.toFixed(2)}`, "success");
    }

    // Phase 4: Final UI updates
    setResult(apiResult);
    setRiskScore(apiResult.risk_score);
    setAnimateGauge(true);
    setTrafficPhase(isBlocked ? "blocked" : isReview ? "review" : "allowed");

    addEvent(`Inspection completed in ${apiResult.latency_ms}ms`, "info");

    // Add to history
    setDemoHistory((prev) => [
      {
        scenario: selectedScenario,
        decision: apiResult.decision,
        risk: apiResult.risk_score,
        time: new Date().toLocaleTimeString("en-US", { hour12: false }),
      },
      ...prev,
    ].slice(0, 10));

    setRunning(false);
  }, [running, selectedScenario, addEvent, updateLayer]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <span className="text-3xl">🔥</span>
            Live Attack Demo
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Watch the firewall inspect, score, and decide on live agent traffic in real time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-xs text-emerald-400 font-medium">Real Pipeline</span>
        </div>
      </div>

      {/* Scenario selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {SCENARIOS.map((sc) => (
          <button
            key={sc.id}
            onClick={() => !running && setSelectedScenario(sc.id)}
            disabled={running}
            className={`card text-left transition-all duration-200 cursor-pointer ${
              selectedScenario === sc.id
                ? "ring-2 ring-blue-500/60 border-blue-500/40"
                : "hover:border-slate-600 hover:bg-slate-800/60"
            } ${running ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{sc.icon}</span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-100">{sc.label}</div>
                <p className="text-xs text-slate-400 mt-0.5">{sc.description}</p>
                <div className="mt-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${sc.badgeColor}`}>
                    Expected: {sc.expectedOutcome}
                  </span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Run button */}
      <div className="flex items-center gap-4">
        <button
          onClick={runDemo}
          disabled={running}
          className={`relative px-6 py-2.5 rounded-lg font-semibold text-sm transition-all duration-300 ${
            running
              ? "bg-slate-700 text-slate-400 cursor-not-allowed"
              : "bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white hover:shadow-lg hover:shadow-blue-500/25 hover:scale-[1.02] active:scale-[0.98]"
          }`}
        >
          {running ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-slate-500 border-t-white rounded-full animate-spin" />
              Running…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              ▶ Run Demo
            </span>
          )}
        </button>

        {!running && result && (
          <button
            onClick={runDemo}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            ↻ Run Again
          </button>
        )}

        {error && (
          <span className="text-xs text-red-400 bg-red-900/30 border border-red-500/30 px-3 py-1.5 rounded-lg">
            {error}
          </span>
        )}
      </div>

      {/* Traffic lane — full width */}
      <DemoTrafficLane phase={trafficPhase} />

      {/* Main panels grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Layer timeline + Risk gauge */}
        <div className="lg:col-span-3 space-y-4">
          <DemoLayerTimeline layers={layers} animate={animateLayers} />
          <DemoRiskGauge score={riskScore} animate={animateGauge} />
        </div>

        {/* Center: Event feed */}
        <div className="lg:col-span-4">
          <DemoEventFeed events={events} />
        </div>

        {/* Right: Violation panel */}
        <div className="lg:col-span-5">
          <DemoViolationPanel result={result} />
        </div>
      </div>

      {/* Demo history */}
      {demoHistory.length > 0 && (
        <div className="card">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-semibold">
            Recent Demo Runs
          </div>
          <div className="flex flex-wrap gap-2">
            {demoHistory.map((h, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs"
              >
                <span className="text-slate-500 font-mono">{h.time}</span>
                <span className="text-slate-300">{h.scenario}</span>
                <span
                  className={`badge-${h.decision}`}
                >
                  {h.decision}
                </span>
                <span className="text-slate-500 font-mono">{h.risk.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
