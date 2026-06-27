/**
 * Violation & decision detail panel shown after a demo run completes.
 * Displays the decision badge, matched violations, block reason, and payload that triggered them.
 */

import type { DemoRunResponse } from "../../api/client";

interface Props {
  result: DemoRunResponse | null;
}

export default function DemoViolationPanel({ result }: Props) {
  if (!result) {
    return (
      <div className="card text-sm text-slate-500 italic text-center py-8">
        Run a scenario to see inspection results here.
      </div>
    );
  }

  const decisionColor =
    result.decision === "allow"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : result.decision === "block"
        ? "bg-red-500/15 text-red-400 border-red-500/30"
        : result.decision === "review"
          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
          : "bg-slate-700 text-slate-300 border-slate-600";

  return (
    <div className="card space-y-4">
      <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
        Inspection Result
      </div>

      {/* Decision badge */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border ${decisionColor}`}>
          {result.decision === "allow" && "✓ "}
          {result.decision === "block" && "✕ "}
          {result.decision === "review" && "⏸ "}
          {result.decision.toUpperCase()}
        </span>
        <span className="text-sm text-slate-400">
          Risk: <span className="font-mono font-semibold text-slate-200">{result.risk_score.toFixed(2)}</span>
        </span>
        <span className="text-xs text-slate-600 font-mono">
          {result.latency_ms}ms
        </span>
      </div>

      {/* Block reason */}
      {result.block_reason && (
        <div className="rounded-lg bg-red-900/20 border border-red-500/20 p-3">
          <div className="text-[10px] uppercase text-red-400/70 font-semibold mb-1">Block Reason</div>
          <div className="text-sm text-red-300 font-mono">{result.block_reason}</div>
        </div>
      )}

      {/* Violations list */}
      {result.violations.length > 0 ? (
        <div>
          <div className="text-[10px] uppercase text-slate-500 font-semibold mb-2">
            Violations ({result.violations.length})
          </div>
          <div className="space-y-2">
            {result.violations.map((v, i) => (
              <div
                key={i}
                className="rounded-lg bg-slate-800/60 border border-slate-700/60 p-3 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`badge-${v.severity}`}
                  >
                    {v.severity}
                  </span>
                  <span className="text-xs font-mono text-slate-300">{v.violation_type}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span className="uppercase">Layer: {v.layer}</span>
                </div>
                {v.details && Object.keys(v.details).length > 0 && (
                  <details className="text-[10px]">
                    <summary className="text-slate-500 cursor-pointer hover:text-slate-400">
                      Details
                    </summary>
                    <pre className="mt-1 text-slate-600 overflow-x-auto max-h-24 p-2 bg-slate-900/50 rounded">
                      {JSON.stringify(v.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-xs text-emerald-400/70 bg-emerald-900/10 border border-emerald-500/10 rounded-lg p-3 text-center">
          ✓ No violations detected — request is clean
        </div>
      )}

      {/* Tested payload */}
      <div>
        <div className="text-[10px] uppercase text-slate-500 font-semibold mb-2">
          Inspected Payload
        </div>
        <pre className="text-[11px] text-slate-400 bg-slate-900/60 border border-slate-700/40 rounded-lg p-3 overflow-x-auto font-mono max-h-32">
          {JSON.stringify(result.demo_payload, null, 2)}
        </pre>
      </div>

      {/* Footer note */}
      <div className="text-[10px] text-slate-600 text-center pt-1 border-t border-slate-800">
        Uses the real inspection pipeline — not a simulation
      </div>
    </div>
  );
}
