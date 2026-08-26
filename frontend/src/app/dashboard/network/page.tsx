"use client";

import { useState, useCallback, useEffect } from "react";
import { usePolling } from "@/hooks/use-polling";
import { network } from "@/lib/api";
import type { IpAllowlistEntryItem, NetworkAccessRuleItem } from "@/lib/types";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Network,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  Globe,
  Radio,
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  Laptop,
} from "lucide-react";

export default function NetworkPage() {
  const [activeTab, setActiveTab] = useState<"allowlist" | "rules" | "simulator">("allowlist");
  const [isAddingIp, setIsAddingIp] = useState(false);
  const [isAddingRule, setIsAddingRule] = useState(false);

  // My IP
  const [myIp, setMyIp] = useState<string | null>(null);

  // Form states
  const [newCidr, setNewCidr] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newScope, setNewScope] = useState("all");
  const [newExpirationHours, setNewExpirationHours] = useState("0");

  const [newRulePriority, setNewRulePriority] = useState("100");
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleSourceCidr, setNewRuleSourceCidr] = useState("0.0.0.0/0");
  const [newRuleAction, setNewRuleAction] = useState<"allow" | "deny">("allow");
  const [newRuleProtocol, setNewRuleProtocol] = useState("all");

  // Simulator
  const [simIp, setSimIp] = useState("192.168.1.50");
  const [simProtocol, setSimProtocol] = useState("http");
  const [simScope, setSimScope] = useState("api");
  const [simResult, setSimResult] = useState<any>(null);
  const [simulating, setSimulating] = useState(false);

  const [saving, setSaving] = useState(false);

  const {
    data: allowlist,
    loading: allowlistLoading,
    refresh: refreshAllowlist,
  } = usePolling<IpAllowlistEntryItem[]>(
    useCallback((_signal) => network.ipAllowlist(), []),
    5000
  );

  const {
    data: rules,
    loading: rulesLoading,
    refresh: refreshRules,
  } = usePolling<NetworkAccessRuleItem[]>(
    useCallback((_signal) => network.rules(), []),
    5000
  );

  useEffect(() => {
    network.myIp().then((res) => setMyIp(res.client_ip)).catch(() => {});
  }, []);

  async function handleAddIp() {
    if (!newCidr || !newLabel) return;
    setSaving(true);
    try {
      let expiresAt: string | null = null;
      if (parseInt(newExpirationHours) > 0) {
        const d = new Date();
        d.setHours(d.getHours() + parseInt(newExpirationHours));
        expiresAt = d.toISOString();
      }

      await network.addIpAllowlist({
        cidr_or_ip: newCidr,
        label: newLabel,
        scope: newScope,
        expires_at: expiresAt,
      });

      setIsAddingIp(false);
      setNewCidr("");
      setNewLabel("");
      refreshAllowlist();
    } catch (err: any) {
      alert(err.message || "Failed to add IP allowlist entry");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteIp(id: string) {
    if (!confirm("Are you sure you want to delete this IP entry?")) return;
    try {
      await network.deleteIpAllowlist(id);
      refreshAllowlist();
    } catch (err: any) {
      alert(err.message || "Failed to delete IP entry");
    }
  }

  async function handleAddRule() {
    if (!newRuleName || !newRuleSourceCidr) return;
    setSaving(true);
    try {
      await network.createRule({
        priority: parseInt(newRulePriority),
        name: newRuleName,
        source_cidr: newRuleSourceCidr,
        action: newRuleAction,
        protocol: newRuleProtocol,
      });
      setIsAddingRule(false);
      setNewRuleName("");
      setNewRuleSourceCidr("0.0.0.0/0");
      refreshRules();
    } catch (err: any) {
      alert(err.message || "Failed to create network rule");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRule(id: string) {
    if (!confirm("Are you sure you want to delete this network rule?")) return;
    try {
      await network.deleteRule(id);
      refreshRules();
    } catch (err: any) {
      alert(err.message || "Failed to delete network rule");
    }
  }

  async function handleRunSimulation() {
    setSimulating(true);
    try {
      const res = await network.testPacket({
        client_ip: simIp,
        protocol: simProtocol,
        scope: simScope,
      });
      setSimResult(res);
    } catch (err: any) {
      alert(err.message || "Failed to simulate packet");
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="space-y-6">
      <Header
        title="Network Access Control & IP Allowlisting"
        description="Filter and protect firewall traffic by CIDR subnets, enforce IP allowlists, and test mesh network boundaries."
        action={
          <div className="flex items-center gap-3">
            {myIp && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewCidr(myIp);
                  setNewLabel("My Workstation IP");
                  setIsAddingIp(true);
                }}
                className="flex items-center gap-1.5 font-mono text-xs"
              >
                <Laptop size={14} className="text-accent" />
                <span>Add My IP ({myIp})</span>
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                if (activeTab === "rules") {
                  setIsAddingRule(true);
                } else {
                  setIsAddingIp(true);
                }
              }}
              className="flex items-center gap-1.5"
            >
              <Plus size={14} />
              <span>{activeTab === "rules" ? "Add Network Rule" : "Add Allowlist IP"}</span>
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-hairline gap-2">
        <button
          onClick={() => setActiveTab("allowlist")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeTab === "allowlist"
              ? "border-accent text-accent"
              : "border-transparent text-ink-muted hover:text-ink-primary"
          }`}
        >
          IP / CIDR Allowlist ({allowlist?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab("rules")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeTab === "rules"
              ? "border-accent text-accent"
              : "border-transparent text-ink-muted hover:text-ink-primary"
          }`}
        >
          Network Access Rules ({rules?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab("simulator")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeTab === "simulator"
              ? "border-accent text-accent"
              : "border-transparent text-ink-muted hover:text-ink-primary"
          }`}
        >
          Traffic &amp; IP Packet Simulator
        </button>
      </div>

      {/* TAB 1: IP Allowlist */}
      {activeTab === "allowlist" && (
        <Card className="material-base">
          <CardHeader className="border-b border-hairline pb-4">
            <CardTitle className="text-base font-semibold text-ink-primary flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe size={18} className="text-accent" />
                <span>Authorized IP Addresses &amp; Subnets</span>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                {allowlist && allowlist.length > 0 ? "Allowlist Enforced" : "Open Access (No Filter)"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-surface-elevated/40 text-ink-muted font-medium">
                    <th className="py-3 px-4">Label</th>
                    <th className="py-3 px-4">IP / CIDR Block</th>
                    <th className="py-3 px-4">Scope</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Expires</th>
                    <th className="py-3 px-4">Created By</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {allowlistLoading ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-ink-muted">
                        <Skeleton className="h-6 w-3/4 mx-auto" />
                      </td>
                    </tr>
                  ) : allowlist && allowlist.length > 0 ? (
                    allowlist.map((item) => (
                      <tr key={item.id} className="hover:bg-surface-elevated/30 transition-colors">
                        <td className="py-3 px-4 font-semibold text-ink-primary">{item.label}</td>
                        <td className="py-3 px-4 font-mono text-emerald-400 font-bold">
                          {item.cidr_or_ip}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className="uppercase text-[9px] font-mono">
                            {item.scope}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={item.is_enabled && !item.is_expired ? "success" : "destructive"}
                            className="text-[10px]"
                          >
                            {item.is_expired ? "Expired" : item.is_enabled ? "Active" : "Disabled"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-ink-muted">
                          {item.expires_at ? new Date(item.expires_at).toLocaleString() : "Never"}
                        </td>
                        <td className="py-3 px-4 font-mono text-ink-muted">{item.created_by || "admin"}</td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleDeleteIp(item.id)}
                            className="text-ink-muted hover:text-rose-400"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-ink-muted">
                        <div className="flex flex-col items-center gap-2">
                          <ShieldCheck size={28} className="text-emerald-400 opacity-60" />
                          <span className="font-medium text-ink-primary">No IP Allowlist Configured</span>
                          <p className="text-xs text-ink-muted max-w-sm">
                            Add authorized IP addresses to restrict dashboard &amp; API access to trusted networks.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 2: Network Access Rules */}
      {activeTab === "rules" && (
        <Card className="material-base">
          <CardHeader className="border-b border-hairline pb-4">
            <CardTitle className="text-base font-semibold text-ink-primary flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio size={18} className="text-indigo-400" />
                <span>Ingress &amp; Egress Network Packet Rules</span>
              </div>
              <span className="text-xs font-normal text-ink-muted font-mono">
                Evaluated by priority (lowest number first)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-surface-elevated/40 text-ink-muted font-medium">
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Rule Name</th>
                    <th className="py-3 px-4">Source CIDR</th>
                    <th className="py-3 px-4">Protocol</th>
                    <th className="py-3 px-4">Target Agent</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline font-mono">
                  {rulesLoading ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-ink-muted">
                        <Skeleton className="h-6 w-3/4 mx-auto" />
                      </td>
                    </tr>
                  ) : rules && rules.length > 0 ? (
                    rules.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-elevated/30 transition-colors">
                        <td className="py-3 px-4 font-bold text-accent">#{r.priority}</td>
                        <td className="py-3 px-4 font-sans font-semibold text-ink-primary">{r.name}</td>
                        <td className="py-3 px-4 font-bold text-ink-primary">{r.source_cidr}</td>
                        <td className="py-3 px-4 uppercase text-ink-muted">{r.protocol}</td>
                        <td className="py-3 px-4 font-sans text-ink-muted">
                          {r.destination_agent_name || "Any Agent"}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={r.action === "allow" ? "success" : "destructive"}>
                            {r.action.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right font-sans">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleDeleteRule(r.id)}
                            className="text-ink-muted hover:text-rose-400"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-ink-muted">
                        No custom network rules configured (Default: Allow)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: Simulator */}
      {activeTab === "simulator" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="material-base">
            <CardHeader className="border-b border-hairline pb-4">
              <CardTitle className="text-base font-semibold text-ink-primary flex items-center gap-2">
                <Play size={18} className="text-accent" />
                <span>Simulate Inbound IP Packet</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Source IP Address</label>
                <input
                  type="text"
                  value={simIp}
                  onChange={(e) => setSimIp(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-sm font-mono text-ink-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1">Protocol</label>
                  <select
                    value={simProtocol}
                    onChange={(e) => setSimProtocol(e.target.value)}
                    className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-xs text-ink-primary"
                  >
                    <option value="http">HTTP / REST</option>
                    <option value="grpc">gRPC</option>
                    <option value="websocket">WebSocket</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1">Target Scope</label>
                  <select
                    value={simScope}
                    onChange={(e) => setSimScope(e.target.value)}
                    className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-xs text-ink-primary"
                  >
                    <option value="api">API Endpoint (/v1/*)</option>
                    <option value="dashboard">Web Dashboard</option>
                  </select>
                </div>
              </div>
              <Button
                variant="default"
                className="w-full mt-2 flex items-center justify-center gap-2"
                onClick={handleRunSimulation}
                disabled={simulating}
              >
                <Play size={14} />
                <span>{simulating ? "Evaluating..." : "Evaluate Packet Policy"}</span>
              </Button>
            </CardContent>
          </Card>

          <Card className="material-base">
            <CardHeader className="border-b border-hairline pb-4">
              <CardTitle className="text-base font-semibold text-ink-primary">
                Evaluation Decision &amp; Audit Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              {simResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-elevated border border-hairline">
                    {simResult.overall_allowed ? (
                      <CheckCircle2 size={28} className="text-emerald-400" />
                    ) : (
                      <XCircle size={28} className="text-rose-400" />
                    )}
                    <div>
                      <div className="text-sm font-bold text-ink-primary">
                        {simResult.overall_allowed ? "PACKET PERMITTED" : "PACKET REJECTED (403 FORBIDDEN)"}
                      </div>
                      <div className="text-xs text-ink-muted font-mono">
                        Client IP: {simResult.client_ip}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="p-3 rounded-lg bg-surface border border-hairline space-y-1">
                      <span className="font-semibold text-ink-primary">Layer 1: IP Allowlist Check</span>
                      <div className="font-mono text-ink-muted">
                        Allowed: {simResult.ip_allowlist_evaluation?.allowed ? "true" : "false"} (Enforced: {simResult.ip_allowlist_evaluation?.enforced ? "true" : "false"})
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-surface border border-hairline space-y-1">
                      <span className="font-semibold text-ink-primary">Layer 2: Network Rules Check</span>
                      <div className="font-mono text-ink-muted">
                        Allowed: {simResult.network_rules_evaluation?.allowed ? "true" : "false"}
                      </div>
                      {simResult.network_rules_evaluation?.rule_name && (
                        <div className="text-ink-muted">
                          Matched Rule: <span className="font-semibold text-ink-primary">{simResult.network_rules_evaluation.rule_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-ink-muted text-xs">
                  Run a simulation to inspect how the firewall network engine evaluates an IP packet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add IP Modal */}
      {isAddingIp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="material-elevated border border-hairline-strong rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-ink-primary">Add IP Allowlist Entry</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-ink-muted font-medium mb-1">IP Address or CIDR Block</label>
                <input
                  type="text"
                  placeholder="e.g. 192.168.1.100 or 10.0.0.0/16"
                  value={newCidr}
                  onChange={(e) => setNewCidr(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-mono"
                />
              </div>
              <div>
                <label className="block text-ink-muted font-medium mb-1">Label / Purpose</label>
                <input
                  type="text"
                  placeholder="e.g. Headquarters VPN"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-sans"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink-muted font-medium mb-1">Applies To Scope</label>
                  <select
                    value={newScope}
                    onChange={(e) => setNewScope(e.target.value)}
                    className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-sans"
                  >
                    <option value="all">All (API &amp; Dashboard)</option>
                    <option value="api">API Only</option>
                    <option value="dashboard">Dashboard Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-ink-muted font-medium mb-1">Temporary Expiry</label>
                  <select
                    value={newExpirationHours}
                    onChange={(e) => setNewExpirationHours(e.target.value)}
                    className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-sans"
                  >
                    <option value="0">Never Expires</option>
                    <option value="1">1 Hour</option>
                    <option value="8">8 Hours</option>
                    <option value="24">24 Hours</option>
                    <option value="168">7 Days</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsAddingIp(false)}>
                Cancel
              </Button>
              <Button variant="default" size="sm" disabled={saving} onClick={handleAddIp}>
                {saving ? "Adding..." : "Add to Allowlist"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Rule Modal */}
      {isAddingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="material-elevated border border-hairline-strong rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-ink-primary">Create Network Access Rule</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-ink-muted font-medium mb-1">Rule Name</label>
                <input
                  type="text"
                  placeholder="e.g. Block Untrusted Subnet"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-sans"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink-muted font-medium mb-1">Source CIDR</label>
                  <input
                    type="text"
                    value={newRuleSourceCidr}
                    onChange={(e) => setNewRuleSourceCidr(e.target.value)}
                    className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-mono"
                  />
                </div>
                <div>
                  <label className="block text-ink-muted font-medium mb-1">Priority (1-1000)</label>
                  <input
                    type="number"
                    value={newRulePriority}
                    onChange={(e) => setNewRulePriority(e.target.value)}
                    className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink-muted font-medium mb-1">Action</label>
                  <select
                    value={newRuleAction}
                    onChange={(e) => setNewRuleAction(e.target.value as "allow" | "deny")}
                    className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-sans"
                  >
                    <option value="allow">ALLOW</option>
                    <option value="deny">DENY (BLOCK)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-ink-muted font-medium mb-1">Protocol</label>
                  <select
                    value={newRuleProtocol}
                    onChange={(e) => setNewRuleProtocol(e.target.value)}
                    className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-sans"
                  >
                    <option value="all">ALL</option>
                    <option value="http">HTTP</option>
                    <option value="grpc">gRPC</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsAddingRule(false)}>
                Cancel
              </Button>
              <Button variant="default" size="sm" disabled={saving} onClick={handleAddRule}>
                {saving ? "Creating..." : "Create Network Rule"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
