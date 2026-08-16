import { clsx } from "clsx";
import { forwardRef, type InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, type = "text", ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-[12px] font-medium text-ink-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={clsx(
            "w-full rounded-lg border bg-surface-elevated px-3 py-2 text-[13px] text-ink-primary placeholder:text-ink-faint",
            "transition-all duration-140 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent",
            "disabled:cursor-not-allowed disabled:opacity-40",
            error ? "border-block focus:border-block focus:ring-block/30" : "border-hairline hover:border-hairline-strong",
            className
          )}
          {...props}
        />
        {hint && !error && <p className="text-[11px] text-ink-muted">{hint}</p>}
        {error && <p className="text-[11px] text-block font-medium">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
