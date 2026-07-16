"use client";

import { useState, useCallback, type FormEvent } from "react";
import { policies } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { Policy, PolicyAction } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText, Trash2 } from "lucide-react";

const ACTIONS: PolicyAction[] = ["allow", "block", "review", "flag"];

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
    10000
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await policies.create({
        priority: Number(priority),
        name,
        action,
        task_type: taskType || undefined,
      });
      setName("");
      setTaskType("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    try {
      await policies.delete(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div>
      <PageHeader title="Policies" description="Define rules that control agent behavior." />

      {(error || loadErr) && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error || loadErr?.message}
        </div>
      )}

      {/* Create form */}
      <Card className="mb-6">
        <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          New policy
        </div>
        <form onSubmit={onSubmit} className="grid grid-cols-4 gap-3">
          <Input
            label="Priority"
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            required
          />
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="block external IPs"
            required
          />
          <Select
            label="Action"
            value={action}
            onChange={(e) => setAction(e.target.value as PolicyAction)}
            options={ACTIONS.map((a) => ({ value: a, label: a }))}
          />
          <Input
            label="Task type (optional)"
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
            placeholder="research"
          />
          <div className="col-span-4">
            <Button type="submit" disabled={submitting || !name} size="sm">
              {submitting ? "Adding..." : "Add policy"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Policy list */}
      <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Active policies
      </div>
      {loading && !data && (
        <Card className="text-sm text-muted">Loading...</Card>
      )}
      {data && data.length === 0 && (
        <EmptyState
          icon={<FileText size={24} />}
          title="No policies defined"
          description="Create one above to get started."
        />
      )}
      {data && data.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Priority</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Task type</th>
                <th className="px-4 py-2.5 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {[...data]
                .sort((a, b) => a.priority - b.priority)
                .map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-border/50 transition-colors hover:bg-surface-elevated/50"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {p.priority}
                    </td>
                    <td className="px-4 py-2.5">{p.name}</td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant={
                          p.action === "block"
                            ? "danger"
                            : p.action === "allow"
                            ? "success"
                            : p.action === "review"
                            ? "warning"
                            : "info"
                        }
                      >
                        {p.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {p.task_type ?? "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => onDelete(p.id)}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
