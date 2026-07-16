import { clsx } from "clsx";
import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => (
    <label className="block">
      {label && (
        <span className="mb-1 block text-xs font-medium text-muted-foreground">
          {label}
        </span>
      )}
      <input
        ref={ref}
        className={clsx(
          "h-9 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-foreground",
          "placeholder:text-muted",
          "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          error && "border-danger focus:ring-danger/40 focus:border-danger",
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </label>
  )
);
Input.displayName = "Input";
