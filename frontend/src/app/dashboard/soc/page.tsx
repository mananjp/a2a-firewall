"use client";

import { useEffect, useState, useCallback } from "react";
import { soc } from "@/lib/api";
import type { SOCAlert, SOCAlertSummary } from "@/lib/types";

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

export default function SOCDashboardPage() {
  const [alerts, setAlerts] = useState<SOCAlert[]>([]);
  const [summary, setSummary] = useState<SOCAlertSummary | null>(null);
  const [filter, setFilter] = useState<{ severity?: string; status?: string }>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SOCAlert | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [alertRes, summaryRes] = await Promise.all([
        soc.alerts({ ...filter, limit: 100 }),
        soc.summary(),
      ]);
      setAlerts(alertRes.alerts);
      setSummary(summaryRes);
    } catch (e) {
      console.error("SOC load error", e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  async function handleStatusChange(alertId: string, newStatus: string) {
    try {
      await soc.updateAlert(alertId, { status: newStatus });
      await loadData();
      if (selected?.id === alertId) {
        setSelected((prev) => prev ? { ...prev, status: newStatus as SOCAlert["status"] } : null);
      }
    } catch (e) {
      console.error("Update error", e);
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink-primary">SOC Dashboard</h1>
        <p className="text-sm text-ink-muted mt-1">
          Security Operations Center — alert triage, MITRE ATT&CK mapping, real-time monitoring
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl border border-hairline bg-surface-elevated p-4">
            <div className="text-2xl font-bold text-ink-primary">{summary.total}</div>
            <div className="text-xs text-ink-muted">Total Alerts</div>
          </div>
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <div className="text-2xl font-bold text-red-400">{summary.p1_open}</div>
            <div className="text-xs text-red-400/70">P1 Open</div>
          </div>
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
            <div className="text-2xl font-bold text-blue-400">{summary.new}</div>
            <div className="text-xs text-blue-400/70">New / Unacked</div>
          </div>
          {(["P1", "P2", "P3", "P4"] as const).slice(1, 3).map((sev) => (
            <div key={sev} className="rounded-xl border border-hairline bg-surface-elevated p-4">
              <div className="text-2xl font-bold text-ink-primary">{summary.by_severity[sev] ?? 0}</div>
              <div className="text-xs text-ink-muted">{sev} Alerts</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["All", "P1", "P2", "P3", "P4"].map((sev) => (
          <button
            key={sev}
            onClick={() => setFilter((f) => ({ ...f, severity: sev === "All" ? undefined : sev }))}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              (sev === "All" && !filter.severity) || filter.severity === sev
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
            onClick={() => setFilter((f) => ({ ...f, status: st === "All" ? undefined : st }))}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              (st === "All" && !filter.status) || filter.status === st
                ? "bg-accent/15 text-accent border-accent/30"
                : "bg-surface-elevated text-ink-muted border-hairline hover:border-hairline-strong"
            }`}
          >
            {st === "All" ? "All Status" : st.charAt(0).toUpperCase() + st.slice(1)}
          </button>
        ))}
      </div>

      {/* Alert Table + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alert List */}
        <div className="lg:col-span-2 rounded-xl border border-hairline bg-surface overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-ink-muted">
              <div className="text-4xl mb-2">✅</div>
              <div className="text-sm">No alerts matching filters</div>
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
                {alerts.map((alert) => (
                  <tr
                    key={alert.id}
                    onClick={() => setSelected(alert)}
                    className={`border-b border-hairline/50 cursor-pointer transition-colors hover:bg-surface-elevated/50 ${
                      selected?.id === alert.id ? "bg-accent/5" : ""
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
          {selected ? (
            <div className="space-y-4">
              <div>
                <span className={`px-2 py-1 rounded text-xs font-bold border ${SEV_COLORS[selected.severity] ?? ""}`}>
                  {selected.severity}
                </span>
                <h3 className="text-lg font-bold text-ink-primary mt-2">{selected.title}</h3>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Status</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selected.status] ?? ""}`}>
                    {selected.status}
                  </span>
                </div>
                {selected.mitre_technique && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">MITRE ATT&CK</span>
                    <span className="text-violet-400 font-mono text-xs">{selected.mitre_technique}</span>
                  </div>
                )}
                {selected.assigned_analyst && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Analyst</span>
                    <span className="text-ink-primary">{selected.assigned_analyst}</span>
                  </div>
                )}
                {selected.chain_hash && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Chain Hash</span>
                    <span className="text-ink-primary font-mono text-xs">{selected.chain_hash.slice(0, 16)}…</span>
                  </div>
                )}
                {selected.task_id && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Task</span>
                    <span className="text-ink-primary font-mono text-xs">{selected.task_id.slice(0, 8)}…</span>
                  </div>
                )}
              </div>

              {selected.description && (
                <div className="rounded-lg bg-surface-elevated p-3 text-xs text-ink-muted">
                  {selected.description}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-hairline">
                {selected.status === "new" && (
                  <button
                    onClick={() => handleStatusChange(selected.id, "acknowledged")}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
                  >
                    Acknowledge
                  </button>
                )}
                {["new", "acknowledged"].includes(selected.status) && (
                  <button
                    onClick={() => handleStatusChange(selected.id, "investigating")}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                  >
                    Investigate
                  </button>
                )}
                {selected.status !== "resolved" && (
                  <button
                    onClick={() => handleStatusChange(selected.id, "resolved")}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                  >
                    Resolve
                  </button>
                )}
                {selected.status !== "false_positive" && selected.status !== "resolved" && (
                  <button
                    onClick={() => handleStatusChange(selected.id, "false_positive")}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 hover:bg-zinc-500/20 transition-colors"
                  >
                    False Positive
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-ink-muted">
              <div className="text-3xl mb-2">🔍</div>
              <div className="text-sm">Select an alert to view details</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
