import { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Zap,
  Play,
  Pause,
  ArrowRight,
  RotateCcw,
  FastForward,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Bot,
  KeyRound,
  FileCode,
  Lock,
  GitFork,
  BrainCircuit,
  Gauge,
  CheckCircle2,
  XCircle,
  Clock,
  Terminal,
  Activity,
  Send,
  Layers,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SCENARIOS, type SimulationScenario } from "./data";

interface GateInfo {
  id: number;
  key: string;
  name: string;
  shortName: string;
  icon: typeof Gauge;
  latencyMs: number;
}

const GATES: GateInfo[] = [
  { id: 1, key: "rate", name: "Layer 1: Rate Limiter", shortName: "Rate Limiter", icon: Gauge, latencyMs: 1.2 },
  { id: 2, key: "preflight", name: "Layer 2: Preflight & Nonce", shortName: "Preflight", icon: ShieldCheck, latencyMs: 2.1 },
  { id: 3, key: "schema", name: "Layer 3: Schema Validator", shortName: "Schema", icon: FileCode, latencyMs: 3.4 },
  { id: 4, key: "permission", name: "Layer 4: Permissions Matrix", shortName: "Permissions", icon: Lock, latencyMs: 1.8 },
  { id: 5, key: "rule", name: "Layer 5: Rule & Attenuation", shortName: "Rule Engine", icon: GitFork, latencyMs: 4.0 },
  { id: 6, key: "groq", name: "Layer 6: Groq Semantic Guard", shortName: "Groq Guard", icon: BrainCircuit, latencyMs: 14.0 },
];

export function LiveInspectionSandbox() {
  const [activeScenarioId, setActiveScenarioId] = useState<string>("clean_flow");
  const [currentStage, setCurrentStage] = useState<number>(0); // 0: Idle, 1: Sender, 2: Wire Ingress, 3..8: Gates 1..6, 9: Egress / Receiver
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isAutoPlayingAll, setIsAutoPlayingAll] = useState<boolean>(false);
  const [autoPlayIndex, setAutoPlayIndex] = useState<number>(0);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1); // 1x or 2x
  const [activeDrawerTab, setActiveDrawerTab] = useState<"wire" | "kernel" | "verdict">("wire");

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoPlayTourTimerRef = useRef<NodeJS.Timeout | null>(null);

  const currentScenario: SimulationScenario =
    SCENARIOS.find((s) => s.id === activeScenarioId) || SCENARIOS[0];

  const failingGate = currentScenario.failingGate ?? 7; // 7 means passes all

  // Helper to determine stage status
  function getGateStatus(gateId: number): "pending" | "evaluating" | "pass" | "fail" | "skip" {
    const stageForGate = gateId + 2; // Gate 1 is stage 3, Gate 6 is stage 8
    if (currentStage < stageForGate) return "pending";

    // If this gate is the one that breaks and we've reached it:
    if (failingGate === gateId && currentStage >= stageForGate) {
      return "fail";
    }

    // If it's a gate after the failing gate and we've reached or passed the fail point:
    if (failingGate < gateId && currentStage >= failingGate + 2) {
      return "skip";
    }

    if (currentStage === stageForGate) return "evaluating";
    return "pass";
  }

  // Calculate live cumulative latency
  function getLiveLatency(): number {
    if (currentStage <= 2) return 0;
    let total = 0;
    for (let i = 1; i <= Math.min(currentStage - 2, 6); i++) {
      const g = GATES[i - 1];
      if (g) total += g.latencyMs;
    }
    return Math.min(total, currentScenario.totalLatencyMs);
  }

  // Single step forward
  function stepForward() {
    setCurrentStage((prev) => {
      const nextStage = prev + 1;
      const maxStageForScenario = failingGate <= 6 ? failingGate + 2 : 9;

      if (nextStage > maxStageForScenario) {
        setIsPlaying(false);
        return maxStageForScenario;
      }
      return nextStage;
    });
  }

  // Start continuous run for current scenario
  function startSimulation(scenarioId = activeScenarioId, onComplete?: () => void) {
    setActiveScenarioId(scenarioId);
    setCurrentStage(1);
    setIsPlaying(true);

    const targetScenario = SCENARIOS.find((s) => s.id === scenarioId) || SCENARIOS[0];
    const maxStage = (targetScenario.failingGate ?? 7) <= 6 ? (targetScenario.failingGate ?? 7) + 2 : 9;

    let stage = 1;
    if (timerRef.current) clearInterval(timerRef.current);

    const intervalMs = Math.round(380 / speedMultiplier);

    timerRef.current = setInterval(() => {
      stage += 1;
      if (stage <= maxStage) {
        setCurrentStage(stage);
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsPlaying(false);
        if (onComplete) onComplete();
      }
    }, intervalMs);
  }

  function pauseSimulation() {
    setIsPlaying(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function resetSimulation() {
    pauseSimulation();
    setCurrentStage(0);
  }

  function handleSelectScenario(scenarioId: string) {
    if (isAutoPlayingAll) {
      stopAutoPlayTour();
    }
    const idx = SCENARIOS.findIndex((s) => s.id === scenarioId);
    if (idx !== -1) setAutoPlayIndex(idx);
    startSimulation(scenarioId);
  }

  function stopAutoPlayTour() {
    setIsAutoPlayingAll(false);
    if (autoPlayTourTimerRef.current) clearTimeout(autoPlayTourTimerRef.current);
    pauseSimulation();
  }

  function runNextAutoTourStep(index: number) {
    const nextIdx = index % SCENARIOS.length;
    setAutoPlayIndex(nextIdx);
    const sc = SCENARIOS[nextIdx];

    startSimulation(sc.id, () => {
      autoPlayTourTimerRef.current = setTimeout(() => {
        runNextAutoTourStep(nextIdx + 1);
      }, 1600);
    });
  }

  function toggleAutoPlayTour() {
    if (isAutoPlayingAll) {
      stopAutoPlayTour();
    } else {
      setIsAutoPlayingAll(true);
      runNextAutoTourStep(0);
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoPlayTourTimerRef.current) clearTimeout(autoPlayTourTimerRef.current);
    };
  }, []);

  const isFlowBlocked = failingGate <= 6 && currentStage >= failingGate + 2;

  return (
    <motion.div
      id="sandbox"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25 }}
      className="mt-14 sm:mt-18 rounded-2xl border border-hairline-strong bg-surface p-5 sm:p-7 shadow-card relative z-10 scroll-mt-24"
    >
      {/* Top Header & Tour Trigger */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-hairline">
        <div>
          <div className="eyebrow mb-1 flex items-center gap-2">
            <Sparkles size={13} className="text-accent" />
            <span>Autonomous Agent Governance Mesh</span>
          </div>
          <h3 className="text-[19px] font-bold text-ink-primary flex items-center gap-2">
            Interactive Inter-Agent Request Flow & Inspection
          </h3>
          <p className="text-[12.5px] text-ink-muted mt-0.5">
            Visualize how an agent signs, dispatches, and validates requests across all 6 sequential security gates.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Auto-Play Tour across all 4 scenarios */}
          <button
            onClick={toggleAutoPlayTour}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-mono font-semibold flex items-center gap-2 transition-all shadow-sm ${
              isAutoPlayingAll
                ? "bg-accent text-white shadow-accent/30"
                : "bg-surface-elevated text-ink-primary hover:bg-surface-highlight border border-hairline-strong"
            }`}
            title="Automatically run through all 4 test vectors in sequential execution flow"
          >
            {isAutoPlayingAll ? (
              <>
                <Loader2 size={12} className="animate-spin text-white" />
                <span>Simulating All 4 ({autoPlayIndex + 1}/4)...</span>
              </>
            ) : (
              <>
                <Play size={12} className="text-accent fill-accent" />
                <span>Simulate All 4 Scenarios</span>
              </>
            )}
          </button>

          {/* Speed Toggle */}
          <button
            onClick={() => setSpeedMultiplier((s) => (s === 1 ? 2 : 1))}
            className="px-2.5 py-1.5 rounded-lg bg-surface-sunken hover:bg-surface-elevated border border-hairline text-ink-muted hover:text-ink-primary font-mono text-[11px] font-semibold transition-colors"
            title="Toggle simulation execution speed"
          >
            Speed: {speedMultiplier}x
          </button>
        </div>
      </div>

      {/* Scenario Selection Tabs Strip */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-surface-sunken border border-hairline">
          {SCENARIOS.map((sc, idx) => {
            const isActive = sc.id === activeScenarioId;
            return (
              <button
                key={sc.id}
                onClick={() => handleSelectScenario(sc.id)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-mono font-medium transition-all flex items-center gap-1.5 ${
                  isActive
                    ? sc.badgeColor === "allow"
                      ? "bg-allow/20 text-allow border border-allow/40 shadow-sm font-semibold"
                      : "bg-block/20 text-block border border-block/40 shadow-sm font-semibold"
                    : "text-ink-muted hover:text-ink-primary hover:bg-surface-elevated"
                }`}
              >
                <span className="text-[10px] opacity-70">0{idx + 1}.</span>
                {sc.id === "clean_flow"
                  ? "Clean Task"
                  : sc.id === "prompt_injection"
                  ? "Prompt Injection"
                  : sc.id === "delegation_amplification"
                  ? "Privilege Escalation"
                  : "Cryptographic Replay"}
              </button>
            );
          })}
        </div>

        {/* Step / Run Controls */}
        <div className="flex items-center gap-1.5">
          {isPlaying ? (
            <button
              onClick={pauseSimulation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-highlight border border-hairline font-mono text-[11.5px] font-semibold text-ink-primary transition-colors"
            >
              <Pause size={12} />
              Pause
            </button>
          ) : (
            <button
              onClick={() => startSimulation()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-strong font-mono text-[11.5px] font-semibold transition-colors shadow-sm"
            >
              <Play size={12} className="fill-white" />
              {currentStage === 0 ? "Dispatch Flow" : "Resume Flow"}
            </button>
          )}

          <button
            onClick={stepForward}
            disabled={isPlaying}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-sunken hover:bg-surface-elevated border border-hairline font-mono text-[11.5px] text-ink-muted hover:text-ink-primary disabled:opacity-40 transition-colors"
            title="Advance one stage forward manually"
          >
            <FastForward size={12} />
            Step
          </button>

          <button
            onClick={resetSimulation}
            className="p-1.5 rounded-lg bg-surface-sunken hover:bg-surface-elevated border border-hairline text-ink-muted hover:text-ink-primary transition-colors"
            title="Reset simulation state"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* ─── Visual Agent-to-Agent Flow Canvas ─────────────────────────── */}
      <div
        className={`mt-5 rounded-2xl border p-4 sm:p-5 relative overflow-hidden transition-all duration-300 ${
          isFlowBlocked
            ? "bg-block/[0.03] border-block/40 shadow-md shadow-block/10"
            : "bg-surface-sunken/80 border-hairline"
        }`}
      >
        {/* Active Stage Indicator Banner */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border font-mono text-[11.5px] transition-all ${
            isFlowBlocked
              ? "bg-block/15 border-block/40 text-block"
              : currentStage === 9 && currentScenario.decision === "allow"
              ? "bg-allow/15 border-allow/40 text-allow"
              : "bg-surface border-hairline text-ink-primary"
          }`}
        >
          <div className="flex items-center gap-2">
            {currentStage === 0 ? (
              <span className="h-2.5 w-2.5 rounded-full bg-ink-muted shrink-0" />
            ) : isFlowBlocked ? (
              <span className="h-2.5 w-2.5 rounded-full bg-block shrink-0" />
            ) : currentStage === 9 ? (
              <span className="h-2.5 w-2.5 rounded-full bg-allow shrink-0" />
            ) : (
              <Loader2 size={13} className="text-accent animate-spin shrink-0" />
            )}
            <span className={isFlowBlocked ? "text-block/80" : "text-ink-muted"}>Flow Status:</span>
            <span className="font-semibold">
              {currentStage === 0 && "Ready — Click 'Dispatch Flow' to initiate inter-agent request"}
              {currentStage === 1 && `Stage 1: ${currentScenario.sender} constructing & Ed25519 signing envelope`}
              {currentStage === 2 && "Stage 2: Wire transmission intercepted by A2A Firewall Gateway"}
              {currentStage >= 3 && currentStage <= 8 && !isFlowBlocked && `Stage ${currentStage}: Intercepted at Gate ${currentStage - 2} (${GATES[currentStage - 3]?.shortName})`}
              {isFlowBlocked && `THREAT BLOCKED: Intercepted at Layer ${failingGate} (${GATES[failingGate - 1]?.shortName}) — Malicious packet dropped`}
              {currentStage === 9 && currentScenario.decision === "allow" && "All 6 Gates Passed • Securely delivered to Receiver Agent"}
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1">
              <Clock size={12} className={isFlowBlocked ? "text-block" : "text-accent"} />
              Latency: <strong>{getLiveLatency().toFixed(1)}ms</strong>
            </span>
            <span>
              Risk Score:{" "}
              <strong className={currentScenario.riskScore > 0.5 ? "text-block font-bold" : "text-allow font-bold"}>
                {(currentScenario.riskScore * 100).toFixed(0)}%
              </strong>
            </span>
          </div>
        </div>

        {/* 3-Section Flow Diagram (Sender -> Firewall Gates -> Receiver) */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          {/* 1. Sender Agent Node (Left - 3 Cols) */}
          <div
            className={`lg:col-span-3 rounded-xl p-3.5 border transition-all ${
              currentStage >= 1
                ? isFlowBlocked
                  ? "bg-surface-elevated border-block/30 shadow-sm"
                  : "bg-surface-elevated border-accent/40 shadow-sm"
                : "bg-surface/50 border-hairline opacity-75"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`h-7 w-7 rounded-lg flex items-center justify-center border ${
                    isFlowBlocked
                      ? "bg-block/15 text-block border-block/30"
                      : "bg-accent/15 text-accent border-accent/30"
                  }`}
                >
                  <Bot size={15} />
                </div>
                <span className={`text-[11px] font-mono font-bold ${isFlowBlocked ? "text-block" : "text-accent"}`}>
                  Sender Agent
                </span>
              </div>
              <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-surface border border-hairline text-ink-muted">
                Ed25519 Signed
              </span>
            </div>

            <div className="font-mono text-[12px] font-bold text-ink-primary truncate">
              {currentScenario.sender}
            </div>
            <div className="text-[10.5px] text-ink-muted truncate mt-0.5">
              {currentScenario.senderRole}
            </div>

            {/* Micro Packet Dispatch Indicator */}
            <div className="mt-3 pt-2.5 border-t border-hairline flex items-center justify-between text-[10.5px] font-mono">
              <span className="text-ink-muted flex items-center gap-1">
                <Send size={10} className={currentStage >= 1 ? (isFlowBlocked ? "text-block" : "text-accent") : "text-ink-faint"} />
                {currentStage === 0 ? "Idle" : currentStage === 1 ? "Signing..." : "Dispatched"}
              </span>
              <span className={isFlowBlocked ? "text-block font-semibold" : "text-accent font-semibold"}>
                {currentScenario.taskType}
              </span>
            </div>
          </div>

          {/* 2. Firewall 6-Gate Inspection Perimeter (Center - 6 Cols) */}
          <div
            className={`lg:col-span-6 rounded-xl p-3 bg-surface border transition-all duration-300 ${
              isFlowBlocked
                ? "border-block/60 shadow-lg shadow-block/15 ring-2 ring-block/30"
                : "border-hairline-strong shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between mb-2.5 px-1">
              <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-ink-primary">
                <ShieldCheck size={13} className={isFlowBlocked ? "text-block" : "text-accent"} />
                <span>A2A Zero-Trust Sequential Firewall</span>
              </div>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                  isFlowBlocked
                    ? "bg-block/15 text-block border border-block/30"
                    : "text-ink-muted bg-surface-sunken border border-hairline"
                }`}
              >
                {isFlowBlocked ? `BREACH INTERCEPTED (L${failingGate})` : "Default-Deny Fail Mode"}
              </span>
            </div>

            {/* 6 Gates Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {GATES.map((gate) => {
                const status = getGateStatus(gate.id);
                const Icon = gate.icon;
                const isFailedGate = status === "fail";
                return (
                  <div
                    key={gate.id}
                    className={`rounded-lg p-2 flex flex-col items-center justify-between text-center transition-all min-h-[82px] border ${
                      isFailedGate
                        ? "bg-block/20 border-block text-block shadow-lg shadow-block/30 ring-2 ring-block/70 font-bold"
                        : status === "evaluating"
                        ? "bg-accent/10 border-accent text-accent shadow-sm ring-2 ring-accent/30"
                        : status === "pass"
                        ? "bg-allow/10 border-allow/30 text-allow"
                        : status === "skip"
                        ? "bg-surface-sunken/40 border-hairline/40 text-ink-faint opacity-35"
                        : "bg-surface-elevated border-hairline text-ink-muted opacity-80"
                    }`}
                  >
                    <div
                      className={`text-[9.5px] font-mono font-bold uppercase ${
                        isFailedGate ? "text-block underline" : ""
                      }`}
                    >
                      L{gate.id}
                    </div>

                    <div className="my-1 flex items-center justify-center">
                      {status === "pass" ? (
                        <CheckCircle2 size={16} className="text-allow" />
                      ) : isFailedGate ? (
                        <XCircle size={18} className="text-block" />
                      ) : status === "evaluating" ? (
                        <Loader2 size={15} className="text-accent animate-spin" />
                      ) : (
                        <Icon size={14} className="opacity-70" />
                      )}
                    </div>

                    <div
                      className={`text-[9.5px] font-mono font-medium leading-tight truncate max-w-full ${
                        isFailedGate ? "text-block font-bold" : ""
                      }`}
                    >
                      {isFailedGate ? "BLOCKED" : gate.shortName}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Receiver Agent Node (Right - 3 Cols) */}
          <div
            className={`lg:col-span-3 rounded-xl p-3.5 border transition-all ${
              currentStage === 9 && currentScenario.decision === "allow"
                ? "bg-allow/10 border-allow/40 shadow-sm"
                : currentStage >= (failingGate <= 6 ? failingGate + 2 : 9) && currentScenario.decision === "block"
                ? "bg-block/10 border-block/40 shadow-sm"
                : "bg-surface/50 border-hairline opacity-75"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`h-7 w-7 rounded-lg flex items-center justify-center border ${
                    currentStage === 9 && currentScenario.decision === "allow"
                      ? "bg-allow/15 text-allow border-allow/30"
                      : currentStage >= (failingGate <= 6 ? failingGate + 2 : 9) && currentScenario.decision === "block"
                      ? "bg-block/15 text-block border-block/30"
                      : "bg-surface-elevated text-ink-muted border-hairline"
                  }`}
                >
                  <Bot size={15} />
                </div>
                <span className="text-[11px] font-mono font-bold text-ink-primary">Receiver Agent</span>
              </div>
              <span
                className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded border font-semibold ${
                  currentStage === 9 && currentScenario.decision === "allow"
                    ? "bg-allow/15 text-allow border-allow/30"
                    : currentStage >= (failingGate <= 6 ? failingGate + 2 : 9) && currentScenario.decision === "block"
                    ? "bg-block/15 text-block border-block/30"
                    : "bg-surface border-hairline text-ink-muted"
                }`}
              >
                {currentStage === 9 && currentScenario.decision === "allow"
                  ? "Executed"
                  : currentStage >= (failingGate <= 6 ? failingGate + 2 : 9) && currentScenario.decision === "block"
                  ? "Protected"
                  : "Awaiting"}
              </span>
            </div>

            <div className="font-mono text-[12px] font-bold text-ink-primary truncate">
              {currentScenario.receiver}
            </div>
            <div className="text-[10.5px] text-ink-muted truncate mt-0.5">
              {currentScenario.receiverRole}
            </div>

            <div className="mt-3 pt-2.5 border-t border-hairline text-[10.5px] font-mono truncate text-ink-muted">
              {currentStage === 9 && currentScenario.decision === "allow" ? (
                <span className="text-allow font-medium flex items-center gap-1">
                  <CheckCircle2 size={11} /> Payload validated & processed
                </span>
              ) : currentStage >= (failingGate <= 6 ? failingGate + 2 : 9) && currentScenario.decision === "block" ? (
                <span className="text-block font-medium flex items-center gap-1">
                  <ShieldAlert size={11} /> Malicious packet dropped
                </span>
              ) : (
                <span>Awaiting verified packet</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── High-Tech Dark Cyber SOC Terminal Window ────────────── */}
      <div className="mt-5 rounded-2xl border border-slate-800 bg-[#0B0F17] text-slate-200 overflow-hidden shadow-2xl">
        {/* Terminal Titlebar Chrome (macOS / Unix style traffic lights) */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#111622] border-b border-slate-800/80 font-mono text-[11px]">
          {/* Traffic light window controls */}
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#FF5F56] border border-[#E0443E]/50 shadow-sm" />
            <span className="h-3 w-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]/50 shadow-sm" />
            <span className="h-3 w-3 rounded-full bg-[#27C93F] border border-[#1AAB29]/50 shadow-sm" />
            <span className="ml-2 text-slate-400 font-semibold flex items-center gap-1.5">
              <Terminal size={13} className="text-emerald-400" />
              a2a-kernel@mesh-soc:~ (Live Security Gateway Trace)
            </span>
          </div>

          {/* Terminal Pane Switcher */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#070A10] border border-slate-800">
            <button
              onClick={() => setActiveDrawerTab("kernel")}
              className={`px-3 py-1 rounded-md text-[11px] font-mono font-medium transition-all flex items-center gap-1.5 ${
                activeDrawerTab === "kernel"
                  ? "bg-slate-800 text-emerald-400 border border-slate-700 shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Terminal size={11} />
              1. Kernel Trace Logs
            </button>
            <button
              onClick={() => setActiveDrawerTab("wire")}
              className={`px-3 py-1 rounded-md text-[11px] font-mono font-medium transition-all flex items-center gap-1.5 ${
                activeDrawerTab === "wire"
                  ? "bg-slate-800 text-indigo-400 border border-slate-700 shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Send size={11} />
              2. Wire Packet & Headers
            </button>
            <button
              onClick={() => setActiveDrawerTab("verdict")}
              className={`px-3 py-1 rounded-md text-[11px] font-mono font-medium transition-all flex items-center gap-1.5 ${
                activeDrawerTab === "verdict"
                  ? "bg-slate-800 text-amber-400 border border-slate-700 shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Activity size={11} />
              3. SOC Verdict Summary
            </button>
          </div>
        </div>

        {/* Tab 1: Live Kernel Trace Console (Dark Terminal View) */}
        {activeDrawerTab === "kernel" && (
          <div className="p-5 font-mono text-[12px] space-y-3 bg-[#0B0F17] text-slate-300">
            {/* Terminal Command Line Header */}
            <div className="flex items-center gap-2 text-slate-400 pb-2 border-b border-slate-800/80 text-[11.5px]">
              <span className="text-emerald-400 font-bold">a2a-guard@mesh-soc:~$</span>
              <span className="text-slate-200">
                ./a2a-firewall inspect --vector={currentScenario.id} --stream --verbose
              </span>
              <span className="inline-block h-4 w-1.5 bg-emerald-400/80 ml-1" />
            </div>

            {/* Terminal Monospace Stream Lines */}
            <div className="space-y-2 pt-1">
              <div className="flex items-start gap-2.5">
                <span className="text-slate-500 shrink-0 text-[11px]">[00:00.001]</span>
                <span className="text-indigo-400 font-semibold shrink-0">[INGRESS]</span>
                <span className="text-slate-300">
                  Intercepted raw wire packet from <strong className="text-emerald-300">{currentScenario.sender}</strong> → destination <strong className="text-slate-100">{currentScenario.receiver}</strong> (Task: <span className="text-amber-300">{currentScenario.taskType}</span>)
                </span>
              </div>

              {/* L1 */}
              <div className="flex items-start gap-2.5">
                <span className="text-slate-500 shrink-0 text-[11px]">[00:00.002]</span>
                <span className="text-emerald-400 font-bold shrink-0">[L1:RATE]</span>
                <span className="text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                  <span>PASS: Token-bucket allocation verified. 120 req/min remaining (1.2ms)</span>
                </span>
              </div>

              {/* L2 */}
              <div className="flex items-start gap-2.5">
                <span className="text-slate-500 shrink-0 text-[11px]">[00:00.004]</span>
                <span className={currentScenario.violatingLayer === "preflight" ? "text-rose-400 font-bold shrink-0" : "text-emerald-400 font-bold shrink-0"}>
                  [L2:PREFLIGHT]
                </span>
                {currentScenario.violatingLayer === "preflight" ? (
                  <div className="text-rose-300 bg-rose-950/40 border border-rose-800/60 p-2 rounded-lg space-y-1 flex-1">
                    <div className="flex items-center gap-1.5 font-bold text-rose-200">
                      <XCircle size={14} className="text-rose-400 shrink-0" />
                      CRITICAL_SECURITY_BREACH: Monotonic Nonce Replay Detected!
                    </div>
                    <div className="text-[11px] text-rose-300/90 font-mono">
                      Nonce <code className="text-amber-300 font-bold">{currentScenario.headers.xNonce}</code> was already consumed in previous session.
                    </div>
                    <div className="text-[11px] text-rose-400 font-bold">
                      &gt;&gt; ACTION: Packet quarantined and dropped at Wire Ingress Gateway.
                    </div>
                  </div>
                ) : (
                  <span className="text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                    <span>PASS: Ed25519 signature valid ({currentScenario.headers.xSignature.slice(0, 18)}...) & fresh nonce (2.1ms)</span>
                  </span>
                )}
              </div>

              {/* L3 */}
              {currentScenario.violatingLayer !== "preflight" && (
                <div className="flex items-start gap-2.5">
                  <span className="text-slate-500 shrink-0 text-[11px]">[00:00.007]</span>
                  <span className="text-emerald-400 font-bold shrink-0">[L3:SCHEMA]</span>
                  <span className="text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                    <span>PASS: Strict JSON Schema types and parameter bounds validated (3.4ms)</span>
                  </span>
                </div>
              )}

              {/* L4 */}
              {currentScenario.violatingLayer !== "preflight" && (
                <div className="flex items-start gap-2.5">
                  <span className="text-slate-500 shrink-0 text-[11px]">[00:00.009]</span>
                  <span className="text-emerald-400 font-bold shrink-0">[L4:RBAC]</span>
                  <span className="text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                    <span>PASS: Inter-agent trust path authorized in access matrix (1.8ms)</span>
                  </span>
                </div>
              )}

              {/* L5 */}
              {currentScenario.violatingLayer !== "preflight" && (
                <div className="flex items-start gap-2.5">
                  <span className="text-slate-500 shrink-0 text-[11px]">[00:00.013]</span>
                  <span className={currentScenario.violatingLayer === "rule" ? "text-rose-400 font-bold shrink-0" : "text-emerald-400 font-bold shrink-0"}>
                    [L5:MACAROON]
                  </span>
                  {currentScenario.violatingLayer === "rule" ? (
                    <div className="text-rose-300 bg-rose-950/40 border border-rose-800/60 p-2 rounded-lg space-y-1 flex-1">
                      <div className="flex items-center gap-1.5 font-bold text-rose-200">
                        <XCircle size={14} className="text-rose-400 shrink-0" />
                        ATTENUATION_VIOLATION: Privilege Escalation Blocked!
                      </div>
                      <div className="text-[11px] text-rose-300/90 font-mono">
                        HMAC caveat chain evaluated: Sub-agent scope restricted to read-only. Unapproved transfer rejected.
                      </div>
                      <div className="text-[11px] text-rose-400 font-bold">
                        &gt;&gt; ACTION: Capability amplification denied. Non-amplification theorem held.
                      </div>
                    </div>
                  ) : (
                    <span className="text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                      <span>PASS: Macaroon HMAC caveat attenuation and safety rules verified (4.0ms)</span>
                    </span>
                  )}
                </div>
              )}

              {/* L6 */}
              {currentScenario.violatingLayer !== "preflight" && currentScenario.violatingLayer !== "rule" && (
                <div className="flex items-start gap-2.5">
                  <span className="text-slate-500 shrink-0 text-[11px]">[00:00.027]</span>
                  <span className={currentScenario.violatingLayer === "groq" ? "text-rose-400 font-bold shrink-0" : "text-emerald-400 font-bold shrink-0"}>
                    [L6:GROQ_GUARD]
                  </span>
                  {currentScenario.violatingLayer === "groq" ? (
                    <div className="text-rose-300 bg-rose-950/40 border border-rose-800/60 p-2 rounded-lg space-y-1 flex-1">
                      <div className="flex items-center gap-1.5 font-bold text-rose-200">
                        <XCircle size={14} className="text-rose-400 shrink-0" />
                        ADVERSARIAL_INJECTION_DETECTED: Intent Drift Score 0.98!
                      </div>
                      <div className="text-[11px] text-rose-300/90 font-mono">
                        Groq LPU (Llama 3.1 8B Instant): Prompt contains instruction override and data exfiltration payload.
                      </div>
                      <div className="text-[11px] text-rose-400 font-bold">
                        &gt;&gt; ACTION: Malicious packet quarantined. Zero internal exposure.
                      </div>
                    </div>
                  ) : (
                    <span className="text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                      <span>PASS: Groq LPU inference verified clean payload. Intent drift: 0.03 (14.0ms)</span>
                    </span>
                  )}
                </div>
              )}

              {/* Final Summary Line */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11.5px]">
                <span className={currentScenario.decision === "allow" ? "text-emerald-400 font-bold flex items-center gap-1.5" : "text-rose-400 font-bold flex items-center gap-1.5"}>
                  {currentScenario.decision === "allow" ? (
                    <>
                      <ShieldCheck size={14} className="text-emerald-400" />
                      KERNEL_VERDICT: [ALLOW] — Deterministic 6-layer validation succeeded in {currentScenario.totalLatencyMs}ms
                    </>
                  ) : (
                    <>
                      <ShieldAlert size={14} className="text-rose-400" />
                      KERNEL_VERDICT: [BLOCK] — Security violation at Layer {currentScenario.failingGate} (Quarantine ID: QRN-{(currentScenario.riskScore * 9999).toFixed(0)})
                    </>
                  )}
                </span>
                <span className="text-slate-500 text-[10.5px]">OTel Trace Lineage Signed</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Wire Packet Headers & JSON (Dark IDE View) */}
        {activeDrawerTab === "wire" && (
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-[12px] bg-[#0B0F17]">
            {/* Headers Box */}
            <div className="rounded-xl bg-[#111622] p-4 border border-slate-800 space-y-2">
              <div className="text-indigo-400 font-bold text-[11.5px] pb-1.5 border-b border-slate-800 flex items-center justify-between">
                <span>// A2A Wire Protocol Headers</span>
                <span className="text-[10.5px] text-slate-500">Ed25519 & Macaroon v2</span>
              </div>
              <div className="truncate">
                <span className="text-slate-500">X-Agent-ID:</span> <span className="text-emerald-300 font-semibold">&quot;{currentScenario.headers.xAgentId}&quot;</span>
              </div>
              <div className="truncate">
                <span className="text-slate-500">X-Signature:</span> <span className="text-indigo-300">&quot;{currentScenario.headers.xSignature}&quot;</span>
              </div>
              <div className="truncate">
                <span className="text-slate-500">X-Nonce:</span> <span className="text-amber-300">&quot;{currentScenario.headers.xNonce}&quot;</span>
              </div>
              <div className="truncate">
                <span className="text-slate-500">X-Timestamp:</span> <span className="text-slate-300">&quot;{currentScenario.headers.xTimestamp}&quot;</span>
              </div>
              <div className="truncate">
                <span className="text-slate-500">X-Caveats:</span> <span className="text-cyan-300">&quot;{currentScenario.headers.xMacaroonCaveats}&quot;</span>
              </div>
            </div>

            {/* Payload Body Box */}
            <div className="rounded-xl bg-[#111622] p-4 border border-slate-800 space-y-2">
              <div className="text-indigo-400 font-bold text-[11.5px] pb-1.5 border-b border-slate-800 flex items-center justify-between">
                <span>// Intercepted Payload Body</span>
                <span className="text-[10.5px] text-amber-400 font-semibold">Type: {currentScenario.taskType}</span>
              </div>
              <pre className="text-[11.5px] text-slate-200 overflow-x-auto p-1 leading-relaxed font-mono">
                {JSON.stringify(currentScenario.payloadJson, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Tab 3: Verdict & Receiver Response (Dark Summary View) */}
        {activeDrawerTab === "verdict" && (
          <div className="p-5 font-mono text-[12px] space-y-3 bg-[#0B0F17]">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#111622] border border-slate-800">
              <div>
                <div className="text-slate-500 text-[11px]">Final Mesh Verdict</div>
                <div
                  className={`text-[16px] font-bold uppercase mt-0.5 ${
                    currentScenario.decision === "allow" ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {currentScenario.decision}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px]">Inspection Latency</div>
                <div className="text-[16px] font-bold text-slate-100 mt-0.5">
                  {currentScenario.totalLatencyMs}ms (P99 &lt; 20ms)
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px]">Threat Risk Score</div>
                <div
                  className={`text-[16px] font-bold mt-0.5 ${
                    currentScenario.riskScore > 0.5 ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"
                  }`}
                >
                  {(currentScenario.riskScore * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#111622] border border-slate-800">
              <div className="text-indigo-400 font-bold text-[11.5px] mb-1 flex items-center gap-1.5">
                <Bot size={13} />
                // Downstream Receiver Agent Enclave State
              </div>
              <p className="text-[12.5px] text-slate-200 leading-relaxed pt-1">
                {currentScenario.receiverResponse}
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

