"use client";

import { useState, useCallback } from "react";
import { usePolling } from "@/hooks/use-polling";
import { retention } from "@/lib/api";
import type { DataRetentionPolicyItem, RetentionCandidates } from "@/lib/types";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database,
  ShieldCheck,
  Trash2,
  Lock,
  Clock,
  Sparkles,
  AlertTriangle,
  HardDrive,
  FileCheck,
  Play,
  RotateCw,
} from "lucide-react";

export default function RetentionPage() {
  const [taskPayloadDays, setTaskPayloadDays] = useState<number>(30);
  const [telemetryDays, setTelemetryDays] = useState<number>(90);
  const [violationsDays, setViolationsDays] = useState<number>(180);
  const [socAlertsDays, setSocAlertsDays] = useState<number>(180);
  const [auditLogDays, setAuditLogDays] = useState<number>(365);
  const [scrubPiiDays, setScrubPiiDays] = useState<number>(14);
  const [autoPurge, setAutoPurge] = useState<boolean>(false);

  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<any>(null);

  const {
    data: policyData,
    loading: policyLoading,
    refresh: refreshPolicy,
  } = usePolling<{
    workspace_id: string;
    policy: DataRetentionPolicyItem;
    minimum_compliance_floors: Record<string, number>;
    retention_candidates: RetentionCandidates;
  }>(
    useCallback(async (_signal) => {
      const res = await retention.getPolicy();
      setTaskPayloadDays(res.policy.task_payload_days);
      setTelemetryDays(res.policy.telemetry_days);
      setViolationsDays(res.policy.violations_days);
      setSocAlertsDays(res.policy.soc_alerts_days);
      setAuditLogDays(res.policy.audit_log_days);
      setScrubPiiDays(res.policy.scrub_pii_after_days);
      setAutoPurge(res.policy.auto_purge_enabled);
      return res;
    }, []),
    10000
  );

  const { data: statsData, refresh: refreshStats } = usePolling<{
    workspace_id: string;
    total_records: number;
    table_counts: Record<string, number>;
  }>(
    useCallback((_signal) => retention.stats(), []),
    10000
  );

  async function handleSavePolicy() {
    setSaving(true);
    try {
      await retention.updatePolicy({
        task_payload_days: taskPayloadDays,
        telemetry_days: telemetryDays,
        violations_days: violationsDays,
        soc_alerts_days: socAlertsDays,
        audit_log_days: auditLogDays,
        scrub_pii_after_days: scrubPiiDays,
        auto_purge_enabled: autoPurge,
      });
      refreshPolicy();
      alert("Data retention policy updated successfully!");
    } catch (err: any) {
      alert(err.message || "Failed to update retention policy");
    } finally {
      setSaving(false);
    }
  }

  async function handleExecutePurge(dryRun: boolean) {
    if (!dryRun && !confirm("Are you sure you want to permanently prune expired records?")) {
      return;
    }
    setPurging(true);
    try {
      const res = await retention.purge(dryRun);
      setPurgeResult(res);
      refreshPolicy();
      refreshStats();
    } catch (err: any) {
      alert(err.message || "Failed to execute purge");
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="space-y-6">
      <Header
        title="Custom Data Retention &amp; Privacy Controls"
        description="Configure automated data aging, PII sanitization schedules, and storage pruning while maintaining regulatory compliance floors."
        action={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExecutePurge(true)}
              disabled={purging}
              className="flex items-center gap-1.5"
            >
              <RotateCw size={14} className={purging ? "animate-spin" : ""} />
              <span>Dry Run Purge</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSavePolicy}
              disabled={saving}
              className="flex items-center gap-1.5"
            >
              <ShieldCheck size={14} />
              <span>{saving ? "Saving..." : "Save Retention Policy"}</span>
            </Button>
          </div>
        }
      />

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="material-base">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted">Total Managed Records</span>
              <HardDrive size={16} className="text-accent" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono text-ink-primary">
                {statsData?.total_records.toLocaleString() || "0"}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Across tasks, telemetry, violations, and SOC alerts.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="material-base">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted">Eligible for Purge</span>
              <Trash2 size={16} className="text-amber-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono text-amber-400">
                {policyData?.retention_candidates.total_records_eligible.toLocaleString() || "0"}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Records past configured retention thresholds.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="material-base">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted">Compliance Protection Floor</span>
              <Lock size={16} className="text-emerald-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono text-emerald-400">365 Days</div>
              <p className="mt-1 text-xs text-ink-muted">
                Audit logs are cryptographically locked for 1-yr compliance floor.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Retention Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="material-base">
            <CardHeader className="border-b border-hairline pb-4">
              <CardTitle className="text-base font-semibold text-ink-primary flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-accent" />
                  <span>Data Lifecycle Retention Windows</span>
                </div>
                <Badge variant={autoPurge ? "success" : "outline"} className="text-[10px] uppercase font-mono">
                  {autoPurge ? "Auto-Purge Active" : "Manual Purge"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Task Payloads */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-primary">Task Inspection Payloads</span>
                  <span className="font-mono text-accent font-bold">{taskPayloadDays} Days</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="365"
                  value={taskPayloadDays}
                  onChange={(e) => setTaskPayloadDays(parseInt(e.target.value))}
                  className="w-full accent-accent cursor-pointer"
                />
                <p className="text-[11px] text-ink-muted">
                  Raw input task arguments and request payloads are pruned after this window.
                </p>
              </div>

              {/* Automated PII Scrubbing */}
              <div className="space-y-2 pt-4 border-t border-hairline">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-primary flex items-center gap-1.5">
                    <Sparkles size={14} className="text-amber-400" />
                    Automated PII Payload Sanitization
                  </span>
                  <span className="font-mono text-amber-400 font-bold">{scrubPiiDays} Days</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="90"
                  value={scrubPiiDays}
                  onChange={(e) => setScrubPiiDays(parseInt(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <p className="text-[11px] text-ink-muted">
                  Redacts credit cards, Aadhaar, PAN, SSN, and emails in stored task records before full pruning.
                </p>
              </div>

              {/* Telemetry Events */}
              <div className="space-y-2 pt-4 border-t border-hairline">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-primary">Telemetry &amp; Trace Events</span>
                  <span className="font-mono text-accent font-bold">{telemetryDays} Days</span>
                </div>
                <input
                  type="range"
                  min="7"
                  max="365"
                  value={telemetryDays}
                  onChange={(e) => setTelemetryDays(parseInt(e.target.value))}
                  className="w-full accent-accent cursor-pointer"
                />
              </div>

              {/* Violations & SOC Alerts */}
              <div className="space-y-2 pt-4 border-t border-hairline">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-primary">Violations &amp; SOC Security Alerts</span>
                  <span className="font-mono text-accent font-bold">{violationsDays} Days</span>
                </div>
                <input
                  type="range"
                  min="90"
                  max="730"
                  value={violationsDays}
                  onChange={(e) => setViolationsDays(parseInt(e.target.value))}
                  className="w-full accent-accent cursor-pointer"
                />
                <p className="text-[11px] text-ink-muted">
                  Minimum compliance floor: 90 days (enforced by banking &amp; privacy regulations).
                </p>
              </div>

              {/* Enterprise Audit Logs */}
              <div className="space-y-2 pt-4 border-t border-hairline">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-primary flex items-center gap-1.5">
                    <Lock size={13} className="text-emerald-400" />
                    Enterprise Audit Logs Retention
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">{auditLogDays} Days</span>
                </div>
                <input
                  type="range"
                  min="365"
                  max="1825"
                  value={auditLogDays}
                  onChange={(e) => setAuditLogDays(parseInt(e.target.value))}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
                <p className="text-[11px] text-ink-muted">
                  SOC2 / RBI Minimum Floor: 365 days (1 Year). Cannot be set below 365 days.
                </p>
              </div>

              {/* Auto Purge Toggle */}
              <div className="pt-4 border-t border-hairline flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-ink-primary block">
                    Automatic Scheduled Daily Purge
                  </span>
                  <span className="text-[11px] text-ink-muted">
                    Automatically prune expired records daily at 00:00 UTC.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={autoPurge}
                  onChange={(e) => setAutoPurge(e.target.checked)}
                  className="h-4 w-4 rounded border-hairline accent-accent"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Execution & Storage breakdown */}
        <div className="space-y-6">
          <Card className="material-base">
            <CardHeader className="border-b border-hairline pb-4">
              <CardTitle className="text-base font-semibold text-ink-primary flex items-center gap-2">
                <Database size={18} className="text-accent" />
                <span>Storage Volume Breakdown</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3 text-xs font-mono">
              <div className="flex justify-between py-1.5 border-b border-hairline">
                <span className="text-ink-muted">Tasks Table</span>
                <span className="font-bold text-ink-primary">
                  {statsData?.table_counts?.tasks || 0}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-hairline">
                <span className="text-ink-muted">Telemetry Events</span>
                <span className="font-bold text-ink-primary">
                  {statsData?.table_counts?.telemetry_events || 0}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-hairline">
                <span className="text-ink-muted">Violations</span>
                <span className="font-bold text-ink-primary">
                  {statsData?.table_counts?.violations || 0}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-hairline">
                <span className="text-ink-muted">SOC Alerts</span>
                <span className="font-bold text-ink-primary">
                  {statsData?.table_counts?.soc_alerts || 0}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-ink-muted">Audit Logs</span>
                <span className="font-bold text-ink-primary">
                  {statsData?.table_counts?.audit_logs || 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="material-base">
            <CardHeader className="border-b border-hairline pb-4">
              <CardTitle className="text-base font-semibold text-ink-primary flex items-center gap-2">
                <Play size={18} className="text-amber-400" />
                <span>Manual Purge Operations</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <p className="text-xs text-ink-muted leading-relaxed">
                Execute an immediate data purge to clean up records older than configured retention cutoffs.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExecutePurge(true)}
                  disabled={purging}
                  className="w-full"
                >
                  Run Dry-Run Preview
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleExecutePurge(false)}
                  disabled={purging}
                  className="w-full flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={14} />
                  <span>Execute Permanent Purge</span>
                </Button>
              </div>

              {purgeResult && (
                <div className="p-3 rounded-xl bg-surface-elevated border border-hairline text-xs font-mono space-y-1 mt-2">
                  <div className="font-bold text-ink-primary">
                    {purgeResult.dry_run ? "Dry-Run Results:" : "Purge Completed:"}
                  </div>
                  <div>Records Purged: {purgeResult.purged_records || 0}</div>
                  {purgeResult.breakdown && (
                    <div className="text-[10px] text-ink-muted">
                      Tasks: {purgeResult.breakdown.tasks_purged}, Telemetry:{" "}
                      {purgeResult.breakdown.telemetry_purged}, Violations:{" "}
                      {purgeResult.breakdown.violations_purged}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
