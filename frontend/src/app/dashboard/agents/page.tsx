"use client";

import { useState, useCallback, type FormEvent } from "react";
import { agents, agentSecurity, ips } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { Agent, AgentWithKey, AgentVulnerability, InventoryComponent } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  Bot,
  Copy,
  Check,
  Plus,
  RefreshCw,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Package,
  Layers,
  RotateCcw,
  X,
} from "lucide-react";

export default function AgentsPage() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<{
    name: string;
    api_key: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Vulnerability & Inventory Modal State
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [inventory, setInventory] = useState<InventoryComponent[]>([]);
  const [vulnerabilities, setVulnerabilities] = useState<AgentVulnerability[]>([]);
  const [scanning, setScanning] = useState(false);
  const [newCompName, setNewCompName] = useState("");
  const [newCompVersion, setNewCompVersion] = useState("");
  const [addingComp, setAddingComp] = useState(false);

  const {
    data,
    loading,
    error: loadErr,
    refresh,
  } = usePolling<Agent[]>(
    useCallback((_signal) => agents.list() as Promise<Agent[]>, []),
    8000
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = (await agents.register({
        name: name.trim(),
        description: description.trim() || undefined,
      })) as AgentWithKey;
      setLastKey({ name: res.name, api_key: res.api_key });
      setName("");
      setDescription("");
      refresh();
      toast({ title: "Agent registered", description: `Agent ${res.name} created successfully`, variant: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register agent");
    } finally {
      setSubmitting(false);
    }
  }

  async function onAction(
    id: string,
    action: "suspend" | "reactivate" | "rotateKey" | "reinstate"
  ) {
    try {
      if (action === "rotateKey") {
        const res = await agents.rotateKey(id);
        setLastKey({ name: id.slice(0, 8), api_key: res.api_key });
        toast({ title: "API Key rotated", variant: "success" });
      } else if (action === "reinstate") {
        await ips.reinstateAgent(id);
        toast({ title: "Agent reinstated", description: "Suspension lifted and violation counter reset", variant: "success" });
      } else {
        await agents[action](id);
        toast({ title: `Agent ${action}d`, variant: "success" });
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      toast({ title: "Action failed", description: err instanceof Error ? err.message : "Error", variant: "error" });
    }
  }

  function copyKey() {
    if (lastKey) {
      navigator.clipboard.writeText(lastKey.api_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function openInventoryModal(agent: Agent) {
    setSelectedAgent(agent);
    setScanning(true);
    try {
      const [invRes, vulnRes] = await Promise.all([
        agentSecurity.getInventory(agent.id),
        agentSecurity.scanVulnerabilities(agent.id),
      ]);
      setInventory(invRes.components);
      setVulnerabilities(vulnRes.vulnerabilities);
    } catch (err) {
      console.error("Failed to load inventory / scan", err);
      toast({ title: "Failed to scan vulnerabilities", variant: "error" });
    } finally {
      setScanning(false);
    }
  }

  async function handleAddComponent(e: FormEvent) {
    e.preventDefault();
    if (!selectedAgent || !newCompName.trim() || !newCompVersion.trim()) return;
    setAddingComp(true);
    try {
      const updatedComponents = [
        ...inventory.map((c) => ({
          component_name: c.component_name,
          component_version: c.component_version,
          cpe_string: c.cpe_string || undefined,
        })),
        {
          component_name: newCompName.trim(),
          component_version: newCompVersion.trim(),
        },
      ];
      await agentSecurity.updateInventory(selectedAgent.id, updatedComponents);
      setNewCompName("");
      setNewCompVersion("");
      // Re-scan
      const [invRes, vulnRes] = await Promise.all([
        agentSecurity.getInventory(selectedAgent.id),
        agentSecurity.scanVulnerabilities(selectedAgent.id),
      ]);
      setInventory(invRes.components);
      setVulnerabilities(vulnRes.vulnerabilities);
      toast({ title: "Component added", description: "CVE inventory updated & re-scanned", variant: "success" });
    } catch (err) {
      toast({ title: "Failed to add component", description: err instanceof Error ? err.message : "Error", variant: "error" });
    } finally {
      setAddingComp(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agent Fleet"
        title="Registered Agents & Software Inventory"
        description="Agents registered with Ed25519 identity keys, vulnerability tracking (CVE/CVSS), and containment controls."
        trailing={loading && data ? <Loader2 size={16} className="text-accent animate-spin" /> : undefined}
      />

      {(error || loadErr) && (
        <div className="rounded-lg border border-block/30 bg-block/10 px-4 py-3 text-[13px] text-block font-mono">
          {error || loadErr?.message}
        </div>
      )}

      {/* Register Agent Form */}
      <div className="material-panel rounded-2xl p-6 max-w-2xl">
        <div className="eyebrow mb-3 flex items-center gap-1.5">
          <Plus size={13} className="text-accent" />
          <span>Provision New Autonomous Agent</span>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Agent Identifier"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. compliance-analyzer"
            required
          />
          <Input
            label="Description & Capabilities (Optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Evaluates SAR filings and customer risk scores"
          />
          <Button
            type="submit"
            disabled={submitting || !name.trim()}
            size="sm"
            className="font-mono text-[12px]"
          >
            {submitting ? "Registering..." : "Register Agent"}
          </Button>
        </form>

        {lastKey && (
          <div className="mt-4 rounded-xl border border-review/30 bg-review/10 p-4">
            <div className="text-[13px] text-ink-primary font-medium flex items-center gap-2 mb-1">
              <KeyRound size={14} className="text-review" />
              <span>
                API Key for <span className="font-mono font-bold">{lastKey.name}</span>
              </span>
            </div>
            <p className="text-[11px] text-ink-muted mb-2">
              Copy this token now. It is hashed with SHA-256 and will not be displayed again:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-surface-sunken px-3 py-2 text-[12px] font-mono text-allow border border-hairline break-all">
                {lastKey.api_key}
              </code>
              <button
                onClick={copyKey}
                className="rounded-lg p-2 bg-surface border border-hairline text-ink-muted hover:text-ink-primary transition-all shrink-0"
                aria-label="Copy key"
              >
                {copied ? <Check size={14} className="text-allow" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Agents Table */}
      <div className="material-panel rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-hairline flex items-center justify-between">
          <span className="eyebrow">Registered Agents</span>
          <span className="text-[11px] font-mono text-ink-muted">{data?.length ?? 0} agents active</span>
        </div>

        {loading && !data && <TableSkeleton rows={4} cols={4} />}

        {!loading && data && data.length === 0 && (
          <EmptyState
            icon={<Bot size={24} />}
            title="No agents registered yet"
            description="Provision an agent above to issue keys and configure permissions."
          />
        )}

        {data && data.length > 0 && (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] uppercase tracking-wide text-ink-muted bg-surface-elevated/40">
                <th className="px-5 py-3 font-medium">Agent Name</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Agent UUID</th>
                <th className="px-5 py-3 font-medium">CVE / Stack</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-hairline/60 transition-colors duration-120 hover:bg-surface-elevated"
                >
                  <td className="px-5 py-3.5 font-semibold text-ink-primary flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        a.status === "active" ? "bg-allow" : "bg-block"
                      }`}
                    />
                    <span>{a.name}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={a.status === "active" ? "allow" : "block"}>
                      {a.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-[12px] text-ink-muted">
                    {a.id}
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => openInventoryModal(a)}
                      className="flex items-center gap-1.5 text-xs text-accent hover:underline font-mono bg-accent/10 px-2 py-1 rounded border border-accent/20"
                    >
                      <Package size={12} />
                      <span>Software Stack</span>
                    </button>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {a.status === "active" ? (
                        <Button
                          onClick={() => onAction(a.id, "suspend")}
                          variant="danger"
                          size="sm"
                          className="h-7 px-2.5 text-[11px] font-mono"
                        >
                          Suspend
                        </Button>
                      ) : (
                        <div className="flex gap-1.5">
                          <Button
                            onClick={() => onAction(a.id, "reinstate")}
                            variant="primary"
                            size="sm"
                            className="h-7 px-2.5 text-[11px] font-mono gap-1"
                          >
                            <RotateCcw size={11} />
                            Reinstate
                          </Button>
                        </div>
                      )}
                      <Button
                        onClick={() => onAction(a.id, "rotateKey")}
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2.5 text-[11px] font-mono gap-1"
                      >
                        <RefreshCw size={11} />
                        Rotate
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Software Inventory & Vulnerability Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-3xl rounded-2xl bg-surface border border-hairline p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Package className="text-accent" size={18} />
                  <h2 className="text-lg font-bold text-ink-primary">
                    Software Stack: {selectedAgent.name}
                  </h2>
                </div>
                <p className="text-xs text-ink-muted mt-0.5">
                  Components declared by this agent, scanned against NVD CVE / CVSS database.
                </p>
              </div>
              <button
                onClick={() => setSelectedAgent(null)}
                className="rounded-lg p-1.5 text-ink-muted hover:text-ink-primary hover:bg-surface-elevated transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Add Component Form */}
            <form onSubmit={handleAddComponent} className="flex gap-3 items-end bg-surface-elevated p-3.5 rounded-xl border border-hairline">
              <div className="flex-1">
                <label className="text-[11px] font-mono text-ink-muted block mb-1">Component Name</label>
                <input
                  type="text"
                  placeholder="e.g. langchain, fastapi, jinja2"
                  value={newCompName}
                  onChange={(e) => setNewCompName(e.target.value)}
                  className="h-8 w-full rounded-md border border-hairline bg-surface px-2.5 text-xs text-ink-primary"
                  required
                />
              </div>
              <div className="w-36">
                <label className="text-[11px] font-mono text-ink-muted block mb-1">Version</label>
                <input
                  type="text"
                  placeholder="e.g. 0.1.0"
                  value={newCompVersion}
                  onChange={(e) => setNewCompVersion(e.target.value)}
                  className="h-8 w-full rounded-md border border-hairline bg-surface px-2.5 text-xs text-ink-primary"
                  required
                />
              </div>
              <Button type="submit" size="sm" disabled={addingComp} className="h-8 text-xs font-mono">
                {addingComp ? "Adding…" : "+ Add Component"}
              </Button>
            </form>

            {/* Inventory Table */}
            <div>
              <div className="eyebrow mb-2 flex items-center justify-between">
                <span>Declared Inventory ({inventory.length})</span>
                {scanning && <span className="text-accent flex items-center gap-1 text-[10px]"><Loader2 size={11} className="animate-spin" /> Scanning CVEs…</span>}
              </div>

              {inventory.length === 0 ? (
                <div className="text-center py-6 text-xs text-ink-muted bg-surface-elevated/40 rounded-lg border border-hairline">
                  No software components declared yet. Add one above to enable Layer 3b CVE risk scoring.
                </div>
              ) : (
                <div className="rounded-lg border border-hairline overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-surface-elevated/60 text-ink-muted border-b border-hairline">
                        <th className="px-3 py-2 text-left font-medium">Component</th>
                        <th className="px-3 py-2 text-left font-medium">Version</th>
                        <th className="px-3 py-2 text-left font-medium">CPE String</th>
                        <th className="px-3 py-2 text-right font-medium">Last Scan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map((c) => (
                        <tr key={c.id} className="border-t border-hairline/50">
                          <td className="px-3 py-2 font-mono font-medium text-ink-primary">{c.component_name}</td>
                          <td className="px-3 py-2 font-mono text-ink-muted">{c.component_version}</td>
                          <td className="px-3 py-2 font-mono text-[10px] text-ink-muted">{c.cpe_string || "—"}</td>
                          <td className="px-3 py-2 text-right text-ink-muted">
                            {c.last_scanned_at ? new Date(c.last_scanned_at).toLocaleTimeString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Vulnerabilities Result */}
            <div>
              <div className="eyebrow mb-2 flex items-center gap-1.5 text-danger">
                <ShieldAlert size={12} />
                <span>Detected CVEs & CVSS Risk Impact ({vulnerabilities.length})</span>
              </div>

              {vulnerabilities.length === 0 ? (
                <div className="text-center py-6 text-xs text-allow bg-allow/5 rounded-lg border border-allow/20 flex items-center justify-center gap-2">
                  <ShieldCheck size={16} />
                  <span>No known critical/high vulnerabilities detected in declared stack.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {vulnerabilities.map((v, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-red-400">{v.cve_id}</span>
                        <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-mono font-bold text-[10px]">
                          CVSS {v.cvss_score} ({v.severity.toUpperCase()})
                        </span>
                      </div>
                      <div className="text-ink-primary font-medium">
                        Affected: {v.component} v{v.version}
                      </div>
                      <p className="text-ink-muted text-[11px]">{v.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
