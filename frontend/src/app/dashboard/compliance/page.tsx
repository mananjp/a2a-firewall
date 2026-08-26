"use client";

import { useEffect, useState, useCallback } from "react";
import { compliance, complianceExtended } from "@/lib/api";
import type { ComplianceFramework, ComplianceRule, ComplianceReport } from "@/lib/types";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ScrollText,
  ShieldCheck,
  ShieldAlert,
  Download,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  Sparkles,
} from "lucide-react";

const FRAMEWORK_LABELS: Record<string, { name: string; flag: string; desc: string }> = {
  RBI: { name: "Reserve Bank of India", flag: "🇮🇳", desc: "Cyber security controls, PAN/Card masking & fraud detection." },
  DPDP: { name: "Digital Personal Data Protection", flag: "🇮🇳", desc: "Aadhaar, email, and phone privacy protections." },
  HIPAA: { name: "Health Insurance Portability", flag: "🇺🇸", desc: "Medical records, ICD-10 and SSN health privacy." },
  "PCI-DSS": { name: "Payment Card Industry DSS", flag: "💳", desc: "Cardholder data protection and IBAN transmission controls." },
  GDPR: { name: "General Data Protection Reg.", flag: "🇪🇺", desc: "EU data privacy, personal identifiability and consent controls." },
  CCPA: { name: "California Consumer Privacy", flag: "🇺🇸", desc: "California consumer data safeguards and PII controls." },
};

export default function CompliancePage() {
  const [available, setAvailable] = useState<Record<string, { rules_count: number; rule_names: string[] }>>({});
  const [installed, setInstalled] = useState<ComplianceFramework[]>([]);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [posture, setPosture] = useState<any>(null);
  const [timeline, setTimeline] = useState<Array<{ date: string; blocked: number; critical: number }>>([]);
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [avail, inst, rls, post, time] = await Promise.all([
        compliance.frameworks(),
        compliance.installed(),
        compliance.rules(),
        complianceExtended.posture().catch(() => null),
        complianceExtended.timeline(14).catch(() => []),
      ]);
      setAvailable(avail.frameworks);
      setInstalled(inst);
      setRules(rls);
      setPosture(post);
      setTimeline(time);
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

  async function handleDownloadEvidenceBundle(framework: string) {
    try {
      const bundle = await complianceExtended.exportBundle(framework);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Compliance_Evidence_Bundle_${framework}.json`;
      a.click();
    } catch (e) {
      alert("Failed to export compliance evidence bundle");
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
    <div className="space-y-6">
      <Header
        title="Continuous Compliance &amp; Regulatory Observability"
        description="Automate regulatory framework guardrails, real-time posture scoring (RBI, DPDP, HIPAA, PCI-DSS, GDPR, CCPA), and one-click evidence bundle generation."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownloadEvidenceBundle("RBI")}
            className="flex items-center gap-1.5 font-mono text-xs"
          >
            <Download size={14} /> Export RBI Audit Package
          </Button>
        }
      />

      {/* Top Posture Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="material-base">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted">Overall Posture Index</span>
              <ShieldCheck size={16} className="text-emerald-400" />
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold font-mono text-emerald-400">
                {posture?.overall_compliance_score || 100}%
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Passing {installed.length} active regulatory rule packs.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="material-base">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted">Active Compliance Rules</span>
              <Layers size={16} className="text-accent" />
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold font-mono text-ink-primary">
                {rules.length}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Pre-configured zero-trust policy predicates.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="material-base">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted">Automated Evidence Generation</span>
              <Sparkles size={16} className="text-indigo-400" />
            </div>
            <div className="mt-3">
              <div className="text-sm font-semibold text-ink-primary">
                Audit-Ready JSON / CSV Exports
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Cryptographically bound traces and lineage chains for external regulators.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Framework Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(available).map(([framework, info]) => {
          const isInstalled = installedNames.has(framework);
          const meta = FRAMEWORK_LABELS[framework] || { name: framework, flag: "🌐", desc: "" };
          const fwPosture = posture?.frameworks?.[framework];
          const isLoading = actionLoading === framework;

          return (
            <Card
              key={framework}
              className={`material-base border transition-all ${
                isInstalled
                  ? "border-accent/40 bg-accent/5 shadow-sm"
                  : "border-hairline hover:border-hairline-strong"
              }`}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{meta.flag}</span>
                    <div>
                      <h3 className="text-sm font-bold text-ink-primary">{framework}</h3>
                      <p className="text-[11px] text-ink-muted">{meta.name}</p>
                    </div>
                  </div>
                  {isInstalled ? (
                    <Badge variant="success" className="text-[10px] uppercase font-mono">
                      {fwPosture ? `${fwPosture.score}% PASS` : "ACTIVE"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">
                      AVAILABLE
                    </Badge>
                  )}
                </div>

                <p className="text-xs text-ink-muted leading-relaxed min-h-[32px]">
                  {meta.desc}
                </p>

                <div className="flex items-center justify-between text-xs text-ink-muted font-mono pt-2 border-t border-hairline">
                  <span>{info.rules_count} Guardrail Rules</span>
                  {isInstalled && (
                    <span className="text-emerald-400 font-semibold">
                      {fwPosture ? `${fwPosture.controls_passing}/${fwPosture.controls_total} Controls` : "0 Violations"}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  {isInstalled ? (
                    <>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleReport(framework)}
                        className="flex-1"
                      >
                        Inspect Report
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleDownloadEvidenceBundle(framework)}
                        className="text-xs"
                      >
                        <Download size={12} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={isLoading}
                        onClick={() => handleRemove(framework)}
                        className="text-xs text-rose-400 hover:bg-rose-500/10"
                      >
                        Remove
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="default"
                      size="xs"
                      disabled={isLoading}
                      onClick={() => handleApply(framework)}
                      className="w-full"
                    >
                      {isLoading ? "Installing..." : "Install Framework Pack"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Compliance Report Modal/Section */}
      {report && selectedFramework && (
        <Card className="material-base p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-hairline pb-3">
            <div className="flex items-center gap-2">
              <ScrollText size={18} className="text-accent" />
              <h2 className="text-base font-bold text-ink-primary">
                {selectedFramework} Compliance Audit Report
              </h2>
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={() => handleDownloadEvidenceBundle(selectedFramework)}
              className="flex items-center gap-1.5"
            >
              <Download size={13} />
              <span>Download Evidence Package</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl bg-surface-elevated p-4 text-center border border-hairline">
              <div className="text-2xl font-bold font-mono text-ink-primary">
                {report.summary.total_framework_violations}
              </div>
              <div className="text-xs text-ink-muted">Framework Violations Blocked</div>
            </div>
            <div className="rounded-xl bg-surface-elevated p-4 text-center border border-hairline">
              <div className="text-2xl font-bold font-mono text-emerald-400 capitalize">
                {report.compliance_status}
              </div>
              <div className="text-xs text-ink-muted">Compliance Status</div>
            </div>
            <div className="rounded-xl bg-surface-elevated p-4 text-center border border-hairline">
              <div className="text-2xl font-bold font-mono text-ink-primary">
                {report.summary.total_soc_alerts}
              </div>
              <div className="text-xs text-ink-muted">Correlated SOC Alerts</div>
            </div>
          </div>
        </Card>
      )}

      {/* Active Rules List */}
      {rules.length > 0 && (
        <Card className="material-base overflow-hidden">
          <CardHeader className="border-b border-hairline pb-4 bg-surface-elevated/40">
            <CardTitle className="text-base font-semibold text-ink-primary flex items-center justify-between">
              <span>Installed Compliance Guardrails ({rules.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-surface-elevated/20 text-ink-muted font-medium">
                    <th className="py-3 px-4">Framework</th>
                    <th className="py-3 px-4">Guardrail Name</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline font-mono text-[11px]">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-surface-elevated/30 transition-colors">
                      <td className="py-2.5 px-4">
                        <Badge variant="outline" className="text-[10px] text-accent border-accent/30">
                          {rule.framework_tag}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 font-sans font-semibold text-ink-primary text-xs">
                        {rule.name}
                      </td>
                      <td className="py-2.5 px-4">
                        <Badge variant={rule.action === "block" ? "destructive" : "warning"}>
                          {rule.action.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-ink-muted">#{rule.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
