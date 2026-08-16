"use client";

import { useState, useCallback } from "react";
import { telemetry } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { TelemetryEvent, TelemetrySummary } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge, decisionVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, StatsGridSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { MessageJourneyPipeline } from "@/components/pipeline/message-journey-pipeline";
import {
  Activity,
  KeyRound,
  ScanSearch,
  Filter,
  Clock,
  ShieldCheck,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const EVENT_TYPES = ["all", "firewall.inspection", "identity.verification", "delegation.scope_check"];
const DECISIONS = ["all", "allow", "block", "review"];

export default function TelemetryPage() {
  const [eventType, setEventType] = useState<string | undefined>(undefined);
  const [decision, setDecision] = useState<string | undefined>(undefined);
  const [limit, setLimit] = useState(50);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

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
    4000
  );

  const { data: summary } = usePolling<TelemetrySummary>(
    useCallback((_signal) => telemetry.summary(), []),
    8000
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Live Traffic Lineage"
        title="Live Telemetry & Inspection Stream"
        description="Full structured telemetry emitted from multi-agent hops — correlated with open telemetry tracing and fraud engines."
      />

      {/* Summary KPI Cards */}
      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Total Stream Events" value={summary.total_events} accent="blue" />
          <SummaryCard label="Avg Pipeline Risk" value={summary.avg_risk_score.toFixed(3)} accent="warning" />
          <SummaryCard
            label="Identity Failures"
            value={summary.identity_failures}
            accent={summary.identity_failures ? "danger" : "green"}
            icon={<KeyRound size={14} />}
          />
          <SummaryCard
            label="Scope Violations"
            value={summary.scope_violations}
            accent={summary.scope_violations ? "warning" : "green"}
            icon={<ScanSearch size={14} />}
          />
        </div>
      ) : (
        <StatsGridSkeleton count={4} />
      )}

      {/* Filter Toolbar */}
      <div className="flex items-center gap-3 flex-wrap p-3 rounded-xl border border-hairline bg-surface">
        <Filter size={14} className="text-ink-muted shrink-0" />
        <FilterGroup
          label="Event Type"
          items={EVENT_TYPES}
          value={eventType}
          onChange={(v) => setEventType(v === "all" ? undefined : v)}
          labelOf={(t) => (t === "all" ? "All Types" : t.split(".").pop() ?? t)}
        />
        <FilterGroup
          label="Verdict"
          items={DECISIONS}
          value={decision}
          onChange={(v) => setDecision(v === "all" ? undefined : v)}
          labelOf={(d) => (d === "all" ? "All Verdicts" : d.toUpperCase())}
        />
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="ml-auto rounded-lg border border-hairline bg-surface-elevated px-3 py-1 text-[12px] font-mono text-ink-primary focus:outline-none focus:border-accent"
          aria-label="Limit"
        >
          <option value={25}>25 events</option>
          <option value={50}>50 events</option>
          <option value={100}>100 events</option>
        </select>
      </div>

      {/* Events table */}
      {loading && !events && <TableSkeleton rows={6} cols={5} />}

      {!loading && events && events.length === 0 && (
        <EmptyState
          icon={<Activity size={24} />}
          title="No telemetry events match filters"
          description="Try resetting filters or generate traffic via the Attack Demo or Simulation."
        />
      )}

      {events && events.length > 0 && (
        <div className="material-panel rounded-xl overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] uppercase tracking-wide text-ink-muted bg-surface-elevated/40">
                <th className="px-4 py-3 font-medium">Event Type</th>
                <th className="px-4 py-3 font-medium">Verdict</th>
                <th className="px-4 py-3 font-medium">Risk Score</th>
                <th className="px-4 py-3 font-medium">Sender Agent</th>
                <th className="px-4 py-3 font-medium">Receiver Agent</th>
                <th className="px-4 py-3 font-medium">Depth</th>
                <th className="px-4 py-3 font-medium">Signature</th>
                <th className="px-4 py-3 font-medium">Latency</th>
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {events.map((evt) => {
                const isExpanded = expandedEventId === evt.event_id;
                const d = evt.decision ?? "allow";
                return (
                  <tr
                    key={evt.event_id}
                    onClick={() => setExpandedEventId(isExpanded ? null : evt.event_id)}
                    className={`border-t border-hairline/60 cursor-pointer transition-colors duration-120 hover:bg-surface-elevated ${
                      isExpanded ? "bg-surface-elevated" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-[12px] text-ink-primary font-medium">
                      {evt.event_type}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={decisionVariant(d)}>{d}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-ink-primary font-semibold">
                      {evt.risk_score.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-muted max-w-[120px] truncate">
                      {evt.sender_agent_id ?? "n/a"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-muted max-w-[120px] truncate">
                      {evt.receiver_agent_id ?? "n/a"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-muted tabular-nums">
                      hop {evt.delegation_depth}
                    </td>
                    <td className="px-4 py-3">
                      {evt.signature_valid === false ? (
                        <Badge variant="block">Invalid</Badge>
                      ) : (
                        <span className="text-allow text-[11px] font-mono flex items-center gap-1">
                          <ShieldCheck size={12} /> Valid
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-muted tabular-nums">
                      {evt.latency_ms}ms
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-ink-muted">
                      {new Date(evt.created_at).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronDown
                        size={14}
                        className={`text-ink-muted transition-transform duration-150 ${
                          isExpanded ? "rotate-180 text-ink-primary" : ""
                        }`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  items,
  value,
  onChange,
  labelOf,
}: {
  label?: string;
  items: readonly string[];
  value: string | undefined;
  onChange: (v: string) => void;
  labelOf: (s: string) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-[11px] font-medium text-ink-muted">{label}:</span>}
      <div className="flex gap-1 rounded-lg border border-hairline bg-surface-elevated p-1">
        {items.map((it) => {
          const active = (it === "all" && !value) || it === value;
          return (
            <button
              key={it}
              onClick={() => onChange(it)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                active
                  ? "bg-surface text-ink-primary border border-hairline-strong shadow-sm"
                  : "text-ink-muted hover:text-ink-primary border border-transparent"
              }`}
            >
              {labelOf(it)}
            </button>
          );
        })}
      </div>
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
  const accentColorMap = {
    blue: "text-info",
    green: "text-allow",
    danger: "text-block",
    warning: "text-review",
  };

  return (
    <div className="material-panel rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="eyebrow">{label}</span>
        {icon && <span className={accentColorMap[accent]}>{icon}</span>}
      </div>
      <div className={`text-[24px] font-bold font-mono tabular-nums tracking-tight ${accentColorMap[accent]}`}>
        {value}
      </div>
    </div>
  );
}
