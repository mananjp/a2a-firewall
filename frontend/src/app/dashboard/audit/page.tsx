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
import { TableSkeleton } from "@/components/ui/skeleton";
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
  Lock,
  ExternalLink,
} from "lucide-react";
import { motion } from "framer-motion";

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          eyebrow="Non-Amplification"
          title="Delegation Chain Audit Trail"
          description="Cryptographic Ed25519 signatures, scoped macaroon caveats, and non-amplification verification across multi-agent hops."
        />
        <div className="flex items-center gap-2">
          <Button
            onClick={handleSeedDemo}
            disabled={seeding}
            variant="primary"
            size="sm"
            className="gap-2 font-mono text-[12px]"
          >
            {seeding ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {seeding ? "Simulating..." : "Generate Delegation Chain"}
          </Button>
          <Button
            onClick={handleDownloadCsv}
            variant="secondary"
            size="sm"
            className="gap-2 font-mono text-[12px]"
          >
            <Download size={13} />
            Export CSV
          </Button>
        </div>
      </div>

      {(error || seedError) && (
        <div className="rounded-lg border border-block/30 bg-block/10 px-4 py-3 text-[13px] text-block font-mono">
          {error?.message || seedError}
        </div>
      )}

      <div className="grid grid-cols-12 gap-5">
        {/* Left: Delegation Chain Events Table */}
        <div className="col-span-12 lg:col-span-7">
          {loading && !data && <TableSkeleton rows={5} cols={4} />}

          {!loading && data && data.events.length === 0 && (
            <EmptyState
              icon={<GitFork size={24} />}
              title="No delegation chain events recorded yet"
              description="Run a multi-agent delegation test to record cryptographic hops and macaroon caveats."
              action={
                <Button onClick={handleSeedDemo} disabled={seeding} size="sm" className="gap-2">
                  {seeding ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  Generate Demo Delegation Chain
                </Button>
              }
            />
          )}

          {data && data.events.length > 0 && (
            <div className="material-panel rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-hairline flex items-center justify-between">
                <span className="eyebrow">Logged Delegation Events</span>
                <span className="text-[11px] font-mono text-ink-muted">{data.events.length} records</span>
              </div>
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-hairline text-[10.5px] uppercase tracking-wide text-ink-muted bg-surface-elevated/40">
                    <th className="px-4 py-2.5 font-medium">Task ID</th>
                    <th className="px-4 py-2.5 font-medium">Delegation Hop</th>
                    <th className="px-4 py-2.5 font-medium">Depth</th>
                    <th className="px-4 py-2.5 font-medium">Ed25519 Sig</th>
                    <th className="px-4 py-2.5 font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((ev, i) => {
                    const isSelected = selectedTaskId === ev.task_id;
                    return (
                      <tr
                        key={`${ev.task_id}-${i}`}
                        onClick={() => setSelectedTaskId(ev.task_id)}
                        className={`border-t border-hairline/60 cursor-pointer transition-all duration-120 hover:bg-surface-elevated ${
                          isSelected ? "bg-surface-elevated border-l-2 border-l-accent" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-[12px] text-accent font-medium">
                          {ev.task_id.slice(0, 8)}...
                        </td>
                        <td className="px-4 py-3 text-[12px]">
                          <div className="flex items-center gap-1.5 font-medium text-ink-primary">
                            <span>{ev.sender_name}</span>
                            <ArrowRight size={11} className="text-ink-muted" />
                            <span>{ev.receiver_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          <Badge variant="outline">hop {ev.delegation_depth}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {ev.signature_valid ? (
                            <Badge variant="allow" className="gap-1 text-[10px]">
                              <CheckCircle2 size={10} /> Valid
                            </Badge>
                          ) : (
                            <Badge variant="block" className="gap-1 text-[10px]">
                              <XCircle size={10} /> Invalid
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[11px] font-mono text-ink-muted">
                          {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString([], { timeZone: 'UTC' }) + ' UTC' : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Chain Visualization / Details */}
        <div className="col-span-12 lg:col-span-5">
          <ChainVisualizer taskId={selectedTaskId} />
        </div>
      </div>
    </div>
  );
}

function ChainVisualizer({ taskId }: { taskId: string | null }) {
  const { data: chain, loading } = usePolling<TaskAuditChain | null>(
    useCallback(
      (_signal) => (taskId ? audit.taskChain(taskId) : Promise.resolve(null)),
      [taskId]
    ),
    5000,
    !!taskId
  );

  if (!taskId) {
    return (
      <div className="material-panel rounded-xl text-center py-14 px-6">
        <GitFork size={32} className="mx-auto mb-3 text-ink-muted/40" />
        <div className="text-[14px] font-semibold text-ink-primary">Select a Delegation Event</div>
        <div className="text-[12px] text-ink-muted mt-1 max-w-xs mx-auto leading-relaxed">
          Click any event on the left to reconstruct its cryptographic lineage, macaroon caveats, and non-amplification proof.
        </div>
      </div>
    );
  }

  if (loading && !chain) {
    return <Card className="text-sm text-ink-muted">Reconstructing cryptographic tree...</Card>;
  }

  if (!chain) {
    return <Card className="text-sm text-ink-muted">Chain data unavailable.</Card>;
  }

  return (
    <div className="material-panel rounded-xl p-5 space-y-4">
      {/* Root Task & Intent Header */}
      <div className="border-b border-hairline pb-4">
        <div className="flex items-center justify-between mb-1.5">
          <div className="eyebrow">Cryptographic Tree</div>
          <Badge variant="allow" className="font-mono text-[10px]">
            {chain.hops_count} {chain.hops_count === 1 ? "hop" : "hops"}
          </Badge>
        </div>
        <div className="text-[13px] font-mono text-ink-primary font-bold truncate">
          Task: {chain.task_id}
        </div>

        {/* Declared Intent Box */}
        {chain.declared_intent && (
          <div className="mt-3 rounded-lg bg-surface-elevated border border-hairline p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 font-semibold text-accent">
                <BrainCircuit size={13} /> Root Declared Intent
              </span>
              {chain.intent_drift_score !== null && (
                <span
                  className={`font-mono text-[11px] font-bold ${
                    chain.intent_drift_score > 0.7
                      ? "text-block"
                      : chain.intent_drift_score > 0.4
                      ? "text-review"
                      : "text-allow"
                  }`}
                >
                  drift: {chain.intent_drift_score.toFixed(2)}
                </span>
              )}
            </div>
            <div className="text-[12px] text-ink-primary italic font-serif">
              &quot;{chain.declared_intent}&quot;
            </div>
          </div>
        )}
      </div>

      {/* Visual Vertical Graph Timeline */}
      <div className="space-y-3 relative before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-hairline">
        {chain.hops.map((hop, index) => (
          <div key={hop.id} className="relative pl-7 space-y-2">
            {/* Timeline node icon */}
            <div
              className={`absolute left-1 top-0.5 -translate-x-1/2 flex h-5 w-5 items-center justify-center rounded-full border ${
                hop.signature_valid
                  ? "border-allow/40 bg-allow/10 text-allow"
                  : "border-block/40 bg-block/10 text-block"
              }`}
            >
              {hop.signature_valid ? <ShieldCheck size={11} /> : <AlertTriangle size={11} />}
            </div>

            {/* Hop Header */}
            <div className="flex items-center justify-between">
              <div className="text-[12.5px] font-semibold text-ink-primary flex items-center gap-1.5">
                <span>{hop.sender_name}</span>
                <ArrowRight size={11} className="text-ink-muted" />
                <span>{hop.receiver_name}</span>
              </div>
              <span className="text-[10px] font-mono text-ink-muted">
                Depth {hop.delegation_depth}
              </span>
            </div>

            {/* Scoped Macaroon Caveats */}
            {hop.caveats && hop.caveats.length > 0 && (
              <div className="rounded-lg border border-hairline bg-surface-elevated p-2.5 space-y-1.5">
                <div className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1">
                  <FileCode size={11} /> Macaroon Caveats (Narrowed Permissions)
                </div>
                <div className="flex flex-wrap gap-1">
                  {hop.caveats.map((c, ci) => (
                    <span
                      key={ci}
                      className="inline-block font-mono text-[10px] bg-surface text-allow px-2 py-0.5 rounded border border-allow/25"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Hash */}
            <div className="text-[10px] font-mono text-ink-muted truncate">
              sig hash: {hop.chain_hash.slice(0, 32)}...
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
