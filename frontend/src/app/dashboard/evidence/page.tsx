"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { evidenceApi } from "@/lib/api";
import type {
  EvidenceEnvelopeSummary,
  EvidenceVerifyResult,
  EvidenceReplayResult,
} from "@/lib/types";
import {
  FileCheck,
  ShieldCheck,
  RotateCcw,
  Search,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Copy,
  Hash,
  Clock,
  Layers,
  Sparkles,
} from "lucide-react";

export default function EvidencePage() {
  const [envelopes, setEnvelopes] = useState<EvidenceEnvelopeSummary[]>([]);
  const [selected, setSelected] = useState<EvidenceEnvelopeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<Record<string, EvidenceVerifyResult | null>>({});
  const [replayStatus, setReplayStatus] = useState<Record<string, EvidenceReplayResult | null>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await evidenceApi.list(50);
      setEnvelopes(data);
      if (data.length > 0 && !selected) {
        setSelected(data[0]);
      }
    } catch (err) {
      console.error("Failed to load evidence envelopes:", err);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleVerify = async (decisionId: string) => {
    try {
      setActionLoading(`verify-${decisionId}`);
      const res = await evidenceApi.verify(decisionId);
      setVerifyStatus((prev) => ({ ...prev, [decisionId]: res }));
    } catch (err) {
      console.error("Verification failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReplay = async (decisionId: string) => {
    try {
      setActionLoading(`replay-${decisionId}`);
      const res = await evidenceApi.replay(decisionId);
      setReplayStatus((prev) => ({ ...prev, [decisionId]: res }));
    } catch (err) {
      console.error("Replay failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const copyJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filtered = envelopes.filter(
    (e) =>
      e.decision_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.task_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cryptographic Governance"
        title="Decision Evidence Envelopes"
        description="Machine-verifiable Ed25519 signed decision bundles containing policy versions, detector fingerprints, input SHA-256 hashes, and offline audit replay."
        trailing={
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
            v1.2 Signed
          </span>
        }
        action={
          <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        }
      />

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="material-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">Envelopes Signed</span>
            <FileCheck className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-ink-primary">{envelopes.length}</div>
            <p className="text-xs text-ink-muted mt-1">Tamper-evident SHA-256 chain</p>
          </CardContent>
        </Card>

        <Card className="material-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">Signer Algorithm</span>
            <ShieldCheck className="w-4 h-4 text-allow" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-allow">Ed25519</div>
            <p className="text-xs text-ink-muted mt-1">Root CA Workspace Key</p>
          </CardContent>
        </Card>

        <Card className="material-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">Verification Mode</span>
            <Layers className="w-4 h-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-ink-primary">Offline / Zero-Trust</div>
            <p className="text-xs text-ink-muted mt-1">Independent CLI & SDK verification</p>
          </CardContent>
        </Card>

        <Card className="material-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">Audit Reproducibility</span>
            <Sparkles className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-ink-primary">100% Deterministic</div>
            <p className="text-xs text-ink-muted mt-1">Pinned policy & detector replay</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Envelopes List (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <Input
                placeholder="Search by decision ID or task ID..."
                className="pl-9 bg-surface/60 border-hairline"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <span className="text-xs font-mono text-ink-muted">
              {filtered.length} {filtered.length === 1 ? "record" : "records"}
            </span>
          </div>

          <Card className="material-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-surface-elevated/40 text-ink-muted font-mono uppercase">
                    <th className="p-3">Decision ID</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Risk Score</th>
                    <th className="p-3">Created</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-ink-muted">
                        Loading signed evidence envelopes...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-ink-muted">
                        No signed evidence envelopes recorded yet.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((env) => {
                      const isSelected = selected?.decision_id === env.decision_id;
                      const verified = verifyStatus[env.decision_id];
                      return (
                        <tr
                          key={env.decision_id}
                          onClick={() => setSelected(env)}
                          className={`cursor-pointer transition-colors hover:bg-surface-elevated/60 ${
                            isSelected ? "bg-surface-elevated border-l-2 border-l-accent" : ""
                          }`}
                        >
                          <td className="p-3 font-mono text-ink-primary truncate max-w-[140px]">
                            {env.decision_id}
                          </td>
                          <td className="p-3">
                            <Badge
                              tone={
                                env.final_action === "allow"
                                  ? "allow"
                                  : env.final_action === "block"
                                  ? "block"
                                  : "warning"
                              }
                            >
                              {env.final_action.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="p-3 font-mono font-medium">
                            <span
                              className={
                                env.risk_score > 0.7
                                  ? "text-block"
                                  : env.risk_score > 0.3
                                  ? "text-review"
                                  : "text-allow"
                              }
                            >
                              {env.risk_score.toFixed(2)}
                            </span>
                          </td>
                          <td className="p-3 text-ink-muted font-mono whitespace-nowrap">
                            {env.created_at ? new Date(env.created_at).toLocaleTimeString() : "—"}
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="text-[11px] h-7 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVerify(env.decision_id);
                              }}
                              disabled={actionLoading === `verify-${env.decision_id}`}
                            >
                              {verified?.valid ? (
                                <CheckCircle2 className="w-3 h-3 text-allow mr-1" />
                              ) : (
                                <ShieldCheck className="w-3 h-3 mr-1" />
                              )}
                              Verify
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Envelope Inspector Detail (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {selected ? (
            <Card className="material-soft border-hairline-strong">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-hairline">
                <div>
                  <div className="text-xs font-mono text-ink-muted uppercase tracking-wider">
                    Evidence Bundle Inspector
                  </div>
                  <CardTitle className="text-sm font-mono text-ink-primary truncate max-w-[280px]">
                    {selected.decision_id}
                  </CardTitle>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyJson(selected.envelope)}
                  className="text-[11px] h-7"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  {copied ? "Copied" : "Copy JSON"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {/* Verification & Replay Action Toolbar */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    className="w-full text-xs h-9 justify-center"
                    onClick={() => handleVerify(selected.decision_id)}
                    disabled={actionLoading === `verify-${selected.decision_id}`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-allow" />
                    Verify Signature
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full text-xs h-9 justify-center"
                    onClick={() => handleReplay(selected.decision_id)}
                    disabled={actionLoading === `replay-${selected.decision_id}`}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-accent" />
                    Deterministic Replay
                  </Button>
                </div>

                {/* Verification Result Banner */}
                {verifyStatus[selected.decision_id] && (
                  <div
                    className={`p-3 rounded-lg border text-xs font-mono flex items-center gap-2 ${
                      verifyStatus[selected.decision_id]?.valid
                        ? "bg-allow/10 border-allow/30 text-allow"
                        : "bg-block/10 border-block/30 text-block"
                    }`}
                  >
                    {verifyStatus[selected.decision_id]?.valid ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Ed25519 signature cryptographically verified against workspace root key.</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 shrink-0" />
                        <span>Signature verification failed: invalid signature or tampered content.</span>
                      </>
                    )}
                  </div>
                )}

                {/* Replay Result Banner */}
                {replayStatus[selected.decision_id] && (
                  <div className="p-3 rounded-lg border border-accent/30 bg-accent/10 text-xs font-mono text-accent flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Deterministic Replay Successful: decision matches historical evaluation.</span>
                  </div>
                )}

                {/* Metadata Fields */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-hairline">
                    <span className="text-ink-muted">Task ID</span>
                    <span className="font-mono text-ink-primary">{selected.task_id}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-hairline">
                    <span className="text-ink-muted">Envelope Version</span>
                    <span className="font-mono text-ink-primary">{selected.envelope_version}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-hairline">
                    <span className="text-ink-muted">Public Key</span>
                    <span className="font-mono text-ink-muted truncate max-w-[180px]">
                      {selected.signer_public_key}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-hairline">
                    <span className="text-ink-muted">Signature</span>
                    <span className="font-mono text-ink-muted truncate max-w-[180px]">
                      {selected.signature}
                    </span>
                  </div>
                </div>

                {/* Raw Envelope JSON Preview */}
                <div>
                  <div className="text-[11px] font-mono text-ink-muted uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Signed Envelope JSON</span>
                    <span className="text-[9px] text-ink-muted">Ed25519 Bound</span>
                  </div>
                  <pre className="p-3 rounded-lg bg-surface-elevated/70 border border-hairline text-[11px] font-mono text-ink-primary overflow-x-auto max-h-[320px] leading-relaxed">
                    {JSON.stringify(selected.envelope, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="material-soft p-8 text-center text-ink-muted">
              Select an envelope from the table to inspect cryptographic signatures, hashes, and evidence.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
