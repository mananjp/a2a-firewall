"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gauge,
  ShieldCheck,
  FileCode,
  Lock,
  Binary,
  BrainCircuit,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";
import type { TaskDetail } from "@/lib/types";

export interface LayerNodeState {
  id: number;
  name: string;
  shortName: string;
  icon: typeof Gauge;
  status: "pass" | "fail" | "review" | "skip" | "pending";
  latencyMs?: number;
  verdict?: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskPipelineLike {
  id?: string;
  decision?: string;
  risk_score?: number;
  violating_layer?: string | null;
  decision_reason?: string | null;
  intent_drift_score?: number | null;
  groq_called?: boolean;
  groq_injection_detected?: boolean | null;
  total_latency_ms?: number | null;
  violations?: Array<{
    layer?: string;
    violation_type?: string;
    type?: string;
    severity?: string;
    details?: Record<string, unknown>;
  }>;
}

interface MessageJourneyPipelineProps {
  task?: TaskPipelineLike | null;
  decision?: "allow" | "block" | "review" | string;
  riskScore?: number;
  violatingLayer?: string;
  intentDriftScore?: number;
  groqCalled?: boolean;
  groqLatencyMs?: number;
  totalLatencyMs?: number;
  animated?: boolean;
  compact?: boolean;
  className?: string;
}

export function MessageJourneyPipeline({
  task,
  decision = "allow",
  riskScore = 0,
  violatingLayer,
  intentDriftScore,
  groqCalled = true,
  groqLatencyMs,
  totalLatencyMs,
  animated = true,
  compact = false,
  className = "",
}: MessageJourneyPipelineProps) {
  const [selectedLayer, setSelectedLayer] = useState<number | null>(null);

  const effectiveDecision = task?.decision ?? decision;
  const effectiveDrift = task?.intent_drift_score ?? intentDriftScore;

  // Extract all possible clues for the violating layer
  const rawViolating = (
    task?.violating_layer ??
    violatingLayer ??
    task?.violations?.[0]?.layer ??
    task?.violations?.[0]?.violation_type ??
    task?.violations?.[0]?.type ??
    task?.decision_reason ??
    ""
  ).toLowerCase();

  // Determine failing gate index (1 to 6)
  const getFailingGateIndex = (): number | null => {
    if (effectiveDecision !== "block") return null;

    // Gate 1: Rate Limiter
    if (
      rawViolating.includes("rate") ||
      rawViolating.includes("quota") ||
      rawViolating.includes("throttle") ||
      rawViolating.includes("layer1") ||
      rawViolating.includes("layer 1")
    ) {
      return 1;
    }

    // Gate 2: Preflight & Idempotency
    if (
      rawViolating.includes("preflight") ||
      rawViolating.includes("nonce") ||
      rawViolating.includes("replay") ||
      rawViolating.includes("pentest") ||
      rawViolating.includes("canary") ||
      rawViolating.includes("signature") ||
      rawViolating.includes("idempotency") ||
      rawViolating.includes("layer2") ||
      rawViolating.includes("layer 2") ||
      rawViolating.includes("layer0") ||
      rawViolating.includes("layer 0")
    ) {
      return 2;
    }

    // Gate 3: Schema Validation
    if (
      rawViolating.includes("schema") ||
      rawViolating.includes("type_error") ||
      rawViolating.includes("parameter") ||
      rawViolating.includes("layer3") ||
      rawViolating.includes("layer 3")
    ) {
      return 3;
    }

    // Gate 4: Permissions Matrix
    if (
      rawViolating.includes("permission") ||
      rawViolating.includes("delegation") ||
      rawViolating.includes("amplification") ||
      rawViolating.includes("unauthorized") ||
      rawViolating.includes("rbac") ||
      rawViolating.includes("scope") ||
      rawViolating.includes("layer4") ||
      rawViolating.includes("layer 4")
    ) {
      return 4;
    }

    // Gate 5: Rule Engine
    if (
      rawViolating.includes("sql") ||
      rawViolating.includes("policy") ||
      rawViolating.includes("rule") ||
      rawViolating.includes("regex") ||
      rawViolating.includes("layer5") ||
      rawViolating.includes("layer 5")
    ) {
      return 5;
    }

    // Gate 6: Groq Semantic Guard
    if (
      rawViolating.includes("groq") ||
      rawViolating.includes("semantic") ||
      rawViolating.includes("injection") ||
      rawViolating.includes("drift") ||
      rawViolating.includes("intent") ||
      rawViolating.includes("hallucin") ||
      rawViolating.includes("layer6") ||
      rawViolating.includes("layer 6") ||
      Boolean(task?.groq_injection_detected)
    ) {
      return 6;
    }

    // Fallbacks based on latency/risk if no keyword matched
    if (totalLatencyMs !== undefined && totalLatencyMs <= 2) {
      return 2; // Preflight fast-path rejection
    }
    if (riskScore >= 0.8 || groqCalled) {
      return 6; // Groq Semantic Guard
    }
    return 5; // Rule Engine default
  };

  const failingGateIndex = getFailingGateIndex();

  const getLayerStatus = (layerIndex: number): "pass" | "fail" | "review" | "skip" => {
    if (effectiveDecision === "allow") return "pass";

    if (effectiveDecision === "block") {
      if (failingGateIndex === layerIndex) {
        return "fail";
      }
      if (failingGateIndex !== null && layerIndex > failingGateIndex) {
        return "skip";
      }
      return "pass";
    }

    if (effectiveDecision === "review") {
      if (layerIndex === 6) return "review";
      return "pass";
    }

    return "pass";
  };

  const layers: LayerNodeState[] = [
    {
      id: 1,
      name: "Layer 1: Rate Limiter",
      shortName: "Rate Limiter",
      icon: Gauge,
      status: getLayerStatus(1),
      latencyMs: 1.2,
      verdict: getLayerStatus(1) === "fail" ? "Rate limit quota exceeded" : "Token bucket verified",
      details: "Enforces per-agent token-bucket quotas. Prevents cascade saturation and DoS loops.",
    },
    {
      id: 2,
      name: "Layer 2: Preflight & Idempotency",
      shortName: "Preflight",
      icon: ShieldCheck,
      status: getLayerStatus(2),
      latencyMs: 2.1,
      verdict:
        getLayerStatus(2) === "fail"
          ? (rawViolating.includes("pentest") || rawViolating.includes("canary")
              ? "Automated pentesting canary or probe blocked"
              : "Replay or invalid signature detected")
          : "Ed25519 signature & nonce verified",
      details: "Validates nonces, message freshness timestamps, anti-pentest canary traps, and Ed25519 cryptographic signatures on the wire.",
    },
    {
      id: 3,
      name: "Layer 3: Schema Validation",
      shortName: "Schema",
      icon: FileCode,
      status: getLayerStatus(3),
      latencyMs: 3.4,
      verdict: getLayerStatus(3) === "fail" ? "Payload schema mismatch" : "Strict JSON Schema valid",
      details: "Enforces strict type safety and parameter bounds against the registered task schema.",
    },
    {
      id: 4,
      name: "Layer 4: Permissions Matrix",
      shortName: "Permissions",
      icon: Lock,
      status: getLayerStatus(4),
      latencyMs: 1.8,
      verdict:
        getLayerStatus(4) === "fail"
          ? (rawViolating.includes("amplification") || rawViolating.includes("delegation")
              ? "Privilege escalation / non-amplification violation"
              : "Unauthorized agent route / permission denied")
          : "RBAC route authorized",
      details: "Evaluates sender-receiver trust relationships, capability bounds, and delegation depth.",
    },
    {
      id: 5,
      name: "Layer 5: Rule Engine",
      shortName: "Rule Engine",
      icon: Binary,
      status: getLayerStatus(5),
      latencyMs: 4.0,
      verdict:
        getLayerStatus(5) === "fail"
          ? (rawViolating.includes("sql")
              ? "SQL injection pattern detected & blocked"
              : "Policy rule violation triggered")
          : "No declarative rules violated",
      details: "Runs regex guards, data boundary checks, macaroon caveat attenuations, and safety predicates.",
    },
    {
      id: 6,
      name: "Layer 6: Groq Semantic Guard",
      shortName: "Groq Guard",
      icon: BrainCircuit,
      status: getLayerStatus(6),
      latencyMs: groqLatencyMs ?? (groqCalled ? 18.5 : undefined),
      verdict:
        getLayerStatus(6) === "fail"
          ? "Prompt injection or severe intent drift detected"
          : getLayerStatus(6) === "review"
          ? `Intent drift (${effectiveDrift ? effectiveDrift.toFixed(2) : "0.58"}) placed in review`
          : groqCalled
          ? "Clean semantic score (no injection/drift)"
          : "Bypassed (safe path)",
      details: "GPT-OSS-120B inference evaluates semantic intent drift and indirect prompt injection attempts.",
      metadata: effectiveDrift !== undefined ? { intentDriftScore: effectiveDrift } : undefined,
    },
  ];

  return (
    <div className={`material-panel rounded-xl ${compact ? "p-3" : "p-4 sm:p-5"} ${className}`}>
      {/* Header bar */}
      <div className={`flex items-center justify-between gap-3 ${compact ? "mb-2" : "mb-4"}`}>
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-lg font-mono text-[12px] font-bold shadow-sm ${
              effectiveDecision === "allow"
                ? "bg-allow/15 text-allow border border-allow/35 glow-allow"
                : effectiveDecision === "block"
                ? "bg-block/15 text-block border border-block/35 glow-block"
                : "bg-review/15 text-review border border-review/35"
            }`}
          >
            {effectiveDecision === "allow" ? <CheckCircle2 size={14} /> : effectiveDecision === "block" ? <XCircle size={14} /> : <AlertCircle size={14} />}
          </div>
          <div>
            <div className="text-[13.5px] font-semibold tracking-tight text-ink-primary flex items-center gap-2">
              <span>{compact ? "Pipeline" : "Six-Layer Inspection Pipeline"}</span>
              <span
                className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  effectiveDecision === "allow"
                    ? "bg-allow/15 text-allow border border-allow/30"
                    : effectiveDecision === "block"
                    ? "bg-block/15 text-block border border-block/30"
                    : "bg-review/15 text-review border border-review/30"
                }`}
              >
                {effectiveDecision}
              </span>
            </div>
            {!compact && (
              <p className="text-[11px] text-ink-muted hidden sm:block">
                {effectiveDecision === "block" && failingGateIndex !== null ? (
                  <span className="text-block font-semibold">
                    Intercepted at Layer {failingGateIndex} ({layers[failingGateIndex - 1]?.shortName}) • Malicious packet dropped
                  </span>
                ) : effectiveDecision === "review" ? (
                  <span className="text-review font-semibold">
                    Held for review at Layer 6 (Groq Guard) • Ambiguous payload requires SOC approval
                  </span>
                ) : (
                  "Sequential gate validation • Click any layer for diagnostic trace"
                )}
              </p>
            )}
          </div>
        </div>

        {totalLatencyMs !== undefined && (
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-ink-muted bg-surface-elevated px-2.5 py-1 rounded-md border border-hairline shrink-0">
            <Clock size={12} className="text-accent" />
            <span>{totalLatencyMs}ms total</span>
          </div>
        )}
      </div>

      {/* Responsive Journey Track: uses horizontal scroll container or fluid wrapping */}
      <div className="relative py-1 overflow-x-auto pb-2 scrollbar-none">
        <div className={`grid gap-2.5 ${
          compact
            ? "grid-cols-2 sm:grid-cols-3"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 min-w-[500px] lg:min-w-0"
        }`}>
          {layers.map((layer, index) => {
            const isSelected = selectedLayer === layer.id;
            const Icon = layer.icon;

            const isPass = layer.status === "pass";
            const isFail = layer.status === "fail";
            const isReview = layer.status === "review";
            const isSkip = layer.status === "skip";

            return (
              <motion.button
                key={layer.id}
                onClick={() => setSelectedLayer(isSelected ? null : layer.id)}
                initial={animated ? { opacity: 0, y: 4 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.04 }}
                className={`relative flex flex-col items-start p-4 rounded-xl border text-left transition-all duration-150 group ${
                  isSelected
                    ? "border-accent ring-2 ring-accent/35 bg-surface-elevated shadow-card-hover"
                    : isFail
                    ? "border-block/50 bg-block/10 hover:border-block hover:bg-block/15 glow-block"
                    : isReview
                    ? "border-review/50 bg-review/10 hover:border-review hover:bg-review/15"
                    : isSkip
                    ? "border-hairline/50 bg-surface-sunken opacity-40 hover:opacity-70"
                    : "border-hairline bg-surface hover:border-hairline-strong hover:bg-surface-elevated shadow-sm"
                }`}
              >
                {/* Visual connecting laser node badge */}
                <div className="flex items-center justify-between w-full mb-1.5">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                      isFail
                        ? "bg-block/25 text-block border border-block/40"
                        : isReview
                        ? "bg-review/25 text-review border border-review/40"
                        : isSkip
                        ? "bg-surface-elevated text-ink-muted border border-hairline"
                        : "bg-allow/20 text-allow border border-allow/40"
                    }`}
                  >
                    <Icon size={14} strokeWidth={2.2} />
                  </div>

                  {isPass && (
                    <span className="flex items-center gap-0.5 text-[10px] font-mono font-semibold text-allow bg-allow/10 px-1.5 py-0.5 rounded border border-allow/20">
                      <CheckCircle2 size={11} /> OK
                    </span>
                  )}
                  {isFail && (
                    <span className="flex items-center gap-0.5 text-[10px] font-mono font-semibold text-block bg-block/15 px-1.5 py-0.5 rounded border border-block/30">
                      <XCircle size={11} /> FAIL
                    </span>
                  )}
                  {isReview && (
                    <span className="flex items-center gap-0.5 text-[10px] font-mono font-semibold text-review bg-review/15 px-1.5 py-0.5 rounded border border-review/30">
                      <AlertCircle size={11} /> REV
                    </span>
                  )}
                  {isSkip && <span className="text-[10px] font-mono text-ink-faint">SKIP</span>}
                </div>

                <div className="text-[11.5px] font-semibold text-ink-primary whitespace-normal leading-tight min-h-[28px] flex items-center">
                  {layer.shortName}
                </div>

                <div className="flex items-center justify-between w-full mt-1.5 pt-1.5 border-t border-hairline/60">
                  <span className="text-[10px] font-mono text-accent font-medium">L{layer.id}</span>
                  {layer.latencyMs !== undefined && (
                    <span className="text-[10.5px] font-mono text-ink-muted tabular-nums">
                      {layer.latencyMs}ms
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Expanded Layer Diagnostic Drawer */}
      <AnimatePresence>
        {selectedLayer !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            {(() => {
              const layer = layers.find((l) => l.id === selectedLayer);
              if (!layer) return null;

              return (
                <div className="mt-4 pt-4 border-t border-hairline bg-surface-elevated/70 rounded-xl p-4 border border-hairline-strong shadow-card">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-ink-primary flex items-center gap-1.5">
                        <Sparkles size={13} className="text-accent" />
                        {layer.name}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                          layer.status === "pass"
                            ? "bg-allow/15 text-allow border border-allow/30"
                            : layer.status === "fail"
                            ? "bg-block/15 text-block border border-block/30"
                            : layer.status === "review"
                            ? "bg-review/15 text-review border border-review/30"
                            : "bg-surface-sunken text-ink-muted border border-hairline"
                        }`}
                      >
                        {layer.status}
                      </span>
                    </div>

                    <button
                      onClick={() => setSelectedLayer(null)}
                      className="text-[11px] font-mono text-ink-muted hover:text-ink-primary px-2 py-0.5 rounded bg-surface-sunken border border-hairline transition-colors"
                    >
                      Close
                    </button>
                  </div>

                  <div className="text-[12px] font-mono text-ink-primary mb-1.5 bg-surface-sunken/80 p-2 rounded-lg border border-hairline">
                    <span className="text-ink-muted font-sans font-medium">Verdict: </span>
                    <span className={layer.status === "fail" ? "text-block font-bold" : "text-allow font-bold"}>
                      {layer.verdict}
                    </span>
                  </div>

                  <p className="text-[12px] text-ink-muted leading-relaxed mb-2">
                    {layer.details}
                  </p>

                  {layer.metadata && (
                    <div className="bg-surface-sunken rounded p-2 text-[11px] font-mono text-ink-muted border border-hairline">
                      {JSON.stringify(layer.metadata, null, 2)}
                    </div>
                  )}
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
