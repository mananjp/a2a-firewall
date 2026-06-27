import { useEffect, useState } from "react";

/**
 * Vertical timeline showing each inspection layer's status:
 *   Layer 0: Preflight → Layer 1: Schema → ... → Layer 5: Decision
 *
 * Animates through pending → running → passed/flagged/blocked states.
 */

export type LayerStatus = "pending" | "running" | "passed" | "flagged" | "blocked" | "skipped";

export interface LayerState {
  name: string;
  label: string;
  status: LayerStatus;
  detail?: string;
}

interface Props {
  layers: LayerState[];
  animate: boolean;
}

const STATUS_CONFIG: Record<LayerStatus, { color: string; icon: string; bg: string }> = {
  pending: { color: "text-slate-500", icon: "○", bg: "bg-slate-800 border-slate-700" },
  running: { color: "text-blue-400", icon: "◎", bg: "bg-blue-900/40 border-blue-500/50" },
  passed: { color: "text-emerald-400", icon: "✓", bg: "bg-emerald-900/30 border-emerald-500/40" },
  flagged: { color: "text-amber-400", icon: "⚠", bg: "bg-amber-900/30 border-amber-500/40" },
  blocked: { color: "text-red-400", icon: "✕", bg: "bg-red-900/30 border-red-500/40" },
  skipped: { color: "text-slate-600", icon: "–", bg: "bg-slate-800/50 border-slate-700/50" },
};

export default function DemoLayerTimeline({ layers, animate }: Props) {
  const [visibleCount, setVisibleCount] = useState(animate ? 0 : layers.length);

  useEffect(() => {
    if (!animate) {
      setVisibleCount(layers.length);
      return;
    }
    setVisibleCount(0);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setVisibleCount(i);
      if (i >= layers.length) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [animate, layers.length]);

  return (
    <div className="card">
      <div className="text-xs text-slate-400 uppercase tracking-wider mb-4 font-semibold">
        Layer-by-Layer Inspection
      </div>

      <div className="space-y-0">
        {layers.map((layer, i) => {
          const cfg = STATUS_CONFIG[layer.status];
          const visible = i < visibleCount;

          return (
            <div
              key={layer.name}
              className={`transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
            >
              <div className="flex items-start gap-3">
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border transition-all duration-300 ${cfg.bg} ${cfg.color} ${layer.status === "running" ? "animate-pulse ring-2 ring-blue-400/30" : ""}`}
                  >
                    {cfg.icon}
                  </div>
                  {i < layers.length - 1 && (
                    <div
                      className={`w-0.5 h-6 transition-colors duration-300 ${
                        layer.status === "passed"
                          ? "bg-emerald-600/40"
                          : layer.status === "blocked"
                            ? "bg-red-600/40"
                            : layer.status === "flagged"
                              ? "bg-amber-600/40"
                              : "bg-slate-700"
                      }`}
                    />
                  )}
                </div>

                {/* Layer info */}
                <div className="flex-1 pb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${cfg.color}`}>{layer.label}</span>
                    <span
                      className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded ${
                        layer.status === "running"
                          ? "bg-blue-500/20 text-blue-300"
                          : layer.status === "passed"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : layer.status === "blocked"
                              ? "bg-red-500/15 text-red-300"
                              : layer.status === "flagged"
                                ? "bg-amber-500/15 text-amber-300"
                                : "bg-slate-700 text-slate-500"
                      }`}
                    >
                      {layer.status}
                    </span>
                  </div>
                  {layer.detail && (
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">{layer.detail}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
