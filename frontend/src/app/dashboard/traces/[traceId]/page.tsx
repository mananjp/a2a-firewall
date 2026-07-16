"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { tasks } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { TraceEvent } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Activity } from "lucide-react";

export default function TraceDetailPage() {
  const { traceId } = useParams<{ traceId: string }>();

  const fetcher = useCallback(
    (_signal: AbortSignal) =>
      tasks.trace(traceId ?? "").then((r) => r as TraceEvent[]),
    [traceId]
  );

  const { data, loading, error } = usePolling<TraceEvent[]>(fetcher, 5000, !!traceId);

  if (!traceId) {
    return <Card>No trace_id in URL.</Card>;
  }
  if (loading && !data) {
    return <Card className="text-muted">Loading trace...</Card>;
  }
  if (error) {
    return <Card className="text-danger">{error.message}</Card>;
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<Activity size={24} />}
        title="No events for this trace yet"
      />
    );
  }

  const maxDuration = Math.max(1, ...data.map((e) => e.duration_ms ?? 0));

  return (
    <div>
      <PageHeader title="Trace Timeline" description={`trace_id: ${traceId}`} />

      <Card className="space-y-3">
        {data.map((e) => {
          const widthPct = ((e.duration_ms ?? 0) / maxDuration) * 100;
          return (
            <div key={e.id} className="border-l-2 border-border pl-3">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono text-foreground">
                    {e.event_name}
                  </span>
                  <span className="text-muted ml-2">
                    span {e.span_id.slice(0, 8)}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {e.duration_ms != null ? `${e.duration_ms}ms` : "-"}
                </div>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-surface-elevated">
                <div
                  className="h-full rounded bg-accent transition-all duration-500"
                  style={{ width: `${Math.max(2, widthPct)}%` }}
                />
              </div>
              <pre className="mt-1 overflow-x-auto text-[11px] text-muted-foreground font-mono">
                {JSON.stringify(e.attributes, null, 2)}
              </pre>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
