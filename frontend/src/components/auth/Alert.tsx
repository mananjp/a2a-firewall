import type { ReactNode } from "react";

type Tone = "error" | "warning" | "success" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  error: "bg-red-900/40 border-red-700/70 text-red-200",
  warning: "bg-amber-900/40 border-amber-700/70 text-amber-200",
  success: "bg-emerald-900/40 border-emerald-700/70 text-emerald-200",
  info: "bg-blue-900/30 border-blue-700/60 text-blue-200",
};

const TONE_ICONS: Record<Tone, string> = {
  error: "⛔",
  warning: "⚠️",
  success: "✅",
  info: "ℹ️",
};

interface AlertProps {
  tone: Tone;
  children: ReactNode;
  className?: string;
}

export function Alert({ tone, children, className = "" }: AlertProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md border px-3 py-2 text-sm ${TONE_CLASSES[tone]} ${className}`}
    >
      <span aria-hidden className="mr-2">
        {TONE_ICONS[tone]}
      </span>
      {children}
    </div>
  );
}
