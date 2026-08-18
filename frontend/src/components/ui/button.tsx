// Compatibility shim for upstream landing components.
// Our dashboard uses Btn from @/components/soc/ui instead.
import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "solid" | string;
  size?: "sm" | "md" | "lg" | string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "md", children, ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center gap-2 border border-ink px-5 py-2.5 font-mono text-sm font-semibold transition-colors disabled:opacity-50";
    const variants: Record<string, string> = {
      default: "bg-ink text-paper hover:bg-violet hover:border-violet",
      outline: "bg-transparent text-ink hover:bg-secondary",
      ghost: "border-transparent bg-transparent text-ink hover:bg-secondary",
      solid: "bg-ink text-paper hover:bg-violet hover:border-violet",
    };
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant] ?? variants.default} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
