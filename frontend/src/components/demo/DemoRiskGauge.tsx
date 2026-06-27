import { useEffect, useState } from "react";

/**
 * Animated SVG arc gauge showing the risk score from 0 to 1.
 * The arc fills smoothly and changes color as the risk increases.
 */

interface Props {
  score: number; // 0.0 – 1.0
  animate: boolean;
}

export default function DemoRiskGauge({ score, animate }: Props) {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    if (!animate) {
      setDisplayScore(score);
      return;
    }

    // Animate the score increment
    const steps = 30;
    const increment = score / steps;
    let current = 0;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      current = Math.min(score, current + increment);
      setDisplayScore(current);
      if (step >= steps) {
        setDisplayScore(score);
        clearInterval(interval);
      }
    }, 30);

    return () => clearInterval(interval);
  }, [score, animate]);

  // SVG arc math
  const cx = 100;
  const cy = 100;
  const r = 80;
  const startAngle = -210;
  const endAngle = 30;
  const totalAngle = endAngle - startAngle; // 240 degrees
  const currentAngle = startAngle + totalAngle * displayScore;

  const polarToCartesian = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const describeArc = (start: number, end: number) => {
    const s = polarToCartesian(start);
    const e = polarToCartesian(end);
    const largeArc = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  };

  // Color transitions
  const getColor = (s: number) => {
    if (s < 0.3) return { stroke: "#10b981", glow: "rgba(16,185,129,0.3)", label: "text-emerald-400" };
    if (s < 0.6) return { stroke: "#f59e0b", glow: "rgba(245,158,11,0.3)", label: "text-amber-400" };
    return { stroke: "#ef4444", glow: "rgba(239,68,68,0.3)", label: "text-red-400" };
  };

  const color = getColor(displayScore);
  const riskLabel = displayScore < 0.3 ? "Low Risk" : displayScore < 0.6 ? "Medium Risk" : "High Risk";

  return (
    <div className="card flex flex-col items-center">
      <div className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold w-full">
        Risk Score
      </div>

      <div className="relative" style={{ width: 200, height: 140 }}>
        <svg viewBox="0 0 200 140" className="w-full h-full">
          {/* Background arc */}
          <path
            d={describeArc(startAngle, endAngle)}
            fill="none"
            stroke="rgba(51,65,85,0.5)"
            strokeWidth="12"
            strokeLinecap="round"
          />

          {/* Filled arc */}
          {displayScore > 0.001 && (
            <path
              d={describeArc(startAngle, currentAngle)}
              fill="none"
              stroke={color.stroke}
              strokeWidth="12"
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 8px ${color.glow})`,
                transition: "stroke 0.3s ease",
              }}
            />
          )}

          {/* Tick marks */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((tick) => {
            const angle = startAngle + totalAngle * tick;
            const inner = polarToCartesian(angle);
            const outerR = r + 8;
            const rad = (angle * Math.PI) / 180;
            const outer = { x: cx + outerR * Math.cos(rad), y: cy + outerR * Math.sin(rad) };
            return (
              <line
                key={tick}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="rgba(148,163,184,0.3)"
                strokeWidth="1.5"
              />
            );
          })}
        </svg>

        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
          <span className={`text-3xl font-bold font-mono tabular-nums ${color.label}`}>
            {displayScore.toFixed(2)}
          </span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${color.label} opacity-80`}>
            {riskLabel}
          </span>
        </div>
      </div>

      {/* Scale labels */}
      <div className="flex justify-between w-full px-4 -mt-1">
        <span className="text-[10px] text-emerald-500/60 font-mono">0.0</span>
        <span className="text-[10px] text-red-500/60 font-mono">1.0</span>
      </div>
    </div>
  );
}
