"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import { violations, telemetry, stats, workspaces, tasks, soc } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type {
  Violation,
  TelemetrySummary,
  StatsOverview,
  Workspace,
  SOCAlert,
  SOCAlertSummary,
} from "@/lib/types";
import type { RecentTask } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge, decisionVariant, severityVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, StatsGridSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { MessageJourneyPipeline } from "@/components/pipeline/message-journey-pipeline";
import {
  ShieldAlert,
  Activity,
  KeyRound,
  ScanSearch,
  FlaskConical,
  Flame,
  Bot,
  BarChart3,
  Ban,
  Zap,
  Clock,
  ArrowRight,
  Settings2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronDown,
  Pause,
  Play,
  Filter,
  RefreshCw,
  X,
  FileCode,
  Loader2,
  Siren,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/* ── SOC Styling Constants ─────────────────────────────────────────── */

const SEV_COLORS: Record<string, string> = {
  P1: "bg-red-500/15 text-red-400 border-red-500/30",
  P2: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  P3: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  P4: "bg-green-500/15 text-green-400 border-green-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/15 text-blue-400",
  acknowledged: "bg-purple-500/15 text-purple-400",
  investigating: "bg-amber-500/15 text-amber-400",
  resolved: "bg-emerald-500/15 text-emerald-400",
  false_positive: "bg-zinc-500/15 text-zinc-400",
};

export default function DashboardPage() {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [isFeedPaused, setIsFeedPaused] = useState(false);
  const [feedFilter, setFeedFilter] = useState<string>("all");
  const [selectedTaskForDrawer, setSelectedTaskForDrawer] = useState<RecentTask | null>(null);

  /* ── Overview data ─────────────────────────────────────────────── */

  const { data: statsData, loading: statsLoading, refresh: refreshStats } = usePolling<StatsOverview>(
    useCallback((_signal) => stats.overview(), []),
    isFeedPaused ? 0 : 4000
  );

  const { data: telemetryData, loading: telemetryLoading, refresh: refreshTelemetry } = usePolling<TelemetrySummary>(
    useCallback((_signal) => telemetry.summary(), []),
    isFeedPaused ? 0 : 6000
  );

  const { data: recentTasks, loading: tasksLoading, refresh: refreshTasks } = usePolling<RecentTask[]>(
    useCallback((_signal) => tasks.recent(20), []),
    isFeedPaused ? 0 : 3000
  );

  const totalDecisions = statsData?.total_tasks || 0;
  const blockCount = statsData?.blocked || 0;
  const reviewCount = telemetryData?.events_by_decision?.["review"] || 0;
  const allowCount = Math.max(0, totalDecisions - blockCount - reviewCount);

  const allowPct = totalDecisions > 0 ? ((allowCount / totalDecisions) * 100).toFixed(1) : "100.0";
  const blockPct = totalDecisions > 0 ? ((blockCount / totalDecisions) * 100).toFixed(1) : "0.0";
  const reviewPct = totalDecisions > 0 ? ((reviewCount / totalDecisions) * 100).toFixed(1) : "0.0";

  const filteredTasks = useMemo(() => {
    if (!recentTasks) return [];
    if (feedFilter === "all") return recentTasks;
    return recentTasks.filter((t) => t.decision === feedFilter);
  }, [recentTasks, feedFilter]);

  /* ── SOC data ──────────────────────────────────────────────────── */

  const [socAlerts, setSocAlerts] = useState<SOCAlert[]>([]);
  const [socSummary, setSocSummary] = useState<SOCAlertSummary | null>(null);
  const [socFilter, setSocFilter] = useState<{ severity?: string; status?: string }>({});
  const [socLoading, setSocLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<SOCAlert | null>(null);

  const loadSocData = useCallback(async () => {
    try {
      const [alertRes, summaryRes] = await Promise.all([
        soc.alerts({ ...socFilter, limit: 50 }),
        soc.summary(),
      ]);
      setSocAlerts(alertRes.alerts);
      setSocSummary(summaryRes);
    } catch (e) {
      console.error("SOC load error", e);
    } finally {
      setSocLoading(false);
    }
  }, [socFilter]);

  useEffect(() => {
    loadSocData();
    const interval = setInterval(loadSocData, 10000);
    return () => clearInterval(interval);
  }, [loadSocData]);

  async function handleStatusChange(alertId: string, newStatus: string) {
    try {
      await soc.updateAlert(alertId, { status: newStatus });
      await loadSocData();
      if (selectedAlert?.id === alertId) {
        setSelectedAlert((prev) => prev ? { ...prev, status: newStatus as SOCAlert["status"] } : null);
      }
    } catch (e) {
      console.error("Update error", e);
    }
  }

  /* ── Refresh all ───────────────────────────────────────────────── */

  function handleManualRefresh() {
    refreshStats();
    refreshTelemetry();
    refreshTasks();
    loadSocData();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          eyebrow="Security Operations Center"
          title="SOC Dashboard"
          description="Real-time multi-agent threat triage, MITRE ATT&CK mapping, six-layer inspection verdicts, and message governance."
        />
        <div className="flex items-center gap-2">
          <Link href="/dashboard/simulation">
            <Button variant="secondary" size="sm" className="gap-1.5 font-mono text-[12px]">
              <FlaskConical size={13} />
              Run Simulation
            </Button>
          </Link>
          <Link href="/dashboard/demo">
            <Button variant="primary" size="sm" className="gap-1.5 font-mono text-[12px]">
              <Flame size={13} />
              Attack Demo
            </Button>
          </Link>
        </div>
      </div>

      {/* Hero Verdict Ratio & KPI Centerpiece with Click Events */}
      <div className="material-panel rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-5 border-b border-hairline">
          <div>
            <div className="eyebrow mb-1">Live Interception Verdicts</div>
            <div className="text-[28px] font-bold tracking-tight text-ink-primary font-mono flex items-baseline gap-3">
              <span>{totalDecisions}</span>
              <span className="text-[13px] font-sans font-medium text-ink-muted">
                Total Evaluated Tasks
              </span>
            </div>
          </div>

          {/* Verdict Hero Metric Cards with Click-to-Filter */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setFeedFilter(feedFilter === "allow" ? "all" : "allow")}
              className={`px-4 py-3 rounded-xl border flex flex-col min-w-[120px] text-left transition-all cursor-pointer ${
                feedFilter === "allow"
                  ? "border-allow bg-allow/15 ring-2 ring-allow/30 shadow-card"
                  : "border-allow/30 bg-allow/5 hover:bg-allow/10"
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-allow font-semibold uppercase">
                <span>Allow</span>
                <span>{allowPct}%</span>
              </div>
              <div className="text-[24px] font-bold font-mono text-allow mt-0.5">
                {allowCount}
              </div>
            </button>

            <button
              onClick={() => setFeedFilter(feedFilter === "block" ? "all" : "block")}
              className={`px-4 py-3 rounded-xl border flex flex-col min-w-[120px] text-left transition-all cursor-pointer ${
                feedFilter === "block"
                  ? "border-block bg-block/15 ring-2 ring-block/30 shadow-card"
                  : "border-block/30 bg-block/5 hover:bg-block/10"
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-block font-semibold uppercase">
                <span>Block</span>
                <span>{blockPct}%</span>
              </div>
              <div className="text-[24px] font-bold font-mono text-block mt-0.5">
                {blockCount}
              </div>
            </button>

            <button
              onClick={() => setFeedFilter(feedFilter === "review" ? "all" : "review")}
              className={`px-4 py-3 rounded-xl border flex flex-col min-w-[120px] text-left transition-all cursor-pointer ${
                feedFilter === "review"
                  ? "border-review bg-review/15 ring-2 ring-review/30 shadow-card"
                  : "border-review/30 bg-review/5 hover:bg-review/10"
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-review font-semibold uppercase">
                <span>Review</span>
                <span>{reviewPct}%</span>
              </div>
              <div className="text-[24px] font-bold font-mono text-review mt-0.5">
                {reviewCount}
              </div>
            </button>
          </div>
        </div>

        {/* Live Ratio Bar */}
        <div className="pt-4">
          <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-surface-sunken border border-hairline">
            <div
              style={{ width: `${allowPct}%` }}
              className="bg-allow transition-all duration-500"
              title={`Allow: ${allowPct}%`}
            />
            <div
              style={{ width: `${reviewPct}%` }}
              className="bg-review transition-all duration-500"
              title={`Review: ${reviewPct}%`}
            />
            <div
              style={{ width: `${blockPct}%` }}
              className="bg-block transition-all duration-500"
              title={`Block: ${blockPct}%`}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-ink-muted mt-2">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-allow" /> Allowed ({allowCount})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-review" /> In Review ({reviewCount})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-block" /> Blocked ({blockCount})
            </span>
          </div>
        </div>
      </div>

      {/* ── SOC Alert Triage ─────────────────────────────────────────── */}
      <div className="material-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Siren size={16} className="text-red-400" />
              <span className="eyebrow">SOC Alert Queue</span>
              {socSummary && socSummary.p1_open > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-red-400 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30 animate-pulse">
                  {socSummary.p1_open} P1 OPEN
                </span>
              )}
            </div>
            <p className="text-[12px] text-ink-muted mt-0.5">
              Security Operations — alert triage, MITRE ATT&CK mapping, real-time monitoring
            </p>
          </div>
          <Button onClick={loadSocData} variant="secondary" size="sm" className="gap-1.5 font-mono text-[11px]">
            <RefreshCw size={12} />
            Refresh
          </Button>
        </div>

        {/* SOC Summary Cards */}
        {socSummary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-xl border border-hairline bg-surface-elevated p-4">
              <div className="text-2xl font-bold font-mono text-ink-primary">{socSummary.total}</div>
              <div className="text-[11px] text-ink-muted font-mono">Total Alerts</div>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
              <div className="text-2xl font-bold font-mono text-red-400">{socSummary.p1_open}</div>
              <div className="text-[11px] text-red-400/70 font-mono">P1 Open</div>
            </div>
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
              <div className="text-2xl font-bold font-mono text-blue-400">{socSummary.new}</div>
              <div className="text-[11px] text-blue-400/70 font-mono">New / Unacked</div>
            </div>
            {(["P2", "P3"] as const).map((sev) => (
              <div key={sev} className="rounded-xl border border-hairline bg-surface-elevated p-4">
                <div className="text-2xl font-bold font-mono text-ink-primary">{socSummary.by_severity[sev] ?? 0}</div>
                <div className="text-[11px] text-ink-muted font-mono">{sev} Alerts</div>
              </div>
            ))}
          </div>
        )}

        {/* SOC Filters */}
        <div className="flex gap-2 flex-wrap">
          {["All", "P1", "P2", "P3", "P4"].map((sev) => (
            <button
              key={sev}
              onClick={() => setSocFilter((f) => ({ ...f, severity: sev === "All" ? undefined : sev }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                (sev === "All" && !socFilter.severity) || socFilter.severity === sev
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "bg-surface-elevated text-ink-muted border-hairline hover:border-hairline-strong"
              }`}
            >
              {sev}
            </button>
          ))}
          <div className="w-px bg-hairline mx-1" />
          {["All", "new", "acknowledged", "investigating", "resolved"].map((st) => (
            <button
              key={st}
              onClick={() => setSocFilter((f) => ({ ...f, status: st === "All" ? undefined : st }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                (st === "All" && !socFilter.status) || socFilter.status === st
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "bg-surface-elevated text-ink-muted border-hairline hover:border-hairline-strong"
              }`}
            >
              {st === "All" ? "All Status" : st.charAt(0).toUpperCase() + st.slice(1)}
            </button>
          ))}
        </div>

        {/* SOC Alert Table + Detail Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Alert List */}
          <div className="lg:col-span-2 rounded-xl border border-hairline bg-surface overflow-hidden">
            {socLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
              </div>
            ) : socAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-ink-muted">
                <CheckCircle2 size={28} className="mb-2 text-allow" />
                <div className="text-sm font-medium">No alerts matching filters</div>
                <div className="text-xs text-ink-muted mt-1">All clear — no security incidents to triage</div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface-elevated/50">
                    <th className="px-4 py-2.5 text-left font-medium text-ink-muted text-xs">Severity</th>
                    <th className="px-4 py-2.5 text-left font-medium text-ink-muted text-xs">Title</th>
                    <th className="px-4 py-2.5 text-left font-medium text-ink-muted text-xs">MITRE</th>
                    <th className="px-4 py-2.5 text-left font-medium text-ink-muted text-xs">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium text-ink-muted text-xs">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {socAlerts.map((alert) => (
                    <tr
                      key={alert.id}
                      onClick={() => setSelectedAlert(alert)}
                      className={`border-b border-hairline/50 cursor-pointer transition-colors hover:bg-surface-elevated/50 ${
                        selectedAlert?.id === alert.id ? "bg-accent/5" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${SEV_COLORS[alert.severity] ?? ""}`}>
                          {alert.severity}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-ink-primary font-medium truncate max-w-[200px]">
                        {alert.title}
                      </td>
                      <td className="px-4 py-2.5">
                        {alert.mitre_technique ? (
                          <span className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 text-xs font-mono">
                            {alert.mitre_technique}
                          </span>
                        ) : (
                          <span className="text-ink-muted text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[alert.status] ?? ""}`}>
                          {alert.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-ink-muted text-xs font-mono">
                        {alert.created_at ? new Date(alert.created_at).toLocaleTimeString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Detail Panel */}
          <div className="rounded-xl border border-hairline bg-surface p-4">
            {selectedAlert ? (
              <div className="space-y-4">
                <div>
                  <span className={`px-2 py-1 rounded text-xs font-bold border ${SEV_COLORS[selectedAlert.severity] ?? ""}`}>
                    {selectedAlert.severity}
                  </span>
                  <h3 className="text-lg font-bold text-ink-primary mt-2">{selectedAlert.title}</h3>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Status</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selectedAlert.status] ?? ""}`}>
                      {selectedAlert.status}
                    </span>
                  </div>
                  {selectedAlert.mitre_technique && (
                    <div className="flex justify-between">
                      <span className="text-ink-muted">MITRE ATT&CK</span>
                      <span className="text-violet-400 font-mono text-xs">{selectedAlert.mitre_technique}</span>
                    </div>
                  )}
                  {selectedAlert.assigned_analyst && (
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Analyst</span>
                      <span className="text-ink-primary">{selectedAlert.assigned_analyst}</span>
                    </div>
                  )}
                  {selectedAlert.chain_hash && (
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Chain Hash</span>
                      <span className="text-ink-primary font-mono text-xs">{selectedAlert.chain_hash.slice(0, 16)}…</span>
                    </div>
                  )}
                  {selectedAlert.task_id && (
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Task</span>
                      <span className="text-ink-primary font-mono text-xs">{selectedAlert.task_id.slice(0, 8)}…</span>
                    </div>
                  )}
                </div>

                {selectedAlert.description && (
                  <div className="rounded-lg bg-surface-elevated p-3 text-xs text-ink-muted">
                    {selectedAlert.description}
                  </div>
                )}

                {/* Triage Actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-hairline">
                  {selectedAlert.status === "new" && (
                    <button
                      onClick={() => handleStatusChange(selectedAlert.id, "acknowledged")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
                    >
                      Acknowledge
                    </button>
                  )}
                  {["new", "acknowledged"].includes(selectedAlert.status) && (
                    <button
                      onClick={() => handleStatusChange(selectedAlert.id, "investigating")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                    >
                      Investigate
                    </button>
                  )}
                  {selectedAlert.status !== "resolved" && (
                    <button
                      onClick={() => handleStatusChange(selectedAlert.id, "resolved")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                    >
                      Resolve
                    </button>
                  )}
                  {selectedAlert.status !== "false_positive" && selectedAlert.status !== "resolved" && (
                    <button
                      onClick={() => handleStatusChange(selectedAlert.id, "false_positive")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 hover:bg-zinc-500/20 transition-colors"
                    >
                      False Positive
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-ink-muted">
                <Siren size={24} className="mb-2 text-ink-muted/50" />
                <div className="text-sm font-medium">Select an alert to triage</div>
                <div className="text-xs text-ink-muted mt-1">Click any row to view details & take action</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Signature Inspection Visualizer */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="eyebrow">Signature Inspection Engine</div>
          <span className="text-[11px] font-mono text-ink-muted">Live Pipeline Interception</span>
        </div>
        <MessageJourneyPipeline
          task={recentTasks?.[0]}
          decision={recentTasks?.[0]?.decision ?? "allow"}
          riskScore={recentTasks?.[0]?.risk_score ?? 0}
          violatingLayer={recentTasks?.[0]?.violating_layer ?? recentTasks?.[0]?.decision_reason ?? undefined}
          totalLatencyMs={recentTasks?.[0]?.total_latency_ms ?? statsData?.avg_latency_ms ?? 14}
          groqCalled={recentTasks?.[0]?.groq_called ?? true}
          intentDriftScore={0.12}
        />
      </div>

      {/* Operational Latency & Telemetry Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="eyebrow">Avg Latency</span>
            <Clock size={14} className="text-info" />
          </div>
          <div className="text-[22px] font-bold font-mono text-ink-primary">
            {statsData?.avg_latency_ms ?? 0}<span className="text-[13px] font-normal text-ink-muted">ms</span>
          </div>
          <p className="text-[11px] text-ink-muted mt-1">End-to-end 6-layer pipeline</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="eyebrow">Groq Guard Calls</span>
            <Zap size={14} className="text-review" />
          </div>
          <div className="text-[22px] font-bold font-mono text-ink-primary">
            {statsData?.groq_calls_today ?? 0}
          </div>
          <p className="text-[11px] text-ink-muted mt-1">Semantic intent & injection guards</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="eyebrow">Identity Checks</span>
            <KeyRound size={14} className="text-allow" />
          </div>
          <div className="text-[22px] font-bold font-mono text-allow">
            {telemetryData?.total_events ? telemetryData.total_events - (telemetryData.identity_failures ?? 0) : 0}
          </div>
          <p className="text-[11px] text-ink-muted mt-1">Ed25519 cryptographic signatures</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="eyebrow">Scope Violations</span>
            <ShieldAlert size={14} className={telemetryData?.scope_violations ? "text-block" : "text-allow"} />
          </div>
          <div className={`text-[22px] font-bold font-mono ${telemetryData?.scope_violations ? "text-block" : "text-allow"}`}>
            {telemetryData?.scope_violations ?? 0}
          </div>
          <p className="text-[11px] text-ink-muted mt-1">Caveat amplification attempts</p>
        </Card>
      </div>

      {/* Enhanced Live Decision Feed with Controls & Click Diagnostics */}
      <div className="material-panel rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-hairline">
          <div>
            <div className="flex items-center gap-2">
              <span className="eyebrow">Live Interception Feed</span>
              {!isFeedPaused && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-allow px-1.5 py-0.5 rounded bg-allow/10 border border-allow/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-allow animate-pulse" />
                  STREAMING
                </span>
              )}
              {tasksLoading && recentTasks && (
                <Loader2 size={13} className="text-accent animate-spin" />
              )}
            </div>
            <h3 className="text-[15px] font-semibold text-ink-primary mt-0.5">
              Recent Interceptions & Decisions
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Pills */}
            <div className="flex rounded-lg border border-hairline bg-surface p-0.5">
              {["all", "block", "review", "allow"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFeedFilter(f)}
                  className={`px-2.5 py-1 text-[11px] font-mono font-semibold uppercase rounded-md transition-all ${
                    feedFilter === f
                      ? "bg-surface-elevated text-ink-primary shadow-sm"
                      : "text-ink-muted hover:text-ink-primary"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Pause/Resume Toggle */}
            <Button
              onClick={() => setIsFeedPaused(!isFeedPaused)}
              variant="secondary"
              size="sm"
              className="font-mono text-[11.5px] gap-1 px-2.5"
            >
              {isFeedPaused ? <Play size={12} className="text-allow" /> : <Pause size={12} className="text-warning" />}
              {isFeedPaused ? "Resume" : "Pause"}
            </Button>

            {/* Manual Refresh */}
            <Button
              onClick={handleManualRefresh}
              variant="secondary"
              size="sm"
              className="p-2"
              aria-label="Refresh"
            >
              <RefreshCw size={13} className="text-ink-muted hover:text-ink-primary" />
            </Button>
          </div>
        </div>

        {tasksLoading && !recentTasks ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="p-3.5 rounded-lg border border-hairline bg-surface flex items-center justify-between gap-4 shimmer-effect"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-4 w-4 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredTasks.length > 0 ? (
          <div className="space-y-2">
            {filteredTasks.map((t) => {
              const isExpanded = expandedTaskId === t.id;
              return (
                <div
                  key={t.id}
                  className="rounded-xl border border-hairline bg-surface hover:border-hairline-strong transition-all overflow-hidden"
                >
                  <div
                    onClick={() => setExpandedTaskId(isExpanded ? null : t.id)}
                    className="flex items-center justify-between p-3.5 cursor-pointer text-[13px] hover:bg-surface-elevated/40"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant={decisionVariant(t.decision)}>{t.decision}</Badge>
                      <span className="font-mono text-[12.5px] text-ink-primary font-semibold">
                        {t.task_type}
                      </span>
                      <span className="font-mono text-[11px] text-ink-muted hidden sm:inline">
                        ID: {t.id.slice(0, 8)}...
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-ink-muted font-mono text-[11px]">
                      <span>Risk: {t.risk_score.toFixed(2)}</span>
                      <span>{t.total_latency_ms ?? 12}ms</span>
                      <span className="text-ink-muted text-[10px] hidden sm:inline">
                        {new Date(t.created_at).toLocaleTimeString([], { timeZone: 'UTC' })} UTC
                      </span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${isExpanded ? "rotate-180 text-ink-primary" : ""}`}
                      />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 border-t border-hairline bg-surface-elevated/70 space-y-3">
                      <MessageJourneyPipeline
                        task={t}
                        decision={t.decision}
                        riskScore={t.risk_score}
                        violatingLayer={t.violating_layer ?? t.decision_reason ?? undefined}
                        totalLatencyMs={t.total_latency_ms ?? undefined}
                        groqCalled={t.groq_called}
                        animated={false}
                        className="bg-surface-sunken p-4"
                      />
                      <div className="flex items-center justify-between pt-2 border-t border-hairline text-[11.5px] font-mono">
                        <span className="text-ink-muted">
                          Created at: {new Date(t.created_at).toLocaleString([], { timeZone: 'UTC' })} UTC
                        </span>
                        {t.trace_id && (
                          <Link
                            href={`/dashboard/traces/${t.trace_id}`}
                            className="text-accent hover:underline flex items-center gap-1"
                          >
                            Open Distributed Trace ({t.trace_id.slice(0, 8)}...) <ExternalLink size={11} />
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Activity size={20} />}
            title="No intercepted traffic matches filter"
            description="Try changing the filter or trigger traffic in the Attack Demo or Simulation."
          />
        )}
      </div>
    </div>
  );
}
