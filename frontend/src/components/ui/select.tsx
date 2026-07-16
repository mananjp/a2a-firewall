import { clsx } from "clsx";
import { forwardRef, type SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, options, ...props }, ref) => (
    <label className="block">
      {label && (
        <span className="mb-1 block text-xs font-medium text-muted-foreground">
          {label}
        </span>
      )}
      <select
        ref={ref}
        className={clsx(
          "h-9 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-foreground",
          "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent",
          className
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
);
Select.displayName = "Select";
