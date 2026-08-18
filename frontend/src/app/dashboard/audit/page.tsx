"use client";

import { useCallback, useState } from "react";
import { audit as auditApi, demo as demoApi } from "@/lib/api";
import type { AuditChainExport, AuditHop, TaskAuditChain } from "@/lib/api";
import { Btn, PageHead, Panel, Stat, StatGrid, Tag, Terminal } from "@/components/soc/ui";

// Simple polling hook inline (no external hook dependency)
function useAuditChain(taskId: string | null) {
  const [chain, setChain] = useState<TaskAuditChain | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await auditApi.taskChain(id);
      setChain(res);
    } catch {
      setChain(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { chain, loading, fetch };
}

export default function AuditPage() {
  const [data, setData] = useState<AuditChainExport | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const { chain, loading: chainLoading, fetch: fetchChain } = useAuditChain(selectedTaskId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditApi.listChains(100);
      setData(res);
      if (res.events.length > 0 && !selectedTaskId) {
        const firstId = res.events[0]!.task_id;
        setSelectedTaskId(firstId);
        fetchChain(firstId);
      }
    } catch {
      // offline — no data
    } finally {
      setLoading(false);
    }
  }, [selectedTaskId, fetchChain]);

  // Auto-load on mount
  const [loaded, setLoaded] = useState(false);
  if (!loaded) {
    setLoaded(true);
    load();
  }

  const generateDemo = async () => {
    setGenerating(true);
    try {
      await demoApi.run("clean");
      await load();
    } catch {
      // noop
    } finally {
      setGenerating(false);
    }
  };

  const selectTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    fetchChain(taskId);
  };

  const events = data?.events ?? [];
  const validCount = events.filter((e) => e.signature_valid).length;
  const invalidCount = events.length - validCount;

  return (
    <div className="space-y-8">
      <PageHead
        index="/09"
        title="Delegation Chain Audit"
        subtitle="Cryptographic lineage reconstruction for every inter-agent delegation hop."
        action={
          <div className="flex gap-2">
            <Btn variant="solid" onClick={generateDemo} disabled={generating}>
              {generating ? "Generating..." : "Generate Demo Chain"}
            </Btn>
            <Btn onClick={load} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </Btn>
          </div>
        }
      />

      <StatGrid>
        <Stat label="Total events" value={String(events.length)} />
        <Stat label="Signatures valid" value={String(validCount)} note="ed25519" />
        <Stat label="Invalid / broken" value={String(invalidCount)} note="fail-closed" />
        <Stat label="Unique tasks" value={String(new Set(events.map((e) => e.task_id)).size)} />
      </StatGrid>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: event table */}
        <Panel title="Delegation Events" hint={`${events.length} records`}>
          <div className="max-h-[520px] divide-y divide-ink/10 overflow-y-auto">
            {events.length === 0 && (
              <p className="py-8 font-mono text-xs text-muted-foreground">
                {loading ? "// Loading audit chains..." : "// No delegation events yet. Generate a demo chain."}
              </p>
            )}
            {events.map((ev, i) => (
              <button
                key={`${ev.task_id}-${i}`}
                type="button"
                onClick={() => selectTask(ev.task_id)}
                className={`block w-full px-3 py-3 text-left transition-colors ${
                  selectedTaskId === ev.task_id ? "bg-secondary" : "hover:bg-secondary/60"
                }`}
              >
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="font-bold text-ink">{ev.task_id.slice(0, 8)}…</span>
                  <Tag tone={ev.signature_valid ? "lime" : "danger"}>
                    {ev.signature_valid ? "valid sig" : "broken sig"}
                  </Tag>
                  <span className="ml-auto text-muted-foreground">depth {ev.delegation_depth}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  <span className="border border-ink/20 px-1.5 py-0.5">{ev.sender_name}</span>
                  <span className="text-violet">→</span>
                  <span className="border border-ink/20 px-1.5 py-0.5">{ev.receiver_name}</span>
                  <span className="ml-auto">{ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : "—"}</span>
                </div>
              </button>
            ))}
          </div>
        </Panel>

        {/* Right: chain detail */}
        <div className="space-y-6">
          <Panel title="Cryptographic Chain" hint={selectedTaskId ? selectedTaskId.slice(0, 12) : "—"}>
            {!selectedTaskId && (
              <p className="font-mono text-xs text-muted-foreground">{"// Select an event to reconstruct its lineage"}</p>
            )}
            {chainLoading && selectedTaskId && (
              <p className="font-mono text-xs text-muted-foreground">{"// Reconstructing chain..."}</p>
            )}
            {chain && !chainLoading && (
              <div className="space-y-4">
                {chain.declared_intent && (
                  <div className="border border-ink/20 bg-secondary/40 px-3 py-2">
                    <div className="label-mono text-muted-foreground">Declared intent</div>
                    <div className="mt-1 font-mono text-xs">{chain.declared_intent}</div>
                    {chain.intent_drift_score != null && (
                      <div className={`mt-1 font-mono text-xs font-bold ${
                        chain.intent_drift_score > 0.7 ? "text-danger" :
                        chain.intent_drift_score > 0.4 ? "text-violet" : "text-lime-foreground"
                      }`}>
                        drift score: {chain.intent_drift_score.toFixed(2)}
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  {chain.hops.map((hop: AuditHop, idx: number) => (
                    <div key={hop.id} className="relative border border-ink/20 px-3 py-3">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="font-bold">
                          {hop.sender_name} → {hop.receiver_name}
                        </span>
                        <div className="flex items-center gap-2">
                          <Tag tone={hop.signature_valid ? "lime" : "danger"}>
                            {hop.signature_valid ? "ed25519 ✓" : "sig broken"}
                          </Tag>
                          <span className="text-muted-foreground">depth {hop.delegation_depth}</span>
                        </div>
                      </div>
                      {hop.caveats.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {hop.caveats.map((c, ci) => (
                            <span key={ci} className="border border-ink/25 px-2 py-0.5 font-mono text-[10px]">{c}</span>
                          ))}
                        </div>
                      )}
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground truncate">
                        hash: {hop.chain_hash.slice(0, 32)}…
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Terminal
            title="chain.verify"
            lines={
              chain
                ? [
                    `task_id    = ${chain.task_id}`,
                    `root_id    = ${chain.root_task_id}`,
                    `hops       = ${chain.hops_count}`,
                    ...(chain.declared_intent ? [`intent     = "${chain.declared_intent}"`] : []),
                    ...(chain.intent_drift_score != null ? [`drift      = ${chain.intent_drift_score.toFixed(2)}`] : []),
                    ...chain.hops.map(
                      (h: AuditHop) =>
                        `  hop[${h.delegation_depth}] ${h.sender_name} → ${h.receiver_name} [sig: ${h.signature_valid ? "VALID" : "BROKEN"}]`
                    ),
                  ]
                : selectedTaskId
                ? ["// reconstructing..."]
                : ["// awaiting selection"]
            }
          />
        </div>
      </div>
    </div>
  );
}
