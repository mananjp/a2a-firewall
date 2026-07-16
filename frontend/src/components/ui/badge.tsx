import { clsx } from "clsx";

type BadgeVariant = "default" | "success" | "danger" | "warning" | "info";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-surface-elevated text-muted-foreground border-border",
  success: "bg-success-soft text-success border-success/20",
  danger: "bg-danger-soft text-danger border-danger/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  info: "bg-accent-soft text-accent border-accent/20",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium font-mono",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function decisionVariant(d: string): BadgeVariant {
  if (d === "allow") return "success";
  if (d === "block") return "danger";
  if (d === "review") return "warning";
  return "default";
}

export function severityVariant(s: string): BadgeVariant {
  if (s === "critical" || s === "high") return "danger";
  if (s === "medium") return "warning";
  if (s === "low") return "info";
  return "default";
}
