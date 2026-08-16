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
    <div>
      <PageHeader
        eyebrow="Trace"
        title="Trace Timeline"
        description={`trace_id: ${traceId}`}
      />

      <Card className="space-y-3">
        {data.map((e) => {
          const widthPct = ((e.duration_ms ?? 0) / maxDuration) * 100;
          return (
            <div key={e.id} className="border-l-2 border-accent pl-3">
              <div className="flex items-center justify-between text-[12.5px]">
                <div>
                  <span className="font-mono text-foreground">{e.event_name}</span>
                  <span className="text-muted-foreground ml-2">span {e.span_id.slice(0, 8)}</span>
                </div>
                <div className="text-muted-foreground tabular-nums">
                  {e.duration_ms != null ? `${e.duration_ms}ms` : "-"}
                </div>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
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
