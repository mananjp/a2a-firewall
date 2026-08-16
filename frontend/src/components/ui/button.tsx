"use client";

import { clsx } from "clsx";
import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "danger"
  | "success";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white border border-accent hover:bg-accent-strong hover:border-accent-strong shadow-sm",
  secondary:
    "bg-surface-elevated text-ink-primary border border-hairline hover:bg-surface hover:border-hairline-strong shadow-sm",
  ghost:
    "bg-transparent text-ink-muted border border-transparent hover:bg-surface-elevated hover:text-ink-primary",
  outline:
    "bg-transparent text-ink-primary border border-hairline hover:bg-surface-elevated hover:border-hairline-strong",
  danger:
    "bg-block text-white border border-block hover:bg-block/90 shadow-sm",
  success:
    "bg-allow text-bg-base font-semibold border border-allow hover:bg-allow/90 shadow-sm",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[12px] gap-1.5",
  md: "h-9 px-4 text-[13px] gap-2",
  lg: "h-10 px-5 text-[14px] gap-2.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", disabled, type = "button", ...props },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center rounded-lg font-medium tracking-tight",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:opacity-35 disabled:pointer-events-none",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
