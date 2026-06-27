import { useEffect, useState } from "react";

/**
 * Animated horizontal lane showing the message flow:
 *   User → Planner Agent → 🛡️ Firewall → Research Agent
 *
 * The "packet" dot moves across the lane and stops/bounces based on the decision.
 */

type Phase = "idle" | "sending" | "inspecting" | "allowed" | "blocked" | "review";

interface Props {
  phase: Phase;
}

const NODES = [
  { id: "user", label: "User", icon: "👤" },
  { id: "planner", label: "Planner Agent", icon: "🧠" },
  { id: "firewall", label: "Firewall", icon: "🛡️" },
  { id: "researcher", label: "Research Agent", icon: "🔬" },
];

export default function DemoTrafficLane({ phase }: Props) {
  const [packetPos, setPacketPos] = useState(0); // 0-100 percentage along the lane

  useEffect(() => {
    if (phase === "idle") {
      setPacketPos(0);
      return;
    }
    if (phase === "sending") {
      setPacketPos(16); // move to planner
      const t1 = setTimeout(() => setPacketPos(50), 400); // move toward firewall
      return () => clearTimeout(t1);
    }
    if (phase === "inspecting") {
      setPacketPos(50); // at firewall
    }
    if (phase === "allowed") {
      setPacketPos(83); // through to researcher
    }
    if (phase === "blocked") {
      setPacketPos(50); // stuck at firewall
    }
    if (phase === "review") {
      setPacketPos(50); // held at firewall
    }
  }, [phase]);

  const packetColor =
    phase === "blocked"
      ? "bg-red-500 shadow-red-500/60"
      : phase === "review"
        ? "bg-amber-500 shadow-amber-500/60"
        : phase === "allowed"
          ? "bg-emerald-500 shadow-emerald-500/60"
          : "bg-blue-500 shadow-blue-500/60";

  const showPacket = phase !== "idle";

  return (
    <div className="card relative overflow-hidden">
      <div className="text-xs text-slate-400 uppercase tracking-wider mb-4 font-semibold">
        Agent Traffic Lane
      </div>

      {/* Connection line */}
      <div className="relative flex items-center justify-between px-2 py-6">
        {/* Horizontal line connecting all nodes */}
        <div className="absolute left-[8%] right-[8%] top-1/2 h-0.5 bg-slate-700 -translate-y-1/2 z-0" />

        {/* Animated progress line */}
        {showPacket && (
          <div
            className="absolute left-[8%] top-1/2 h-0.5 -translate-y-1/2 z-[1] transition-all duration-700 ease-out"
            style={{
              width: `${Math.max(0, (packetPos / 100) * 84)}%`,
              background:
                phase === "blocked"
                  ? "linear-gradient(90deg, rgba(59,130,246,0.5), #ef4444)"
                  : phase === "review"
                    ? "linear-gradient(90deg, rgba(59,130,246,0.5), #f59e0b)"
                    : "linear-gradient(90deg, rgba(59,130,246,0.5), #10b981)",
            }}
          />
        )}

        {/* Moving packet dot */}
        {showPacket && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-3.5 h-3.5 rounded-full ${packetColor} shadow-lg transition-all duration-700 ease-out ${phase === "inspecting" ? "animate-pulse" : ""} ${phase === "blocked" ? "animate-bounce" : ""}`}
            style={{ left: `${8 + (packetPos / 100) * 84}%` }}
          />
        )}

        {/* Nodes */}
        {NODES.map((node, i) => {
          const isFirewall = node.id === "firewall";
          const isActive =
            (phase === "sending" && i <= 1) ||
            (phase === "inspecting" && i <= 2) ||
            (phase === "allowed" && i <= 3) ||
            (phase === "blocked" && i <= 2) ||
            (phase === "review" && i <= 2);

          const isBlockedNode = phase === "blocked" && node.id === "researcher";

          return (
            <div
              key={node.id}
              className={`relative z-20 flex flex-col items-center gap-1.5 transition-all duration-500 ${isBlockedNode ? "opacity-30" : ""}`}
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-all duration-500 ${
                  isFirewall && phase === "inspecting"
                    ? "bg-blue-600/30 border-2 border-blue-400 ring-4 ring-blue-400/20 animate-pulse scale-110"
                    : isFirewall && phase === "blocked"
                      ? "bg-red-600/30 border-2 border-red-400 ring-4 ring-red-400/20 scale-110"
                      : isFirewall && phase === "review"
                        ? "bg-amber-600/30 border-2 border-amber-400 ring-4 ring-amber-400/20 scale-110"
                        : isFirewall && phase === "allowed"
                          ? "bg-emerald-600/30 border-2 border-emerald-400 ring-4 ring-emerald-400/20 scale-110"
                          : isActive
                            ? "bg-slate-700 border border-slate-500"
                            : "bg-slate-800 border border-slate-700"
                }`}
              >
                {node.icon}
              </div>
              <span
                className={`text-[10px] font-medium transition-colors duration-300 ${isActive ? "text-slate-200" : "text-slate-500"}`}
              >
                {node.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Decision indicator */}
      {(phase === "allowed" || phase === "blocked" || phase === "review") && (
        <div className="flex justify-center mt-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              phase === "allowed"
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : phase === "blocked"
                  ? "bg-red-500/15 text-red-400 border border-red-500/30"
                  : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                phase === "allowed" ? "bg-emerald-400" : phase === "blocked" ? "bg-red-400" : "bg-amber-400"
              }`}
            />
            {phase === "allowed" ? "Traffic Allowed" : phase === "blocked" ? "Traffic Blocked" : "Held for Review"}
          </span>
        </div>
      )}
    </div>
  );
}
