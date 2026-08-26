"use client";

import { useState, useCallback } from "react";
import { audit, demo, enterpriseAudit } from "@/lib/api";
import type { AuditChainExport, TaskAuditChain } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { EnterpriseAuditLogItem } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  GitFork,
  Download,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  FileCode,
  BrainCircuit,
  Play,
  Loader2,
  Lock,
  ExternalLink,
  Shield,
  Search,
  SlidersHorizontal,
  Eye,
  FileText,
} from "lucide-react";
import { motion } from "framer-motion";

export default function AuditPage() {
  const [activeTab, setActiveTab] = useState<"system" | "delegation">("system");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedLogDiff, setSelectedLogDiff] = useState<EnterpriseAuditLogItem | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  // System audit filters
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const {
    data: systemAuditData,
    loading: systemAuditLoading,
    refresh: refreshSystemAudit,
  } = usePolling<{ workspace_id: string; total: number; count: number; logs: EnterpriseAuditLogItem[] }>(
    useCallback(
      (_signal) =>
        enterpriseAudit.logs({
          search: searchTerm || undefined,
          action: actionFilter || undefined,
          limit: 100,
        }),
      [searchTerm, actionFilter]
    ),
    5000
  );

  const {
    data: chainData,
    loading: chainLoading,
    refresh: refreshChain,
  } = usePolling<AuditChainExport>(
    useCallback((_signal) => audit.listChains(100), []),
    5000
  );

  function handleDownloadDelegationCsv() {
    const url = audit.exportCsvUrl(100);
    window.open(url, "_blank");
  }

  function handleDownloadSystemAuditCsv() {
    const url = enterpriseAudit.exportCsvUrl(500);
    window.open(url, "_blank");
  }

  async function handleSeedDemo() {
    if (seeding) return;
    setSeeding(true);
    setSeedError(null);
    try {
      await demo.runDelegation("delegation_clean");
      await refreshChain();
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : "Failed to generate demo chain");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          eyebrow="Compliance & Governance"
          title="Enterprise Audit Logs &amp; Lineage"
          description="Complete immutable audit trail of administrative actions, policy edits, security thresholds, and cryptographic agent delegation hops."
        />
        <div className="flex items-center gap-2">
          {activeTab === "system" ? (
            <Button
              onClick={handleDownloadSystemAuditCsv}
              variant="outline"
              size="sm"
              className="gap-2 font-mono text-[12px]"
            >
              <Download size={13} />
              Export System Audit CSV
            </Button>
          ) : (
            <>
              <Button
                onClick={handleSeedDemo}
                disabled={seeding}
                variant="primary"
                size="sm"
                className="gap-2 font-mono text-[12px]"
              >
                {seeding ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                {seeding ? "Simulating..." : "Generate Demo Chain"}
              </Button>
              <Button
                onClick={handleDownloadDelegationCsv}
                variant="outline"
                size="sm"
                className="gap-2 font-mono text-[12px]"
              >
                <Download size={13} />
                Export Lineage CSV
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-hairline gap-2">
        <button
          onClick={() => setActiveTab("system")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "system"
              ? "border-accent text-accent"
              : "border-transparent text-ink-muted hover:text-ink-primary"
          }`}
        >
          <FileText size={14} />
          <span>Enterprise System Audit Trail ({systemAuditData?.total || 0})</span>
        </button>
        <button
          onClick={() => setActiveTab("delegation")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "delegation"
              ? "border-accent text-accent"
              : "border-transparent text-ink-muted hover:text-ink-primary"
          }`}
        >
          <GitFork size={14} />
          <span>Agent Delegation Chain Trail ({chainData?.count || 0})</span>
        </button>
      </div>

      {/* TAB 1: Enterprise System Audit Log */}
      {activeTab === "system" && (
        <div className="space-y-4">
          {/* Search and Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
              />
              <input
                type="text"
                placeholder="Search audit events, actor emails, descriptions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-surface-elevated border border-hairline rounded-lg pl-9 pr-3 py-2 text-xs text-ink-primary font-sans focus:outline-none focus:border-accent"
              />
            </div>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-xs text-ink-primary font-sans focus:outline-none focus:border-accent"
            >
              <option value="">All Actions</option>
              <option value="spend.workspace_limit_updated">Spend Limits Updated</option>
              <option value="rbac.member_added">Member Added</option>
              <option value="network.ip_allowlist_added">IP Allowlist Modified</option>
              <option value="retention.policy_updated">Retention Policy Updated</option>
              <option value="scim.user_provisioned">SCIM User Provisioned</option>
            </select>
          </div>

          <Card className="material-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-surface-elevated/40 text-ink-muted font-medium">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Target Entity</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">IP Address</th>
                    <th className="py-3 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {systemAuditLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-ink-muted">
                        <TableSkeleton rows={5} />
                      </td>
                    </tr>
                  ) : systemAuditData && systemAuditData.logs.length > 0 ? (
                    systemAuditData.logs.map((log) => (
                      <tr key={log.id} className="hover:bg-surface-elevated/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] text-ink-muted whitespace-nowrap">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : "-"}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-ink-primary font-sans">{log.actor_email}</span>
                            <Badge variant="outline" className="text-[9px] uppercase font-mono">
                              {log.actor_type}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-accent text-[11px] font-medium">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-ink-muted text-[11px]">
                          {log.entity_type} {log.entity_id ? `(#${log.entity_id.slice(0, 8)})` : ""}
                        </td>
                        <td className="py-3 px-4 text-ink-primary max-w-xs truncate">
                          {log.description || "-"}
                        </td>
                        <td className="py-3 px-4 font-mono text-ink-muted text-[11px]">
                          {log.ip_address || "internal"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setSelectedLogDiff(log)}
                            className="text-xs text-accent hover:text-accent font-medium gap-1"
                          >
                            <Eye size={12} /> Diff
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-ink-muted">
                        <div className="flex flex-col items-center gap-2">
                          <ShieldCheck size={28} className="text-emerald-400 opacity-60" />
                          <span className="font-medium text-ink-primary">No Audit Events Logged</span>
                          <p className="text-xs text-ink-muted">
                            Administrative events and governance operations are automatically written to this ledger.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Diff Drawer Modal */}
          {selectedLogDiff && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="material-elevated border border-hairline-strong rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-ink-primary">
                    Audit Event Payload &amp; State Diff
                  </h3>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {selectedLogDiff.action}
                  </Badge>
                </div>
                <div className="text-xs text-ink-muted space-y-1 font-mono">
                  <div>Actor: <span className="text-ink-primary font-semibold">{selectedLogDiff.actor_email}</span></div>
                  <div>Timestamp: {selectedLogDiff.created_at ? new Date(selectedLogDiff.created_at).toISOString() : ""}</div>
                </div>
                <div className="bg-surface rounded-xl p-3 border border-hairline max-h-72 overflow-y-auto">
                  <pre className="text-[11px] font-mono text-ink-primary whitespace-pre-wrap">
                    {JSON.stringify(selectedLogDiff.diff, null, 2)}
                  </pre>
                </div>
                <div className="flex justify-end pt-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedLogDiff(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Agent Delegation Chain Audit */}
      {activeTab === "delegation" && (
        <div className="space-y-6">
          {seedError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[13px] text-destructive flex items-center gap-2">
              <AlertTriangle size={15} />
              {seedError}
            </div>
          )}

          {chainLoading && !chainData && <TableSkeleton rows={5} />}

          {!chainLoading && (!chainData || chainData.events.length === 0) && (
            <EmptyState
              title="No delegation chains recorded yet"
              description="Simulate a multi-hop agent delegation chain to inspect Ed25519 token signatures and cryptographic caveat non-amplification."
            />
          )}

          {chainData && chainData.events.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <Card className="material-base overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-hairline bg-surface-elevated/40 text-ink-muted font-medium font-mono text-[11px]">
                          <th className="py-3 px-4">Depth</th>
                          <th className="py-3 px-4">Sender Agent</th>
                          <th className="py-3 px-4">Receiver Agent</th>
                          <th className="py-3 px-4">Ed25519 Sig</th>
                          <th className="py-3 px-4">Chain Hash</th>
                          <th className="py-3 px-4 text-right">Inspect</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline font-mono text-[11px]">
                        {chainData.events.map((ev, idx) => {
                          const isSelected = selectedTaskId === ev.task_id;
                          return (
                            <tr
                              key={`${ev.task_id}-${idx}`}
                              className={`hover:bg-surface-elevated/30 transition-colors ${
                                isSelected ? "bg-accent/10 border-l-2 border-accent" : ""
                              }`}
                            >
                              <td className="py-3 px-4 font-bold text-accent">
                                Hop #{ev.delegation_depth}
                              </td>
                              <td className="py-3 px-4 font-sans font-semibold text-ink-primary">
                                {ev.sender_name}
                              </td>
                              <td className="py-3 px-4 font-sans text-ink-muted">
                                {ev.receiver_name}
                              </td>
                              <td className="py-3 px-4">
                                {ev.signature_valid ? (
                                  <Badge variant="success" className="gap-1 text-[10px]">
                                    <CheckCircle2 size={11} /> Valid
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="gap-1 text-[10px]">
                                    <XCircle size={11} /> Invalid
                                  </Badge>
                                )}
                              </td>
                              <td className="py-3 px-4 text-ink-muted text-[10px]">
                                {ev.chain_hash ? ev.chain_hash.substring(0, 10) + "..." : "-"}
                              </td>
                              <td className="py-3 px-4 text-right font-sans">
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => setSelectedTaskId(ev.task_id)}
                                >
                                  Details
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              {/* Inspector panel */}
              <div className="space-y-4">
                <Card className="material-base p-5">
                  <h3 className="text-sm font-bold text-ink-primary mb-2 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-400" />
                    <span>Cryptographic Lineage Verifier</span>
                  </h3>
                  <p className="text-xs text-ink-muted leading-relaxed mb-4">
                    Every task hop is verified against the sender agent's registered Ed25519 public key and checked for caveat attenuation.
                  </p>
                  {selectedTaskId ? (
                    <div className="p-3 rounded-xl bg-surface-elevated border border-hairline font-mono text-xs space-y-2">
                      <div className="text-accent font-bold">Task ID Selected:</div>
                      <div className="text-[11px] text-ink-primary truncate">{selectedTaskId}</div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-ink-muted">
                      Select a task hop from the table to inspect caveats and signature proofs.
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
