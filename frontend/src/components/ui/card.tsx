import { clsx } from "clsx";
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  tone?: "default" | "allow" | "block" | "review" | "info" | "success" | "danger" | "warning";
}

const toneStyles: Record<NonNullable<CardProps["tone"]>, string> = {
  default: "border-hairline bg-surface text-ink-primary shadow-card",
  allow:   "border-allow/30 bg-allow/5 text-ink-primary shadow-card",
  block:   "border-block/30 bg-block/5 text-ink-primary shadow-card",
  review:  "border-review/30 bg-review/5 text-ink-primary shadow-card",
  info:    "border-info/30 bg-info/5 text-ink-primary shadow-card",
  success: "border-allow/30 bg-allow/5 text-ink-primary shadow-card",
  danger:  "border-block/30 bg-block/5 text-ink-primary shadow-card",
  warning: "border-review/30 bg-review/5 text-ink-primary shadow-card",
};

export function Card({
  children,
  className,
  hover,
  onClick,
  style,
  tone = "default",
}: CardProps) {
  const interactive = hover || !!onClick;
  return (
    <div
      onClick={onClick}
      style={style}
      className={clsx(
        "rounded-xl border p-4.5",
        "transition-all duration-150",
        toneStyles[tone],
        interactive && "cursor-pointer hover:border-hairline-strong hover:bg-surface-elevated hover:shadow-card-hover active:scale-[0.995]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("mb-3", className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={clsx("text-base font-bold text-ink-primary", className)}>{children}</h3>;
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx(className)}>{children}</div>;
}

