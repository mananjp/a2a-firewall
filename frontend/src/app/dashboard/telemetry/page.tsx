"use client";

import { useState, useCallback } from "react";
import { telemetry } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { TelemetryEvent, TelemetrySummary } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge, decisionVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Activity, KeyRound, ScanSearch, Filter } from "lucide-react";

const EVENT_TYPES = ["all", "firewall.inspection", "identity.verification", "delegation.scope_check"];
const DECISIONS = ["all", "allow", "block", "review"];

export default function TelemetryPage() {
  const [eventType, setEventType] = useState<string | undefined>(undefined);
  const [decision, setDecision] = useState<string | undefined>(undefined);
  const [limit, setLimit] = useState(50);

  const { data: events, loading } = usePolling<TelemetryEvent[]>(
    useCallback(
      (_signal) =>
        telemetry.events({
          event_type: eventType,
          decision,
          limit,
        }),
      [eventType, decision, limit]
    ),
    5000
  );

  const { data: summary } = usePolling<TelemetrySummary>(
    useCallback((_signal) => telemetry.summary(), []),
    10000
  );

  return (
    <div>
      <PageHeader
        title="Telemetry Events"
        description="Structured telemetry events from agent traffic - correlated with fraud detection."
      />

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <SummaryCard
            label="Total Events"
            value={summary.total_events}
            accent="blue"
          />
          <SummaryCard
            label="Avg Risk Score"
            value={summary.avg_risk_score.toFixed(3)}
            accent="warning"
          />
          <SummaryCard
            label="Identity Failures"
            value={summary.identity_failures}
            accent="danger"
            icon={<KeyRound size={14} />}
          />
          <SummaryCard
            label="Scope Violations"
            value={summary.scope_violations}
            accent="warning"
            icon={<ScanSearch size={14} />}
          />
        </div>
      )}

      {/* Breakdown */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Card>
            <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Events by Type
            </div>
            <div className="space-y-2">
              {Object.entries(summary.events_by_type).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{type}</span>
                  <span className="font-mono text-xs text-foreground">{count}</span>
                </div>
              ))}
              {Object.keys(summary.events_by_type).length === 0 && (
                <div className="text-xs text-muted py-2">No events yet</div>
              )}
            </div>
          </Card>
          <Card>
            <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Events by Decision
            </div>
            <div className="space-y-2">
              {Object.entries(summary.events_by_decision).map(([d, count]) => (
                <div key={d} className="flex items-center justify-between text-sm">
                  <Badge variant={decisionVariant(d)}>{d}</Badge>
                  <span className="font-mono text-xs text-foreground">{count}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Filter size={14} className="text-muted-foreground" />
        <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
          {EVENT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setEventType(t === "all" ? undefined : t)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                (t === "all" && !eventType) || t === eventType
                  ? "bg-surface-elevated text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "all" ? "All Types" : t.split(".").pop()}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
          {DECISIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDecision(d === "all" ? undefined : d)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                (d === "all" && !decision) || d === decision
                  ? "bg-surface-elevated text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d === "all" ? "All Decisions" : d}
            </button>
          ))}
        </div>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground"
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>

      {/* Events table */}
      {loading && !events && (
        <Card className="text-sm text-muted">Loading...</Card>
      )}
      {events && events.length === 0 && (
        <EmptyState
          icon={<Activity size={24} />}
          title="No telemetry events"
          description="Run a simulation or demo to generate structured telemetry events."
        />
      )}
      {events && events.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Event</th>
                <th className="px-4 py-2.5 font-medium">Decision</th>
                <th className="px-4 py-2.5 font-medium">Risk</th>
                <th className="px-4 py-2.5 font-medium">Sender</th>
                <th className="px-4 py-2.5 font-medium">Receiver</th>
                <th className="px-4 py-2.5 font-medium">Deleg.</th>
                <th className="px-4 py-2.5 font-medium">Signature</th>
                <th className="px-4 py-2.5 font-medium">Latency</th>
                <th className="px-4 py-2.5 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {events.map((evt) => (
                <tr
                  key={evt.event_id}
                  className="border-t border-border/50 transition-colors hover:bg-surface-elevated/50"
                >
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {evt.event_type}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={decisionVariant(evt.decision ?? "allow")}>
                      {evt.decision ?? "n/a"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {evt.risk_score.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground max-w-[100px] truncate">
                    {evt.sender_agent_id ?? "n/a"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground max-w-[100px] truncate">
                    {evt.receiver_agent_id ?? "n/a"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {evt.delegation_depth}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {evt.signature_valid === false ? (
                      <Badge variant="danger">Invalid</Badge>
                    ) : (
                      <span className="text-success">Valid</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">
                    {evt.latency_ms}ms
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {new Date(evt.created_at).toLocaleString()}
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

function SummaryCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: number | string;
  accent: "blue" | "green" | "danger" | "warning";
  icon?: React.ReactNode;
}) {
  const accentMap = {
    blue: "text-accent",
    green: "text-success",
    danger: "text-danger",
    warning: "text-warning",
  };
  const borderMap = {
    blue: "border-accent/20",
    green: "border-success/20",
    danger: "border-danger/20",
    warning: "border-warning/20",
  };

  return (
    <Card className={`border ${borderMap[accent]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        {icon && <span className={accentMap[accent]}>{icon}</span>}
      </div>
      <div className={`text-xl font-semibold font-mono tabular-nums ${accentMap[accent]}`}>
        {value}
      </div>
    </Card>
  );
}
