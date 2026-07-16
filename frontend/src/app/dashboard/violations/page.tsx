"use client";

import { useState, useCallback } from "react";
import { tasks, violations } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { TaskDetail, Violation } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge, severityVariant, decisionVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ShieldAlert, CheckCircle2, Loader2 } from "lucide-react";

const FILTERS = ["all", "low", "medium", "high", "critical"] as const;

export default function ViolationsPage() {
  const [severity, setSeverity] = useState<string | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: remoteData, loading, error } = usePolling<Violation[]>(
    useCallback(
      (_signal) => violations.list(severity) as Promise<Violation[]>,
      [severity]
    ),
    5000
  );

  // Local state for optimistic resolve updates
  const [items, setItems] = useState<Violation[]>([]);
  const data = remoteData
    ? items.length > 0
      ? remoteData.map((v) => items.find((i) => i.id === v.id) ?? v)
      : remoteData
    : items.length > 0
      ? items
      : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Violations" description="Filtered violation events and task details." />
        <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
          {FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setSeverity(s === "all" ? undefined : s)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                (s === "all" && !severity) || s === severity
                  ? "bg-surface-elevated text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error.message}
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-8">
          {loading && !data && (
            <Card className="text-sm text-muted">Loading...</Card>
          )}
          {data && data.length === 0 && (
            <EmptyState
              icon={<ShieldAlert size={24} />}
              title="No violations match this filter"
            />
          )}
          {data && data.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">Severity</th>
                    <th className="px-4 py-2.5 font-medium">Layer</th>
                    <th className="px-4 py-2.5 font-medium">When</th>
                    <th className="px-4 py-2.5 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((v) => (
                    <tr
                      key={v.id}
                      className={`border-t border-border/50 cursor-pointer transition-colors hover:bg-surface-elevated/50 ${
                        selectedId === v.task_id ? "bg-surface-elevated/50" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs" onClick={() => setSelectedId(v.task_id)}>
                        {v.violation_type}
                      </td>
                      <td className="px-4 py-2.5" onClick={() => setSelectedId(v.task_id)}>
                        <Badge variant={severityVariant(v.severity)}>
                          {v.severity}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground" onClick={() => setSelectedId(v.task_id)}>
                        {v.layer}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground" onClick={() => setSelectedId(v.task_id)}>
                        {new Date(v.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5">
                        {!v.resolved ? (
                          <ResolveButton
                            violationId={v.id}
                            onResolved={(id) => {
                              setItems((prev) =>
                                prev.map((item) =>
                                  item.id === id ? { ...item, resolved: true } : item
                                )
                              );
                            }}
                          />
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] text-success">
                            <CheckCircle2 size={12} /> Resolved
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
        <div className="col-span-4">
          <ViolationDetail taskId={selectedId} />
        </div>
      </div>
    </div>
  );
}

function ViolationDetail({ taskId }: { taskId: string | null }) {
  const { data: task, loading } = usePolling<TaskDetail | null>(
    useCallback(
      (_signal) =>
        taskId
          ? tasks.get(taskId).then((t) => t as TaskDetail)
          : Promise.resolve(null),
      [taskId]
    ),
    5000,
    !!taskId
  );

  if (!taskId) {
    return (
      <Card className="text-sm text-muted">
        Select a violation to see its task detail.
      </Card>
    );
  }
  if (loading && !task) {
    return <Card className="text-sm text-muted">Loading...</Card>;
  }
  if (!task) {
    return <Card className="text-sm text-muted">Task not found.</Card>;
  }

  return (
    <Card className="space-y-3">
      <div>
        <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
          Decision
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={decisionVariant(task.decision)}>{task.decision}</Badge>
          <span className="text-xs text-muted-foreground">
            risk {task.risk_score.toFixed(2)}
          </span>
        </div>
      </div>
      {task.trace_id && (
        <div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
            Trace
          </div>
          <a
            href={`/dashboard/traces/${task.trace_id}`}
            className="text-xs font-mono text-accent hover:underline"
          >
            {task.trace_id.slice(0, 16)}...
          </a>
        </div>
      )}
      <div>
        <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
          Violations
        </div>
        <ul className="space-y-1">
          {task.violations.map((v, i) => (
            <li key={i} className="font-mono text-xs">
              <Badge variant={severityVariant(v.severity)} className="mr-1">
                {v.severity}
              </Badge>
              {v.type} <span className="text-muted">({v.layer})</span>
            </li>
          ))}
        </ul>
      </div>
      {task.groq_rationale && (
        <div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
            Groq rationale
          </div>
          <div className="text-xs text-muted-foreground italic leading-relaxed">
            {task.groq_rationale}
          </div>
        </div>
      )}
    </Card>
  );
}

function ResolveButton({
  violationId,
  onResolved,
}: {
  violationId: string;
  onResolved: (id: string) => void;
}) {
  const [resolving, setResolving] = useState(false);

  async function handleResolve() {
    if (resolving) return;
    setResolving(true);
    try {
      await violations.resolve(violationId);
      onResolved(violationId);
    } catch {
      // Silently fail - user can retry
    } finally {
      setResolving(false);
    }
  }

  return (
    <Button
      onClick={(e) => {
        e.stopPropagation();
        handleResolve();
      }}
      disabled={resolving}
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-[11px]"
    >
      {resolving ? (
        <Loader2 size={11} className="animate-spin" />
      ) : (
        <>
          <CheckCircle2 size={11} />
          Resolve
        </>
      )}
    </Button>
  );
}
