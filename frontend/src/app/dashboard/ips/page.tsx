"use client";

import { useEffect, useState, useCallback } from "react";
import { ips } from "@/lib/api";
import type { IPSSignature } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Shield, ShieldAlert, Activity, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

const SEV_BADGE: Record<string, "danger" | "warning" | "info" | "default"> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "default",
};

export default function IPSPage() {
  const { toast } = useToast();
  const [signatures, setSignatures] = useState<IPSSignature[]>([]);
  const [currentMode, setCurrentMode] = useState<string>("block");
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const loadData = useCallback(async () => {
    try {
      const [sigs, modeRes] = await Promise.all([
        ips.signatures(),
        ips.getMode(),
      ]);
      setSignatures(sigs);
      setCurrentMode(modeRes.ips_mode);
    } catch (e) {
      console.error("IPS data load error", e);
      toast({ title: "Failed to load IPS data", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleModeChange(mode: string) {
    setSavingMode(true);
    try {
      await ips.setMode(mode);
      setCurrentMode(mode);
      toast({ title: "IPS Mode updated", description: `Active mode: ${mode}`, variant: "success" });
    } catch (err) {
      toast({ title: "Failed to update IPS mode", description: err instanceof Error ? err.message : "Unknown error", variant: "error" });
    } finally {
      setSavingMode(false);
    }
  }

  const categories = Array.from(new Set(signatures.map((s) => s.category)));

  const filteredSignatures = signatures.filter((s) => {
    const matchesCategory = filterCategory === "all" || s.category === filterCategory;
    const matchesSearch =
      search === "" ||
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase()) ||
      (s.mitre_technique && s.mitre_technique.toLowerCase().includes(search.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const totalHits = signatures.reduce((sum, s) => sum + (s.hit_count || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intrusion Prevention"
        title="IDS / IPS Signatures & Enforcement"
        description="Signature-based pattern matching engine, automated containment policies, and MITRE technique correlation."
      />

      {/* Mode Control & Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="text-accent" size={16} />
              <span className="text-[13px] font-semibold text-ink-primary">IPS Enforcement Mode</span>
            </div>
            <p className="text-[12px] text-ink-muted mb-4">
              Determines how firewall acts upon signature matches and repeat offenders.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "monitor", label: "Monitor (IDS)", desc: "Log matches only" },
              { id: "block", label: "Block", desc: "Drop offending tasks" },
              { id: "block_and_suspend", label: "Auto-Contain", desc: "Block & suspend agent" },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => handleModeChange(m.id)}
                disabled={savingMode}
                className={`p-3 rounded-lg border text-left transition-all ${
                  currentMode === m.id
                    ? "bg-accent/15 border-accent/40 text-accent font-medium shadow-sm"
                    : "bg-surface-elevated border-hairline text-ink-muted hover:border-hairline-strong"
                }`}
              >
                <div className="text-[12px] font-bold">{m.label}</div>
                <div className="text-[10px] opacity-75 mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col justify-center">
          <div className="flex items-center gap-2 text-ink-muted text-xs mb-1">
            <Activity size={14} />
            <span>Active Signatures</span>
          </div>
          <div className="text-3xl font-bold text-ink-primary font-mono">{signatures.length}</div>
          <div className="text-[11px] text-ink-muted mt-1">{categories.length} Categories loaded</div>
        </Card>

        <Card className="flex flex-col justify-center">
          <div className="flex items-center gap-2 text-ink-muted text-xs mb-1">
            <ShieldAlert size={14} className="text-danger" />
            <span>Total Threat Interceptions</span>
          </div>
          <div className="text-3xl font-bold text-danger font-mono">{totalHits}</div>
          <div className="text-[11px] text-ink-muted mt-1">Matched across incoming payloads</div>
        </Card>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterCategory("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filterCategory === "all"
                ? "bg-accent/15 text-accent border-accent/30"
                : "bg-surface-elevated text-ink-muted border-hairline hover:border-hairline-strong"
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                filterCategory === cat
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "bg-surface-elevated text-ink-muted border-hairline hover:border-hairline-strong"
              }`}
            >
              {cat.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search signatures, MITRE, patterns..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-64 rounded-md border border-hairline bg-surface-elevated px-3 text-xs text-ink-primary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Signature Table */}
      <div className="material-panel rounded-xl overflow-hidden border border-hairline">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] uppercase tracking-wide text-ink-muted bg-surface-elevated/40">
                <th className="px-4 py-3 font-medium">Signature ID</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Default Action</th>
                <th className="px-4 py-3 font-medium">MITRE ATT&CK</th>
                <th className="px-4 py-3 font-medium text-right">Hits</th>
              </tr>
            </thead>
            <tbody>
              {filteredSignatures.map((sig) => (
                <tr
                  key={sig.id}
                  className="border-t border-hairline/60 hover:bg-surface-elevated/50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono font-bold text-ink-primary text-xs">
                    {sig.id}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded bg-surface-elevated text-ink-muted text-xs border border-hairline font-mono">
                      {sig.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-primary text-xs max-w-xs truncate">
                    {sig.description}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={SEV_BADGE[sig.severity] || "default"}>
                      {sig.severity}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-muted">
                    {sig.action}
                  </td>
                  <td className="px-4 py-3">
                    {sig.mitre_technique ? (
                      <span className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 text-xs font-mono">
                        {sig.mitre_technique}
                      </span>
                    ) : (
                      <span className="text-ink-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-xs text-ink-primary">
                    {sig.hit_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
