import { clsx } from "clsx";

export type BadgeVariant =
  | "default"
  | "allow"
  | "block"
  | "review"
  | "info"
  | "outline"
  | "success"
  | "danger"
  | "warning";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-surface-elevated text-ink-muted border-hairline",
  allow:   "bg-allow/10 text-allow border-allow/30 font-medium",
  block:   "bg-block/10 text-block border-block/30 font-medium",
  review:  "bg-review/10 text-review border-review/30 font-medium",
  info:    "bg-info/10 text-info border-info/30 font-medium",
  outline: "bg-transparent text-ink-muted border-hairline",
  success: "bg-allow/10 text-allow border-allow/30 font-medium",
  danger:  "bg-block/10 text-block border-block/30 font-medium",
  warning: "bg-review/10 text-review border-review/30 font-medium",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-mono tracking-tight",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function decisionVariant(d: string): BadgeVariant {
  const norm = d.toLowerCase();
  if (norm === "allow") return "allow";
  if (norm === "block") return "block";
  if (norm === "review") return "review";
  return "default";
}

export function severityVariant(s: string): BadgeVariant {
  const norm = s.toLowerCase();
  if (norm === "critical" || norm === "high") return "block";
  if (norm === "medium") return "review";
  if (norm === "low") return "info";
  return "default";
}
