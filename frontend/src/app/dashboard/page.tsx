"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { violations, telemetry, stats, workspaces, tasks } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type {
  Violation,
  TelemetrySummary,
  StatsOverview,
  Workspace,
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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function DashboardPage() {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [isFeedPaused, setIsFeedPaused] = useState(false);
  const [feedFilter, setFeedFilter] = useState<string>("all");
  const [selectedTaskForDrawer, setSelectedTaskForDrawer] = useState<RecentTask | null>(null);

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

  function handleManualRefresh() {
    refreshStats();
    refreshTelemetry();
    refreshTasks();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          eyebrow="Operations Mesh"
          title="Security Command Center"
          description="Real-time multi-agent message governance, six-layer inspection verdicts, and delegation enforcement."
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

      {/* Signature Inspection Visualizer */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="eyebrow">Signature Inspection Engine</div>
          <span className="text-[11px] font-mono text-ink-muted">Live Pipeline Interception</span>
        </div>
        <MessageJourneyPipeline
          decision={recentTasks?.[0]?.decision ?? "allow"}
          totalLatencyMs={statsData?.avg_latency_ms ?? 14}
          groqCalled={true}
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
                        {new Date(t.created_at).toLocaleTimeString()}
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
                        decision={t.decision}
                        riskScore={t.risk_score}
                        totalLatencyMs={t.total_latency_ms ?? undefined}
                        groqCalled={t.groq_called}
                        animated={false}
                        className="bg-surface-sunken p-4"
                      />
                      <div className="flex items-center justify-between pt-2 border-t border-hairline text-[11.5px] font-mono">
                        <span className="text-ink-muted">
                          Created at: {new Date(t.created_at).toLocaleString()}
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
