"use client";

import { useState, useCallback, useEffect } from "react";
import { tasks, violations } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { TaskDetail, Violation } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge, severityVariant, decisionVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { MessageJourneyPipeline } from "@/components/pipeline/message-journey-pipeline";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert,
  CheckCircle2,
  Loader2,
  ExternalLink,
  X,
  AlertTriangle,
  Clock,
  Fingerprint,
} from "lucide-react";

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

  const [items, setItems] = useState<Violation[]>([]);
  const data = remoteData
    ? items.length > 0
      ? remoteData.map((v) => items.find((i) => i.id === v.id) ?? v)
      : remoteData
    : items.length > 0
      ? items
      : null;

  // Find the selected violation object for passing extra context to the modal
  const selectedViolation = data?.find((v) => v.task_id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          eyebrow="Security Operations"
          title="Security Violations"
          description="Auditable security violation events flagged across the 6-layer inspection pipeline."
          trailing={loading && data ? <Loader2 size={16} className="text-accent animate-spin" /> : undefined}
        />
        <div className="flex gap-1 rounded-lg border border-hairline bg-surface p-1 shrink-0">
          {FILTERS.map((s) => {
            const active = (s === "all" && !severity) || s === severity;
            return (
              <button
                key={s}
                onClick={() => setSeverity(s === "all" ? undefined : s)}
                className={`rounded-md px-3 py-1 text-[11.5px] font-medium transition-all ${
                  active
                    ? "bg-surface-elevated text-ink-primary border border-hairline-strong shadow-sm font-semibold"
                    : "text-ink-muted hover:text-ink-primary border border-transparent"
                }`}
              >
                {s.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-block/30 bg-block/10 px-4 py-3 text-[13px] text-block font-mono">
          {error.message}
        </div>
      )}

      {/* Full-width violations table */}
      <div>
        {loading && !data && <TableSkeleton rows={6} cols={5} />}

        {!loading && data && data.length === 0 && (
          <EmptyState
            icon={<ShieldAlert size={24} className="text-allow" />}
            title="No security violations match this filter"
            description="Your agent traffic is clean and no inspection layers have triggered violations."
          />
        )}

        {data && data.length > 0 && (
          <div className="material-panel rounded-xl overflow-hidden">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-hairline text-[10.5px] uppercase tracking-wide text-ink-muted bg-surface-elevated/40">
                  <th className="px-5 py-3 font-medium">Violation Type</th>
                  <th className="px-5 py-3 font-medium">Severity</th>
                  <th className="px-5 py-3 font-medium">Layer</th>
                  <th className="px-5 py-3 font-medium">Task ID</th>
                  <th className="px-5 py-3 font-medium">Timestamp</th>
                  <th className="px-5 py-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((v) => {
                  const isSelected = selectedId === v.task_id;
                  return (
                    <tr
                      key={v.id}
                      onClick={() => setSelectedId(v.task_id)}
                      className={`border-t border-hairline/60 cursor-pointer transition-all duration-150 hover:bg-surface-elevated group ${
                        isSelected ? "bg-accent/5 border-l-2 border-l-accent" : ""
                      }`}
                    >
                      <td className="px-5 py-3.5 font-mono text-[12px] font-semibold text-ink-primary">
                        {v.violation_type}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={severityVariant(v.severity)}>
                          {v.severity}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px] text-ink-muted">
                        {v.layer}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px] text-ink-muted">
                        {v.task_id.slice(0, 8)}…
                      </td>
                      <td className="px-5 py-3.5 text-[11px] font-mono text-ink-muted">
                        {new Date(v.created_at).toLocaleTimeString([], { timeZone: 'UTC' })} UTC
                      </td>
                      <td className="px-5 py-3.5 text-right">
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
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-allow">
                            <CheckCircle2 size={12} /> Resolved
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal Dialog with Backdrop Blur ──────────────────────────────────── */}
      <AnimatePresence>
        {selectedId && (
          <ViolationModal
            taskId={selectedId}
            violation={selectedViolation}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Violation Detail Modal — Backdrop blur + centered dialog
   ════════════════════════════════════════════════════════════════════════════ */

function ViolationModal({
  taskId,
  violation,
  onClose,
}: {
  taskId: string;
  violation: Violation | null;
  onClose: () => void;
}) {
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

  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 bg-black/25 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Dialog */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className="pointer-events-auto w-full max-w-[860px] max-h-[85vh] overflow-y-auto rounded-2xl bg-surface border border-hairline-strong shadow-popover"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-hairline sticky top-0 bg-surface/95 backdrop-blur-sm z-10 rounded-t-2xl">
            <div>
              <div className="eyebrow mb-0.5 flex items-center gap-2">
                <AlertTriangle size={12} className="text-block" />
                Violation Diagnostics
              </div>
              <div className="flex items-center gap-2.5">
                {task && (
                  <Badge variant={decisionVariant(task.decision)}>{task.decision}</Badge>
                )}
                {violation && (
                  <Badge variant={severityVariant(violation.severity)}>{violation.severity}</Badge>
                )}
                {task && (
                  <span className="font-mono text-[12px] text-ink-muted">
                    Risk: {task.risk_score.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-elevated border border-transparent hover:border-hairline transition-all"
            >
              <X size={16} />
            </button>
          </div>

          {/* Modal Body */}
          <div className="px-6 py-5 space-y-5">
            {loading && !task && (
              <div className="flex items-center justify-center py-10 text-ink-muted gap-2 text-[13px]">
                <Loader2 size={16} className="animate-spin" />
                Loading violation details…
              </div>
            )}

            {!loading && !task && (
              <div className="text-center py-10 text-ink-muted text-[13px]">
                Task detail not found.
              </div>
            )}

            {task && (
              <>
                {/* Meta row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <MetaCard
                    label="Task ID"
                    value={task.id.slice(0, 12) + "…"}
                    icon={<Fingerprint size={13} className="text-accent" />}
                    mono
                  />
                  <MetaCard
                    label="Violation"
                    value={violation?.violation_type ?? "—"}
                    icon={<ShieldAlert size={13} className="text-block" />}
                    mono
                  />
                  <MetaCard
                    label="Flagged At"
                    value={violation ? new Date(violation.created_at).toLocaleTimeString([], { timeZone: 'UTC' }) + ' UTC' : "—"}
                    icon={<Clock size={13} className="text-review" />}
                  />
                </div>

                {/* Pipeline */}
                <div>
                  <div className="eyebrow mb-2">Inspection Pipeline · Failure Point</div>
                  <MessageJourneyPipeline
                    task={task}
                    decision={task.decision}
                    riskScore={task.risk_score}
                    violatingLayer={task.violations?.[0]?.layer ?? task.violating_layer}
                    animated={true}
                    compact={false}
                    className="bg-surface-sunken/60 p-4 rounded-xl border border-hairline"
                  />
                </div>

                {/* Groq Rationale */}
                {task.groq_rationale && (
                  <div className="rounded-xl bg-surface-elevated border border-hairline p-4 space-y-1.5">
                    <div className="eyebrow">Groq Semantic Guard Rationale</div>
                    <p className="text-[13px] text-ink-primary italic leading-relaxed">
                      &quot;{task.groq_rationale}&quot;
                    </p>
                  </div>
                )}

                {/* Trace link */}
                {task.trace_id && (
                  <div className="flex items-center justify-end pt-2 border-t border-hairline">
                    <a
                      href={`/dashboard/traces/${task.trace_id}`}
                      className="text-[11px] font-mono text-accent hover:underline flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-accent/5 transition-colors"
                    >
                      View Full Trace <ExternalLink size={11} />
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ── Small meta card used inside the modal ──────────────────────────────── */

function MetaCard({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-elevated/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-ink-muted mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-[13px] font-semibold text-ink-primary truncate ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

/* ── Resolve Button ─────────────────────────────────────────────────────── */

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
      // Silently fail
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
      className="h-7 px-2.5 font-mono text-[11px] text-ink-muted hover:text-allow hover:bg-allow/10"
    >
      {resolving ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <>
          <CheckCircle2 size={12} />
          Resolve
        </>
      )}
    </Button>
  );
}
