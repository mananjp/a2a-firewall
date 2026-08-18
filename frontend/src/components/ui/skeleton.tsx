import { clsx } from "clsx";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  variant?: "default" | "shimmer" | "card" | "circle";
}

export function Skeleton({
  className = "",
  variant = "shimmer",
  ...props
}: SkeletonProps) {
  return (
    <div
      className={clsx(
        "rounded-lg bg-surface-sunken/85 border border-hairline/40",
        variant === "shimmer" && "shimmer-effect",
        variant === "circle" && "rounded-full",
        className
      )}
      {...props}
    />
  );
}

/**
 * Top KPI Metrics Row Skeleton
 */
export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="material-panel rounded-2xl p-5 border border-hairline space-y-3 shimmer-effect"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-7 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-32" />
          <div className="flex items-center gap-2 pt-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Table Rows Skeleton for lists (Violations, Telemetry, Review, Policies, Agents, Audit)
 */
export function TableSkeleton({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="material-panel rounded-2xl border border-hairline overflow-hidden">
      {/* Table header bar */}
      <div className="p-4 border-b border-hairline bg-surface-sunken/50 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-44 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>

      {/* Table rows */}
      <div className="divide-y divide-hairline">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="p-4 flex items-center justify-between gap-4 shimmer-effect hover:bg-surface-elevated/40 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1">
              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
              <div className="space-y-1.5 flex-1 max-w-sm">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>

            {Array.from({ length: cols - 1 }).map((_, c) => (
              <div key={c} className="hidden md:flex flex-col items-start gap-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}

            <div className="flex items-center gap-2 shrink-0">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Card Skeleton
 */
export function CardSkeleton({
  lines = 3,
  hasHeader = true,
  className = "",
}: {
  lines?: number;
  hasHeader?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx("material-panel rounded-2xl p-5 border border-hairline space-y-4 shimmer-effect", className)}>
      {hasHeader && (
        <div className="flex items-center justify-between pb-3 border-b border-hairline">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      )}

      <div className="space-y-2 pt-1">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={clsx("h-3.5", i === lines - 1 ? "w-4/5" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Page Header Skeleton
 */
export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="h-7 w-64 rounded-lg" />
        <Skeleton className="h-4 w-96 rounded" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
    </div>
  );
}
