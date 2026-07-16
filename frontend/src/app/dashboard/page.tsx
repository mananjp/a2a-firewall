"use client";

import { useCallback } from "react";
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
import { EmptyState } from "@/components/ui/empty-state";
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
} from "lucide-react";
import { motion } from "framer-motion";

export default function DashboardPage() {
  const { data: violationsData } = usePolling<Violation[]>(
    useCallback((_signal) => violations.list(undefined) as Promise<Violation[]>, []), 5000
  );

  const { data: statsData } = usePolling<StatsOverview>(
    useCallback((_signal) => stats.overview(), []), 5000
  );

  const { data: telemetryData } = usePolling<TelemetrySummary>(
    useCallback((_signal) => telemetry.summary(), []), 10000
  );

  const { data: recentTasks } = usePolling<RecentTask[]>(
    useCallback((_signal) => tasks.recent(10), []), 3000
  );

  const { data: wsSettings } = usePolling<Workspace>(
    useCallback((_signal) => workspaces.me(), []), 30000
  );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Agent traffic overview, live decisions, and workspace configuration."
      />

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Tasks" value={statsData?.total_tasks ?? 0} icon={<BarChart3 size={16} />} accent="blue" />
        <StatCard label="Blocked" value={statsData?.blocked ?? 0} icon={<Ban size={16} />} accent="danger" subtitle={statsData ? `${statsData.blocked_pct}%` : undefined} />
        <StatCard label="Groq Calls" value={statsData?.groq_calls_today ?? 0} icon={<Zap size={16} />} accent="warning" />
        <StatCard label="Avg Latency" value={statsData?.avg_latency_ms ?? 0} icon={<Clock size={16} />} accent="green" suffix="ms" />
      </div>

      {/* Telemetry + Violation summary row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Violations" value={violationsData?.length ?? 0} icon={<ShieldAlert size={16} />} accent="danger" />
        <StatCard label="Telemetry Events" value={telemetryData?.total_events ?? 0} icon={<Activity size={16} />} accent="blue" />
        <StatCard label="Identity Failures" value={telemetryData?.identity_failures ?? 0} icon={<KeyRound size={16} />} accent={telemetryData?.identity_failures ? "danger" : "green"} />
        <StatCard label="Scope Violations" value={telemetryData?.scope_violations ?? 0} icon={<ScanSearch size={16} />} accent={telemetryData?.scope_violations ? "warning" : "green"} />
      </div>

      {/* Events breakdown + Workspace config */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {telemetryData && (
          <>
            <Card>
              <div className="mb-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Events by Type</div>
              <div className="space-y-1.5">
                {Object.entries(telemetryData.events_by_type).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">{type}</span>
                    <span className="font-mono text-xs text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <div className="mb-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Events by Decision</div>
              <div className="space-y-1.5">
                {Object.entries(telemetryData.events_by_decision).map(([d, count]) => (
                  <div key={d} className="flex items-center justify-between">
                    <Badge variant={decisionVariant(d)}>{d}</Badge>
                    <span className="font-mono text-xs text-foreground">{count}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1.5 border-t border-border mt-1.5">
                  <span className="text-xs text-muted-foreground">Avg Risk Score</span>
                  <span className="font-mono text-xs">{telemetryData.avg_risk_score.toFixed(3)}</span>
                </div>
              </div>
            </Card>
          </>
        )}
        <WorkspaceConfigCard ws={wsSettings} />
      </div>

      {/* Live Feed of recent tasks */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Live Decision Feed</span>
          <Link href="/dashboard/telemetry" className="text-xs text-accent hover:underline inline-flex items-center gap-1">
            View all <ArrowRight size={11} />
          </Link>
        </div>
        {recentTasks && recentTasks.length > 0 ? (
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Task Type</th>
                  <th className="px-4 py-2.5 font-medium">Decision</th>
                  <th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="px-4 py-2.5 font-medium">Latency</th>
                  <th className="px-4 py-2.5 font-medium">Groq</th>
                  <th className="px-4 py-2.5 font-medium">Trace</th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.map((t) => (
                  <tr key={t.id} className="border-t border-border/50 transition-colors hover:bg-surface-elevated/50">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(t.created_at).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{t.task_type}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={decisionVariant(t.decision)}>{t.decision}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{t.risk_score.toFixed(2)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">{t.total_latency_ms ?? "-"}ms</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {t.groq_called ? (
                        t.groq_injection_detected
                          ? <Badge variant="danger">Injected</Badge>
                          : <Badge variant="success">Clean</Badge>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      {t.trace_id ? (
                        <Link href={`/dashboard/traces/${t.trace_id}`} className="text-xs font-mono text-accent hover:underline inline-flex items-center gap-0.5">
                          {t.trace_id.slice(0, 8)} <ExternalLink size={9} />
                        </Link>
                      ) : <span className="text-xs text-muted">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <EmptyState
            icon={<Activity size={24} />}
            title="No traffic yet"
            description="Run a simulation or demo to see live decisions."
            action={
              <div className="flex gap-2">
                <Link href="/dashboard/simulation">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-elevated px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-surface-elevated/80">
                    <FlaskConical size={13} /> Simulation
                  </span>
                </Link>
                <Link href="/dashboard/demo">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-elevated px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-surface-elevated/80">
                    <Flame size={13} /> Live Demo
                  </span>
                </Link>
              </div>
            }
          />
        )}
      </div>

      {/* Recent violations */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Recent Violations</span>
          <Link href="/dashboard/violations" className="text-xs text-accent hover:underline inline-flex items-center gap-1">
            View all <ArrowRight size={11} />
          </Link>
        </div>
        {violationsData && violationsData.length > 0 ? (
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Severity</th>
                  <th className="px-4 py-2.5 font-medium">Layer</th>
                  <th className="px-4 py-2.5 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {violationsData.slice(0, 10).map((v) => (
                  <tr key={v.id} className="border-t border-border/50 transition-colors hover:bg-surface-elevated/50">
                    <td className="px-4 py-2.5 font-mono text-xs">{v.violation_type}</td>
                    <td className="px-4 py-2.5"><Badge variant={severityVariant(v.severity)}>{v.severity}</Badge></td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{v.layer}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <EmptyState icon={<ShieldAlert size={24} />} title="No violations" description="Run traffic to see violations here." />
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { href: "/dashboard/simulation", icon: <FlaskConical size={18} />, label: "Bank Agent Simulation", desc: "Multi-step bank scenarios through the real pipeline" },
          { href: "/dashboard/demo", icon: <Flame size={18} />, label: "Live Attack Demo", desc: "Clean, injection, and review scenarios with layer detail" },
          { href: "/dashboard/agents", icon: <Bot size={18} />, label: "Agent Registry", desc: "Manage identities, capabilities, and permissions" },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card hover className="h-full">
              <div className="mb-2 text-muted">{item.icon}</div>
              <div className="text-sm font-medium">{item.label}</div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, accent, subtitle, suffix }: {
  label: string; value: number; icon: React.ReactNode;
  accent: "blue" | "green" | "danger" | "warning"; subtitle?: string; suffix?: string;
}) {
  const accentMap = { blue: "text-accent", green: "text-success", danger: "text-danger", warning: "text-warning" };
  const borderMap = { blue: "border-accent/20", green: "border-success/20", danger: "border-danger/20", warning: "border-warning/20" };
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={`border ${borderMap[accent]}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
          <span className={accentMap[accent]}>{icon}</span>
        </div>
        <div className={`text-2xl font-semibold font-mono tabular-nums ${accentMap[accent]}`}>
          {value}{suffix && <span className="text-xs font-normal text-muted-foreground ml-1">{suffix}</span>}
        </div>
        {subtitle && <div className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</div>}
      </Card>
    </motion.div>
  );
}

function WorkspaceConfigCard({ ws }: { ws: Workspace | null }) {
  if (!ws) return null;
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Settings2 size={13} /> Workspace Config
        </span>
        <Link href="/dashboard/workspace" className="text-xs text-accent hover:underline">Edit</Link>
      </div>
      <div className="space-y-1.5">
        <ConfigRow label="Fail Mode" value={ws.fail_mode} accent={ws.fail_mode === "closed" ? "danger" : "success"} />
        <ConfigRow label="Default Deny" value={ws.default_deny ? "Enabled" : "Disabled"} accent={ws.default_deny ? "danger" : "success"} />
        <ConfigRow label="Groq Threshold" value={String(ws.groq_threshold)} accent="warning" />
        <ConfigRow label="Block Threshold" value={String(ws.block_threshold)} accent="danger" />
      </div>
    </Card>
  );
}

function ConfigRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  const c = accent === "danger" ? "text-danger" : accent === "warning" ? "text-warning" : "text-success";
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${c}`}>{value}</span>
    </div>
  );
}
