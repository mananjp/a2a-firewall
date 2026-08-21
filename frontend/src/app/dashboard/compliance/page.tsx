"use client";

import { useEffect, useState, useCallback } from "react";
import { compliance } from "@/lib/api";
import type { ComplianceFramework, ComplianceRule, ComplianceReport } from "@/lib/types";

const FRAMEWORK_LABELS: Record<string, { name: string; flag: string }> = {
  RBI: { name: "Reserve Bank of India", flag: "🇮🇳" },
  DPDP: { name: "Digital Personal Data Protection", flag: "🇮🇳" },
  HIPAA: { name: "Health Insurance Portability", flag: "🇺🇸" },
  "PCI-DSS": { name: "Payment Card Industry", flag: "💳" },
  GDPR: { name: "General Data Protection Reg.", flag: "🇪🇺" },
  CCPA: { name: "California Consumer Privacy", flag: "🇺🇸" },
};

export default function CompliancePage() {
  const [available, setAvailable] = useState<Record<string, { rules_count: number; rule_names: string[] }>>({});
  const [installed, setInstalled] = useState<ComplianceFramework[]>([]);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [avail, inst, rls] = await Promise.all([
        compliance.frameworks(),
        compliance.installed(),
        compliance.rules(),
      ]);
      setAvailable(avail.frameworks);
      setInstalled(inst);
      setRules(rls);
    } catch (e) {
      console.error("Compliance load error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleApply(framework: string) {
    setActionLoading(framework);
    try {
      await compliance.apply(framework);
      await loadData();
    } catch (e) {
      console.error("Apply error", e);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRemove(framework: string) {
    setActionLoading(framework);
    try {
      await compliance.remove(framework);
      await loadData();
    } catch (e) {
      console.error("Remove error", e);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReport(framework: string) {
    setSelectedFramework(framework);
    try {
      const r = await compliance.report(framework);
      setReport(r);
    } catch (e) {
      console.error("Report error", e);
    }
  }

  const installedNames = new Set(installed.map((i) => i.framework));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink-primary">Regulatory Compliance</h1>
        <p className="text-sm text-ink-muted mt-1">
          Pre-built policy rule packs for RBI, DPDP, HIPAA, PCI-DSS, GDPR, and CCPA
        </p>
      </div>

      {/* Framework Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(available).map(([framework, info]) => {
          const isInstalled = installedNames.has(framework);
          const meta = FRAMEWORK_LABELS[framework] || { name: framework, flag: "📋" };
          return (
            <div
              key={framework}
              className={`rounded-xl border p-5 transition-all ${
                isInstalled
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-hairline bg-surface hover:border-hairline-strong"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{meta.flag}</span>
                    <span className="text-base font-bold text-ink-primary">{framework}</span>
                  </div>
                  <div className="text-xs text-ink-muted mt-0.5">{meta.name}</div>
                </div>
                {isInstalled && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                    Active
                  </span>
                )}
              </div>

              <div className="text-xs text-ink-muted mb-3">
                {info.rules_count} policy rule{info.rules_count !== 1 ? "s" : ""}
              </div>

              <div className="space-y-1 mb-4 max-h-[100px] overflow-y-auto">
                {info.rule_names.map((name) => (
                  <div key={name} className="text-xs text-ink-muted bg-surface-elevated rounded px-2 py-1 truncate">
                    {name}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                {isInstalled ? (
                  <>
                    <button
                      onClick={() => handleRemove(framework)}
                      disabled={actionLoading === framework}
                      className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      {actionLoading === framework ? "Removing…" : "Remove"}
                    </button>
                    <button
                      onClick={() => handleReport(framework)}
                      className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
                    >
                      Report
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleApply(framework)}
                    disabled={actionLoading === framework}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === framework ? "Installing…" : "Install Pack"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Compliance Report */}
      {report && (
        <div className="rounded-xl border border-hairline bg-surface p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink-primary">
              {report.framework} Compliance Report
            </h2>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                report.compliance_status === "compliant"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-red-500/15 text-red-400"
              }`}
            >
              {report.compliance_status === "compliant" ? "✓ Compliant" : "⚠ Violations Found"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-surface-elevated p-3 text-center">
              <div className="text-xl font-bold text-ink-primary">{report.summary.total_framework_violations}</div>
              <div className="text-xs text-ink-muted">Framework Violations</div>
            </div>
            <div className="rounded-lg bg-surface-elevated p-3 text-center">
              <div className="text-xl font-bold text-ink-primary">{report.summary.total_all_violations}</div>
              <div className="text-xs text-ink-muted">Total Violations</div>
            </div>
            <div className="rounded-lg bg-surface-elevated p-3 text-center">
              <div className="text-xl font-bold text-ink-primary">{report.summary.total_soc_alerts}</div>
              <div className="text-xs text-ink-muted">SOC Alerts</div>
            </div>
          </div>

          {Object.keys(report.violations_by_type).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-ink-primary mb-2">Violations by Type</h3>
              <div className="space-y-1">
                {Object.entries(report.violations_by_type).map(([type, count]) => (
                  <div key={type} className="flex justify-between items-center text-xs">
                    <span className="text-ink-muted">{type.replace(/_/g, " ")}</span>
                    <span className="font-mono text-ink-primary">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(report.violations_by_severity).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-ink-primary mb-2">By Severity</h3>
              <div className="flex gap-3">
                {Object.entries(report.violations_by_severity).map(([sev, count]) => (
                  <div key={sev} className="rounded-lg bg-surface-elevated px-3 py-2 text-center">
                    <div className="text-sm font-bold text-ink-primary">{count}</div>
                    <div className="text-xs text-ink-muted capitalize">{sev}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Installed Rules */}
      {rules.length > 0 && (
        <div className="rounded-xl border border-hairline bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-hairline bg-surface-elevated/50">
            <h2 className="text-sm font-bold text-ink-primary">
              Active Compliance Rules ({rules.length})
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-elevated/30">
                <th className="px-4 py-2 text-left font-medium text-ink-muted text-xs">Framework</th>
                <th className="px-4 py-2 text-left font-medium text-ink-muted text-xs">Rule</th>
                <th className="px-4 py-2 text-left font-medium text-ink-muted text-xs">Action</th>
                <th className="px-4 py-2 text-left font-medium text-ink-muted text-xs">Priority</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-hairline/50">
                  <td className="px-4 py-2">
                    <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-xs font-medium">
                      {rule.framework_tag}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-ink-primary text-xs">{rule.name}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        rule.action === "block"
                          ? "bg-red-500/10 text-red-400"
                          : "bg-yellow-500/10 text-yellow-400"
                      }`}
                    >
                      {rule.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-ink-muted text-xs font-mono">{rule.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
