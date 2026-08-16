"use client";

import { useState, useCallback, type FormEvent } from "react";
import { policies } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { Policy, PolicyAction } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { FileText, Trash2, Plus, ShieldCheck, ArrowRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

const ACTIONS: PolicyAction[] = ["block", "allow", "review", "flag"];

export default function PoliciesPage() {
  const [priority, setPriority] = useState("100");
  const [name, setName] = useState("");
  const [action, setAction] = useState<PolicyAction>("block");
  const [taskType, setTaskType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    data,
    loading,
    error: loadErr,
    refresh,
  } = usePolling<Policy[]>(
    useCallback((_signal) => policies.list() as Promise<Policy[]>, []),
    8000
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await policies.create({
        priority: Number(priority) || 100,
        name: name.trim(),
        action,
        task_type: taskType.trim() || undefined,
      });
      setName("");
      setTaskType("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create policy");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    try {
      await policies.delete(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete policy");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 5 Rule Engine"
        title="Firewall Policies & Safety Predicates"
        description="Configure declarative rule predicates, action gates, and priority-ranked evaluation rules for agent payloads."
      />

      {(error || loadErr) && (
        <div className="rounded-lg border border-block/30 bg-block/10 px-4 py-3 text-[13px] text-block font-mono">
          {error || loadErr?.message}
        </div>
      )}

      {/* Sentence-style Policy Builder Centerpiece */}
      <div className="material-panel rounded-2xl p-6">
        <div className="eyebrow mb-3 flex items-center gap-1.5">
          <Sparkles size={13} className="text-accent" />
          <span>Declarative Policy Sentence Builder</span>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="p-4 rounded-xl border border-hairline-strong bg-surface-elevated text-[14px] leading-loose text-ink-primary font-medium">
            <span>When incoming task of type </span>
            <input
              type="text"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              placeholder="any (e.g. wire_transfer)"
              className="inline-block mx-1.5 px-3 py-1 rounded-lg border border-hairline bg-surface text-accent font-mono text-[13px] focus:outline-none focus:border-accent w-48"
            />
            <span> matches policy </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Block unverified external payouts"
              required
              className="inline-block mx-1.5 px-3 py-1 rounded-lg border border-hairline bg-surface text-ink-primary text-[13px] focus:outline-none focus:border-accent w-72"
            />
            <span> immediately set verdict to </span>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as PolicyAction)}
              className={`inline-block mx-1.5 px-3 py-1 rounded-lg border font-mono font-bold text-[12px] uppercase focus:outline-none ${
                action === "block"
                  ? "bg-block/15 text-block border-block/40"
                  : action === "allow"
                  ? "bg-allow/15 text-allow border-allow/40"
                  : "bg-review/15 text-review border-review/40"
              }`}
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a} className="bg-surface text-ink-primary">
                  {a.toUpperCase()}
                </option>
              ))}
            </select>
            <span> with evaluation priority </span>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="inline-block mx-1.5 px-2.5 py-1 rounded-lg border border-hairline bg-surface text-ink-primary font-mono text-[13px] focus:outline-none focus:border-accent w-20 text-center"
            />
            <span>.</span>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={submitting || !name.trim()}
              size="sm"
              className="gap-1.5 font-mono text-[12px]"
            >
              <Plus size={14} />
              {submitting ? "Enforcing..." : "Enforce Policy"}
            </Button>
          </div>
        </form>
      </div>

      {/* Active Rules Grid */}
      <div className="material-panel rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-hairline flex items-center justify-between">
          <span className="eyebrow">Active Firewall Policies</span>
          <span className="text-[11px] font-mono text-ink-muted">
            {data?.length ?? 0} rules evaluated in Layer 5
          </span>
        </div>

        {loading && !data && <TableSkeleton rows={4} cols={4} />}

        {!loading && data && data.length === 0 && (
          <EmptyState
            icon={<FileText size={24} />}
            title="No declarative policies configured"
            description="Use the sentence builder above to enforce strict rules against specific task types and payload boundaries."
          />
        )}

        {data && data.length > 0 && (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] uppercase tracking-wide text-ink-muted bg-surface-elevated/40">
                <th className="px-5 py-3 font-medium">Priority</th>
                <th className="px-5 py-3 font-medium">Policy Name</th>
                <th className="px-5 py-3 font-medium">Action Verdict</th>
                <th className="px-5 py-3 font-medium">Target Task Type</th>
                <th className="px-5 py-3 font-medium text-right w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...data]
                .sort((a, b) => a.priority - b.priority)
                .map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-hairline/60 transition-colors duration-120 hover:bg-surface-elevated"
                  >
                    <td className="px-5 py-3.5 font-mono text-[12px] font-bold text-accent tabular-nums">
                      #{p.priority}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-ink-primary">
                      {p.name}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge
                        variant={
                          p.action === "block"
                            ? "block"
                            : p.action === "allow"
                            ? "allow"
                            : p.action === "review"
                            ? "review"
                            : "info"
                        }
                      >
                        {p.action}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[12px] text-ink-muted">
                      {p.task_type ?? "wildcard (*)"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => onDelete(p.id)}
                        className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-block/15 hover:text-block"
                        aria-label={`Delete ${p.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
