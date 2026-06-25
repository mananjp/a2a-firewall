import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { tasks } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import type { TraceEvent } from "../api/types";

export default function TraceDetailPage() {
  const { traceId } = useParams<{ traceId: string }>();

  const fetcher = useCallback(
    (_signal: AbortSignal) => tasks.trace(traceId ?? "").then((r) => r as TraceEvent[]),
    [traceId],
  );

  const { data, loading, error } = usePolling<TraceEvent[]>(fetcher, 5000, !!traceId);

  if (!traceId) return <div className="card">No trace_id in URL.</div>;
  if (loading && !data) return <div className="card text-slate-400">Loading trace…</div>;
  if (error) return <div className="card text-red-300">{error.message}</div>;
  if (!data || data.length === 0)
    return <div className="card text-slate-400">No events for this trace yet.</div>;

  const maxDuration = Math.max(1, ...data.map((e) => e.duration_ms ?? 0));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Trace timeline</h1>
      <div className="text-xs text-slate-400 font-mono">trace_id: {traceId}</div>

      <div className="card space-y-3">
        {data.map((e) => {
          const widthPct = ((e.duration_ms ?? 0) / maxDuration) * 100;
          return (
            <div key={e.id} className="border-l-2 border-slate-600 pl-3">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono text-slate-200">{e.event_name}</span>
                  <span className="text-slate-500 ml-2">span {e.span_id.slice(0, 8)}</span>
                </div>
                <div className="text-slate-400">
                  {e.duration_ms != null ? `${e.duration_ms}ms` : "—"}
                </div>
              </div>
              <div className="h-2 bg-slate-800 rounded mt-1 overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${Math.max(2, widthPct)}%` }}
                />
              </div>
              <pre className="text-xs text-slate-400 mt-1 overflow-x-auto">
                {JSON.stringify(e.attributes, null, 2)}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
