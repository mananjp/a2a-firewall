"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { workflowsApi } from "@/lib/api";
import type {
  WorkflowInstanceItem,
  WorkflowStateDetail,
} from "@/lib/types";
import {
  GitMerge,
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
  Activity,
  ArrowRight,
} from "lucide-react";

/**
 * The workflow API has changed shape across backend revisions, and TypeScript
 * cannot catch a drifted response. Normalize once at the ingestion boundary so
 * a missing/renamed field degrades to a default instead of throwing during
 * render (which unmounts the whole tree and blanks the screen).
 */
function normalizeDetail(raw: WorkflowStateDetail): WorkflowStateDetail {
  const state = raw?.state ?? ({} as WorkflowStateDetail["state"]);
  return {
    state: {
      root_task_id: state.root_task_id ?? "",
      node_count: state.node_count ?? 0,
      depth: state.depth ?? 0,
      cumulative_risk: state.cumulative_risk ?? 0,
      cumulative_exposure: state.cumulative_exposure ?? 0,
      distinct_agents: state.distinct_agents ?? 0,
      distinct_tasks: state.distinct_tasks ?? 0,
      anomalies: Array.isArray(state.anomalies) ? state.anomalies : [],
      quarantined: Boolean(state.quarantined),
    },
    nodes: Array.isArray(raw?.nodes) ? raw.nodes : [],
  };
}

function normalizeList(raw: WorkflowInstanceItem[]): WorkflowInstanceItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((wf) => ({
    ...wf,
    cumulative_risk: wf.cumulative_risk ?? 0,
    node_count: wf.node_count ?? 0,
    depth: wf.depth ?? 0,
    anomalies: Array.isArray(wf.anomalies) ? wf.anomalies : [],
    quarantined: Boolean(wf.quarantined),
  }));
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowInstanceItem[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowStateDetail | null>(null);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [quarantineLoading, setQuarantineLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Read by loadData so the auto-select below does not have to re-create
  // loadData (and therefore re-fire the effect) on every selection change.
  const selectedRootIdRef = useRef<string | null>(null);
  // Monotonic token so a slow detail response cannot clobber a newer selection.
  const detailRequestRef = useRef(0);

  const handleSelectWorkflow = useCallback(async (rootTaskId: string) => {
    const requestId = ++detailRequestRef.current;
    try {
      selectedRootIdRef.current = rootTaskId;
      setSelectedRootId(rootTaskId);
      setDetailLoading(true);
      const detail = normalizeDetail(await workflowsApi.get(rootTaskId));
      if (requestId !== detailRequestRef.current) return;
      setSelectedWorkflow(detail);
    } catch (err) {
      if (requestId !== detailRequestRef.current) return;
      console.error("Failed to load workflow state:", err);
      setSelectedWorkflow(null);
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = normalizeList(await workflowsApi.list(50));
      setWorkflows(data);
      if (data.length > 0 && !selectedRootIdRef.current) {
        await handleSelectWorkflow(data[0].root_task_id);
      }
    } catch (err) {
      console.error("Failed to load workflows:", err);
    } finally {
      setLoading(false);
    }
  }, [handleSelectWorkflow]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleQuarantine = async (rootTaskId: string) => {
    try {
      setQuarantineLoading(rootTaskId);
      const res = await workflowsApi.quarantine(rootTaskId);
      setStatusMessage(res.message);
    } catch (err) {
      console.error("Quarantine failed:", err);
      setStatusMessage("Quarantine request failed. See the server logs for details.");
      return;
    } finally {
      setQuarantineLoading(null);
    }
    // Refresh outside the try above so a failed reload cannot overwrite the
    // status message of a quarantine that actually succeeded.
    await loadData();
    if (selectedRootIdRef.current === rootTaskId) {
      await handleSelectWorkflow(rootTaskId);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Graph-Level Runtime Security"
        title="Stateful Multi-Agent Workflows"
        description="Continuous evaluation of the full agent execution graph — detecting circular delegations, fan-out explosions, cumulative risk accumulation, and instant cascade quarantine."
        trailing={
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
            Graph Engine
          </span>
        }
        action={
          <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        }
      />

      {/* Top Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="material-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">Monitored Workflows</span>
            <GitMerge className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-ink-primary">{workflows.length}</div>
            <p className="text-xs text-ink-muted mt-1">Active & historical task graphs</p>
          </CardContent>
        </Card>

        <Card className="material-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">Cumulative Risk</span>
            <Activity className="w-4 h-4 text-review" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-ink-primary">
              {(
                workflows.reduce((acc, w) => acc + (w.cumulative_risk || 0), 0) /
                (workflows.length || 1)
              ).toFixed(2)}
            </div>
            <p className="text-xs text-ink-muted mt-1">Average multi-hop risk</p>
          </CardContent>
        </Card>

        <Card className="material-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">Detected Anomalies</span>
            <AlertTriangle className="w-4 h-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">
              {workflows.reduce((acc, w) => acc + (w.anomalies?.length || 0), 0)}
            </div>
            <p className="text-xs text-ink-muted mt-1">Loops, fan-out & privilege drift</p>
          </CardContent>
        </Card>

        <Card className="material-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">Quarantined Graphs</span>
            <ShieldAlert className="w-4 h-4 text-block" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-block">
              {workflows.filter((w) => w.quarantined).length}
            </div>
            <p className="text-xs text-ink-muted mt-1">Descendant tokens revoked</p>
          </CardContent>
        </Card>
      </div>

      {statusMessage && (
        <div className="p-3 rounded-lg border border-accent/30 bg-accent/10 text-xs font-mono text-accent flex items-center justify-between">
          <span>{statusMessage}</span>
          <Button variant="secondary" size="sm" className="h-6 text-[10px]" onClick={() => setStatusMessage(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Workflows Table (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="material-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-surface-elevated/40 text-ink-muted font-mono uppercase">
                    <th className="p-3">Root Task ID</th>
                    <th className="p-3">Nodes / Depth</th>
                    <th className="p-3">Cumulative Risk</th>
                    <th className="p-3">Anomalies</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-ink-muted">
                        Loading multi-agent workflows...
                      </td>
                    </tr>
                  ) : workflows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-ink-muted">
                        No multi-agent workflow executions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    workflows.map((wf) => {
                      const isSelected = selectedRootId === wf.root_task_id;
                      return (
                        <tr
                          key={wf.id}
                          onClick={() => handleSelectWorkflow(wf.root_task_id)}
                          className={`cursor-pointer transition-colors hover:bg-surface-elevated/60 ${
                            isSelected ? "bg-surface-elevated border-l-2 border-l-accent" : ""
                          }`}
                        >
                          <td className="p-3 font-mono text-ink-primary truncate max-w-[130px]">
                            {wf.root_task_id}
                          </td>
                          <td className="p-3 font-mono text-ink-muted">
                            {wf.node_count} nodes • depth {wf.depth}
                          </td>
                          <td className="p-3 font-mono font-medium">
                            <span
                              className={
                                wf.cumulative_risk > 0.8
                                  ? "text-block"
                                  : wf.cumulative_risk > 0.4
                                  ? "text-review"
                                  : "text-allow"
                              }
                            >
                              {(wf.cumulative_risk ?? 0).toFixed(2)}
                            </span>
                          </td>
                          <td className="p-3">
                            {wf.anomalies && wf.anomalies.length > 0 ? (
                              <Badge tone="block">{wf.anomalies.length} Detected</Badge>
                            ) : (
                              <Badge tone="allow">Clean Graph</Badge>
                            )}
                          </td>
                          <td className="p-3">
                            {wf.quarantined ? (
                              <Badge tone="block">QUARANTINED</Badge>
                            ) : (
                              <Badge tone="allow">ACTIVE</Badge>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {!wf.quarantined ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="text-[11px] h-7 px-2 text-block hover:bg-block/10 hover:border-block/30"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuarantine(wf.root_task_id);
                                }}
                                disabled={quarantineLoading === wf.root_task_id}
                              >
                                Quarantine
                              </Button>
                            ) : (
                              <span className="text-[11px] text-ink-muted font-mono">Quarantined</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Workflow Detail / Graph Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {detailLoading ? (
            <Card className="material-soft p-8 text-center text-ink-muted">
              Loading workflow state graph...
            </Card>
          ) : selectedWorkflow ? (
            <Card className="material-soft border-hairline-strong space-y-4">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-hairline">
                <div>
                  <div className="text-xs font-mono text-ink-muted uppercase tracking-wider">
                    Workflow Graph State
                  </div>
                  <CardTitle className="text-sm font-mono text-ink-primary truncate max-w-[280px]">
                    {selectedWorkflow.state.root_task_id}
                  </CardTitle>
                </div>
                {selectedWorkflow.state.quarantined && (
                  <Badge tone="block">QUARANTINED</Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-4 pt-1">
                {/* State metrics summary */}
                <div className="grid grid-cols-3 gap-2 text-xs font-mono p-3 rounded-lg bg-surface-elevated/70 border border-hairline">
                  <div>
                    <div className="text-ink-muted text-[10px]">TOTAL TASKS</div>
                    <div className="text-base font-bold text-ink-primary">{selectedWorkflow.state.node_count}</div>
                  </div>
                  <div>
                    <div className="text-ink-muted text-[10px]">MAX DEPTH</div>
                    <div className="text-base font-bold text-ink-primary">{selectedWorkflow.state.depth}</div>
                  </div>
                  <div>
                    <div className="text-ink-muted text-[10px]">AGENTS</div>
                    <div className="text-base font-bold text-ink-primary">{selectedWorkflow.state.distinct_agents}</div>
                  </div>
                </div>

                {/* Detected Anomalies list */}
                {selectedWorkflow.state.anomalies.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-mono uppercase font-bold text-block tracking-wider">
                      Graph Anomalies ({selectedWorkflow.state.anomalies.length})
                    </div>
                    {selectedWorkflow.state.anomalies.map((anomaly, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg border border-block/30 bg-block/10 text-xs font-mono text-block space-y-1"
                      >
                        <div className="font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          [{(anomaly.severity ?? "unknown").toUpperCase()}] {(anomaly.anomaly_type ?? "unknown anomaly").replace(/_/g, " ")}
                        </div>
                        <p className="text-[11px] text-ink-muted">{anomaly.description}</p>
                        {anomaly.details && Object.keys(anomaly.details).length > 0 && (
                          <div className="text-[10px] text-ink-muted">
                            {Object.entries(anomaly.details)
                              .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`)
                              .join(" • ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Step-by-step task sequence in graph */}
                <div>
                  <div className="text-xs font-mono text-ink-muted uppercase tracking-wider mb-2">
                    Execution Step Lineage ({selectedWorkflow.nodes.length} nodes)
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {selectedWorkflow.nodes.map((node) => (
                      <div
                        key={node.task_id}
                        className="p-2.5 rounded border border-hairline bg-surface/80 text-xs font-mono space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-ink-muted">Hop {(node.depth ?? 0) + 1}</span>
                          <Badge
                            tone={
                              node.decision === "allow"
                                ? "allow"
                                : node.decision === "block"
                                ? "block"
                                : "warning"
                            }
                          >
                            {(node.decision ?? "unknown").toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-ink-primary truncate">
                          <span className="truncate max-w-[120px]">
                            {String(node.sender_agent_id ?? node.agent_id ?? "?").slice(0, 8)}
                          </span>
                          <ArrowRight className="w-3 h-3 text-ink-muted shrink-0" />
                          <span className="truncate max-w-[120px]">
                            {String(node.receiver_agent_id ?? node.agent_id ?? "?").slice(0, 8)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] text-ink-muted pt-1 border-t border-hairline">
                          <span>Task: {String(node.task_id ?? "?").slice(0, 8)}...</span>
                          <span>Risk: {(node.risk_score ?? 0).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quarantine Action */}
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => handleQuarantine(selectedWorkflow.state.root_task_id)}
                  disabled={quarantineLoading === selectedWorkflow.state.root_task_id}
                >
                  <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
                  Quarantine Workflow & Revoke Child Tokens
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="material-soft p-8 text-center text-ink-muted">
              Select a workflow from the table to visualize its execution graph, hops, and anomaly profile.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
