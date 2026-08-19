"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { tasks } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { TraceEvent } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CardSkeleton } from "@/components/ui/skeleton";
import { Activity, Clock, Loader2 } from "lucide-react";

export default function TraceDetailPage() {
  const { traceId } = useParams<{ traceId: string }>();

  const fetcher = useCallback(
    (_signal: AbortSignal) =>
      tasks.trace(traceId ?? "").then((r) => r as TraceEvent[]),
    [traceId]
  );

  const { data, loading, error } = usePolling<TraceEvent[]>(fetcher, 4000, !!traceId);

  if (!traceId) {
    return <Card>No trace_id in URL.</Card>;
  }
  if (loading && !data) {
    return <CardSkeleton lines={6} hasHeader={true} />;
  }
  if (error) {
    return <Card className="text-danger">{error.message}</Card>;
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<Activity size={20} />}
        title="No events for this trace yet"
      />
    );
  }

  const maxDuration = Math.max(1, ...data.map((e) => e.duration_ms ?? 0));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Distributed Tracing"
        title="Trace Timeline"
        description={`OpenTelemetry distributed trace ID: ${traceId}`}
        trailing={loading && data ? <Loader2 size={16} className="text-accent animate-spin" /> : undefined}
      />

      <Card className="space-y-4">
        {data.map((e) => {
          const widthPct = ((e.duration_ms ?? 0) / maxDuration) * 100;
          return (
            <div key={e.id} className="border-l-2 border-accent pl-3.5 py-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold text-ink-primary">{e.event_name}</span>
                  <span className="text-[11px] font-mono text-ink-muted px-1.5 py-0.5 rounded bg-surface-elevated border border-hairline">
                    span: {e.span_id.slice(0, 8)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono text-ink-muted">
                  {e.created_at && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} className="text-accent" />
                      {new Date(e.created_at).toLocaleString([], { timeZone: 'UTC' })} UTC
                    </span>
                  )}
                  <span className="text-ink-primary font-semibold tabular-nums">
                    {e.duration_ms != null ? `${e.duration_ms}ms` : "-"}
                  </span>
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${Math.max(2, widthPct)}%` }}
                />
              </div>
              {e.attributes && Object.keys(e.attributes).length > 0 && (
                <pre className="mt-2 overflow-x-auto text-[11px] text-ink-muted font-mono bg-surface-sunken p-2.5 rounded-lg border border-hairline">
                  {JSON.stringify(e.attributes, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

