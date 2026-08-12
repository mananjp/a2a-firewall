"use client";

import { useState, useCallback } from "react";
import { audit, demo } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { AuditChainExport, TaskAuditChain } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  GitFork,
  Download,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  FileCode,
  BrainCircuit,
  Play,
  Loader2,
} from "lucide-react";

export default function AuditPage() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  const { data, loading, error, refresh } = usePolling<AuditChainExport>(
    useCallback((_signal) => audit.listChains(100), []),
    5000
  );

  function handleDownloadCsv() {
    const url = audit.exportCsvUrl(100);
    window.open(url, "_blank");
  }

  async function handleSeedDemo() {
    if (seeding) return;
    setSeeding(true);
    setSeedError(null);
    try {
      await demo.runDelegation("delegation_clean");
      await refresh();
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : "Failed to generate demo chain");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="Delegation Chain Audit"
          description="Auditable delegation lineage, macaroon caveats, and non-amplification verification."
        />
        <div className="flex items-center gap-2">
          <Button onClick={handleSeedDemo} disabled={seeding} variant="secondary" size="sm" className="gap-2">
            {seeding ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {seeding ? "Generating..." : "Generate Demo Chain"}
          </Button>
          <Button onClick={handleDownloadCsv} variant="secondary" size="sm" className="gap-2">
            <Download size={14} />
            Export CSV
          </Button>
        </div>
      </div>

      {(error || seedError) && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error?.message || seedError}
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* Left: Delegation Chain Events Table */}
        <div className="col-span-7">
          {loading && !data && (
            <Card className="text-sm text-muted">Loading delegation chains...</Card>
          )}

          {data && data.events.length === 0 && (
            <EmptyState
              icon={<GitFork size={24} />}
              title="No delegation chain events recorded yet"
              description="Click below to generate a multi-hop delegation chain with real macaroon caveats and audit records."
              action={
                <Button onClick={handleSeedDemo} disabled={seeding} size="sm" className="gap-2">
                  {seeding ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  Generate Demo Delegation Chain
                </Button>
              }
            />
          )}

          {data && data.events.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Task ID</th>
                    <th className="px-4 py-2.5 font-medium">Sender → Receiver</th>
                    <th className="px-4 py-2.5 font-medium">Depth</th>
                    <th className="px-4 py-2.5 font-medium">Sig</th>
                    <th className="px-4 py-2.5 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((ev, i) => (
                    <tr
                      key={`${ev.task_id}-${i}`}
                      onClick={() => setSelectedTaskId(ev.task_id)}
                      className={`border-t border-border/50 cursor-pointer transition-colors hover:bg-surface-elevated/50 ${
                        selectedTaskId === ev.task_id ? "bg-surface-elevated/50" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-accent">
                        {ev.task_id.slice(0, 8)}...
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span>{ev.sender_name}</span>
                          <ArrowRight size={12} className="text-muted-foreground" />
                          <span>{ev.receiver_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono">
                        <Badge variant="outline">hop {ev.delegation_depth}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {ev.signature_valid ? (
                          <Badge variant="success" className="gap-1 text-[10px]">
                            <CheckCircle2 size={10} /> Valid
                          </Badge>
                        ) : (
                          <Badge variant="danger" className="gap-1 text-[10px]">
                            <XCircle size={10} /> Invalid
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {/* Right: Chain Visualization / Details */}
        <div className="col-span-5">
          <ChainVisualizer taskId={selectedTaskId} />
        </div>
      </div>
    </div>
  );
}

function ChainVisualizer({ taskId }: { taskId: string | null }) {
  const { data: chain, loading } = usePolling<TaskAuditChain | null>(
    useCallback(
      (_signal) =>
        taskId ? audit.taskChain(taskId) : Promise.resolve(null),
      [taskId]
    ),
    5000,
    !!taskId
  );

  if (!taskId) {
    return (
      <Card className="text-center py-12">
        <GitFork size={32} className="mx-auto mb-2 text-muted-foreground/40" />
        <div className="text-sm font-medium text-muted-foreground">Select a Delegation Event</div>
        <div className="text-xs text-muted-foreground/70 mt-1 max-w-xs mx-auto">
          Click any row on the left to reconstruct its complete multi-hop delegation chain & caveats.
        </div>
      </Card>
    );
  }

  if (loading && !chain) {
    return <Card className="text-sm text-muted">Reconstructing delegation chain...</Card>;
  }

  if (!chain) {
    return <Card className="text-sm text-muted">Chain data unavailable.</Card>;
  }

  return (
    <Card className="space-y-4">
      {/* Root Task & Intent Header */}
      <div className="border-b border-border pb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Delegation Chain Lineage
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            {chain.hops_count} {chain.hops_count === 1 ? "hop" : "hops"}
          </Badge>
        </div>
        <div className="text-xs font-mono text-foreground font-medium truncate">
          Task: {chain.task_id}
        </div>

        {/* Declared Intent Box */}
        {chain.declared_intent && (
          <div className="mt-2.5 rounded-md bg-surface-elevated border border-border p-2.5 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 font-medium text-accent">
                <BrainCircuit size={12} /> Root Declared Intent
              </span>
              {chain.intent_drift_score !== null && (
                <span
                  className={`font-mono text-[10px] ${
                    chain.intent_drift_score > 0.7
                      ? "text-danger font-semibold"
                      : "text-muted-foreground"
                  }`}
                >
                  drift: {chain.intent_drift_score.toFixed(2)}
                </span>
              )}
            </div>
            <div className="text-xs text-foreground/90 italic">
              &quot;{chain.declared_intent}&quot;
            </div>
          </div>
        )}
      </div>

      {/* Hops Vertical Timeline Tree */}
      <div className="space-y-3 relative before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-border">
        {chain.hops.map((hop, index) => (
          <div key={hop.id} className="relative pl-7 space-y-1.5">
            {/* Timeline node icon */}
            <div
              className={`absolute left-1 top-0.5 -translate-x-1/2 flex h-5 w-5 items-center justify-center rounded-full border ${
                hop.signature_valid
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-danger/40 bg-danger/10 text-danger"
              }`}
            >
              {hop.signature_valid ? <ShieldCheck size={11} /> : <AlertTriangle size={11} />}
            </div>

            {/* Hop title */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <span>{hop.sender_name}</span>
                <ArrowRight size={11} className="text-muted-foreground" />
                <span>{hop.receiver_name}</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">
                Depth {hop.delegation_depth}
              </span>
            </div>

            {/* Caveats pill list */}
            {hop.caveats && hop.caveats.length > 0 && (
              <div className="rounded border border-border/70 bg-surface/50 p-2 space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <FileCode size={10} /> Caveats (Attenuation)
                </div>
                <div className="flex flex-wrap gap-1">
                  {hop.caveats.map((c, ci) => (
                    <span
                      key={ci}
                      className="inline-block font-mono text-[10px] bg-surface-elevated text-foreground/90 px-1.5 py-0.5 rounded border border-border"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Chain Hash */}
            <div className="text-[10px] font-mono text-muted-foreground/70 truncate">
              hash: {hop.chain_hash.slice(0, 24)}...
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
