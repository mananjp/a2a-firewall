import { clsx } from "clsx";
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function Card({ children, className, hover, onClick, style }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={clsx(
        "rounded-lg border border-border bg-surface p-4",
        hover &&
          "cursor-pointer transition-colors hover:border-border/80 hover:bg-surface-elevated/50",
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}
