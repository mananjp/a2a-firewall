"use client";

import { useState, useCallback } from "react";
import { usePolling } from "@/hooks/use-polling";
import { spend } from "@/lib/api";
import type { WorkspaceSpendOverview, AgentSpendLimitItem, SpendLedgerItem } from "@/lib/types";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  Cpu,
  ShieldAlert,
  Sliders,
  Download,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Bot,
  Zap,
} from "lucide-react";

export default function SpendPage() {
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentSpendLimitItem | null>(null);
  const [orgBudgetInput, setOrgBudgetInput] = useState<string>("1000");
  const [orgTokenBudgetInput, setOrgTokenBudgetInput] = useState<string>("10000000");
  const [orgActionInput, setOrgActionInput] = useState<string>("block");
  const [agentBudgetInput, setAgentBudgetInput] = useState<string>("100");
  const [agentTokenBudgetInput, setAgentTokenBudgetInput] = useState<string>("1000000");
  const [saving, setSaving] = useState(false);

  const {
    data: overview,
    loading: overviewLoading,
    refresh: refreshOverview,
  } = usePolling<WorkspaceSpendOverview>(
    useCallback((_signal) => spend.overview(), []),
    5000
  );

  const {
    data: agents,
    loading: agentsLoading,
    refresh: refreshAgents,
  } = usePolling<AgentSpendLimitItem[]>(
    useCallback((_signal) => spend.agents(), []),
    5000
  );

  const {
    data: ledgerData,
    loading: ledgerLoading,
    refresh: refreshLedger,
  } = usePolling<{ workspace_id: string; count: number; transactions: SpendLedgerItem[] }>(
    useCallback((_signal) => spend.ledger({ limit: 50 }), []),
    5000
  );

  async function handleSaveOrg() {
    setSaving(true);
    try {
      await spend.updateWorkspace({
        monthly_budget_usd: parseFloat(orgBudgetInput),
        token_budget: parseInt(orgTokenBudgetInput),
        hard_limit_action: orgActionInput,
      });
      setIsEditingOrg(false);
      refreshOverview();
    } catch (err) {
      alert("Failed to update workspace spend limits");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAgent() {
    if (!selectedAgent) return;
    setSaving(true);
    try {
      await spend.updateAgent(selectedAgent.agent_id, {
        monthly_budget_usd: parseFloat(agentBudgetInput),
        token_budget: parseInt(agentTokenBudgetInput),
        is_active: true,
      });
      setSelectedAgent(null);
      refreshAgents();
      refreshOverview();
    } catch (err) {
      alert("Failed to update agent spend limits");
    } finally {
      setSaving(false);
    }
  }

  const spendPct = overview?.spend_percentage || 0;
  const tokenPct = overview?.token_percentage || 0;

  return (
    <div className="space-y-6">
      <Header
        title="Spend & Budget Governance"
        description="Monitor and enforce financial budgets, token quotas, and cost limits across organization and individual agents."
        action={
          <div className="flex items-center gap-3">
            <a
              href={spend.exportCsvUrl(500)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-elevated px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-surface-elevated/80 transition-colors shadow-sm"
            >
              <Download size={14} /> Export Ledger CSV
            </a>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                if (overview) {
                  setOrgBudgetInput(String(overview.monthly_budget_usd));
                  setOrgTokenBudgetInput(String(overview.token_budget));
                  setOrgActionInput(overview.hard_limit_action);
                }
                setIsEditingOrg(true);
              }}
              className="flex items-center gap-1.5"
            >
              <Sliders size={14} /> Set Org Budget
            </Button>
          </div>
        }
      />

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Financial Budget Card */}
        <Card className="material-base relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted">Monthly Financial Budget</span>
              <div className="p-2 rounded-xl bg-accent/10 border border-accent/20 text-accent">
                <DollarSign size={16} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono text-ink-primary">
                ${overview?.current_spend_usd.toFixed(2) || "0.00"}
                <span className="text-xs font-normal text-ink-muted ml-1.5">
                  / ${overview?.monthly_budget_usd.toFixed(2) || "1,000.00"}
                </span>
              </div>
              <div className="mt-3 w-full bg-surface-elevated rounded-full h-2 overflow-hidden border border-hairline">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    spendPct > 90
                      ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                      : spendPct > 75
                      ? "bg-amber-500"
                      : "bg-accent"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, spendPct))}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-ink-muted font-mono">
                <span>{spendPct.toFixed(1)}% utilized</span>
                {overview?.alert_triggered && (
                  <span className="text-amber-400 flex items-center gap-1 font-medium">
                    <AlertTriangle size={12} /> Budget Alert (&gt;{overview.alert_threshold_pct}%)
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Token Budget Card */}
        <Card className="material-base relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted">Token Consumption</span>
              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Cpu size={16} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono text-ink-primary">
                {overview ? (overview.current_tokens / 1000).toFixed(1) + "k" : "0k"}
                <span className="text-xs font-normal text-ink-muted ml-1.5">
                  / {overview ? (overview.token_budget / 1000000).toFixed(1) + "M" : "10.0M"}
                </span>
              </div>
              <div className="mt-3 w-full bg-surface-elevated rounded-full h-2 overflow-hidden border border-hairline">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(2, tokenPct))}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-ink-muted font-mono">
                <span>{tokenPct.toFixed(1)}% consumed</span>
                <span>Reset on 1st</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hard Limit Action */}
        <Card className="material-base relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted">Cap Enforcement Mode</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <ShieldAlert size={16} />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <Badge
                  variant={overview?.hard_limit_action === "block" ? "destructive" : "warning"}
                  className="text-xs uppercase font-mono px-2.5 py-1"
                >
                  {overview?.hard_limit_action === "block" ? "Auto-Block" : "Warn Only"}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-ink-muted leading-relaxed">
                {overview?.hard_limit_action === "block"
                  ? "Tasks exceeding org or agent budgets are automatically blocked at Layer 0."
                  : "Tasks continue processing but security alerts are broadcast to the SOC."}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Pricing & Estimation Model */}
        <Card className="material-base relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted">Standard Model Cost</span>
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <TrendingUp size={16} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono text-ink-primary">
                $0.59 <span className="text-xs font-normal text-ink-muted">/ 1M tokens</span>
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                GPT-OSS 120B &amp; LLaMA 3.3 70B inference ledger with per-character heuristic accounting.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agents Spend Limits Table */}
      <Card className="material-base">
        <CardHeader className="border-b border-hairline pb-4">
          <CardTitle className="text-base font-semibold text-ink-primary flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-accent" />
              <span>Per-Agent Spend Allocations &amp; Budgets</span>
            </div>
            <span className="text-xs font-normal text-ink-muted">
              {agents?.length || 0} agents active
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-hairline bg-surface-elevated/40 text-ink-muted font-medium">
                  <th className="py-3 px-4">Agent Name</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Current Spend</th>
                  <th className="py-3 px-4">Spend Budget</th>
                  <th className="py-3 px-4">Tokens Used</th>
                  <th className="py-3 px-4">Token Cap</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline font-mono">
                {agentsLoading ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-ink-muted">
                      <Skeleton className="h-6 w-3/4 mx-auto" />
                    </td>
                  </tr>
                ) : agents && agents.length > 0 ? (
                  agents.map((ag) => (
                    <tr key={ag.agent_id} className="hover:bg-surface-elevated/30 transition-colors">
                      <td className="py-3 px-4 font-sans font-semibold text-ink-primary flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        {ag.agent_name}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={ag.status === "active" ? "success" : "destructive"}
                          className="text-[10px]"
                        >
                          {ag.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-semibold text-ink-primary">
                        ${ag.current_spend_usd.toFixed(4)}
                      </td>
                      <td className="py-3 px-4 text-ink-muted">${ag.monthly_budget_usd.toFixed(2)}</td>
                      <td className="py-3 px-4 text-ink-muted">
                        {(ag.current_tokens / 1000).toFixed(1)}k
                      </td>
                      <td className="py-3 px-4 text-ink-muted">
                        {(ag.token_budget / 1000).toFixed(0)}k
                      </td>
                      <td className="py-3 px-4 text-right font-sans">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            setSelectedAgent(ag);
                            setAgentBudgetInput(String(ag.monthly_budget_usd));
                            setAgentTokenBudgetInput(String(ag.token_budget));
                          }}
                        >
                          Configure Limit
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-ink-muted">
                      No agents registered in workspace
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Spend Ledger */}
      <Card className="material-base">
        <CardHeader className="border-b border-hairline pb-4">
          <CardTitle className="text-base font-semibold text-ink-primary flex items-center gap-2">
            <Zap size={18} className="text-amber-400" />
            <span>Immutable Spend Transaction Ledger</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-hairline bg-surface-elevated/40 text-ink-muted font-medium">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Agent / Caller</th>
                  <th className="py-3 px-4">Operation</th>
                  <th className="py-3 px-4">Model</th>
                  <th className="py-3 px-4">Tokens</th>
                  <th className="py-3 px-4">Incurred Cost ($)</th>
                  <th className="py-3 px-4">Task ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline font-mono text-[11px]">
                {ledgerLoading ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-ink-muted">
                      <Skeleton className="h-6 w-3/4 mx-auto" />
                    </td>
                  </tr>
                ) : ledgerData && ledgerData.transactions.length > 0 ? (
                  ledgerData.transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-surface-elevated/30 transition-colors">
                      <td className="py-2.5 px-4 text-ink-muted">
                        {tx.created_at ? new Date(tx.created_at).toLocaleTimeString() : "-"}
                      </td>
                      <td className="py-2.5 px-4 font-sans font-medium text-ink-primary">
                        {tx.agent_name}
                      </td>
                      <td className="py-2.5 px-4">
                        <Badge variant="outline" className="text-[10px]">
                          {tx.operation}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-ink-muted">{tx.model_name || "default"}</td>
                      <td className="py-2.5 px-4 text-ink-primary font-semibold">
                        {tx.tokens_used}
                      </td>
                      <td className="py-2.5 px-4 text-emerald-400 font-semibold">
                        +${tx.cost_usd.toFixed(6)}
                      </td>
                      <td className="py-2.5 px-4 text-ink-muted font-mono truncate max-w-[120px]">
                        {tx.task_id ? tx.task_id.substring(0, 8) + "..." : "direct"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-ink-muted">
                      No inspection spend transactions recorded yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Org Modal */}
      {isEditingOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="material-elevated border border-hairline-strong rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-ink-primary">Configure Organization Spend Limits</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-ink-muted font-medium mb-1">Monthly Financial Budget (USD)</label>
                <input
                  type="number"
                  step="10"
                  value={orgBudgetInput}
                  onChange={(e) => setOrgBudgetInput(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-mono"
                />
              </div>
              <div>
                <label className="block text-ink-muted font-medium mb-1">Token Cap (Total Monthly Tokens)</label>
                <input
                  type="number"
                  step="100000"
                  value={orgTokenBudgetInput}
                  onChange={(e) => setOrgTokenBudgetInput(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-mono"
                />
              </div>
              <div>
                <label className="block text-ink-muted font-medium mb-1">Enforcement Action on Limit Hit</label>
                <select
                  value={orgActionInput}
                  onChange={(e) => setOrgActionInput(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-sans"
                >
                  <option value="block">Auto-Block (Reject inspection requests with 403 SPEND_LIMIT_EXCEEDED)</option>
                  <option value="warn">Warn Only (Allow traffic, generate SOC warning alerts)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsEditingOrg(false)}>
                Cancel
              </Button>
              <Button variant="default" size="sm" disabled={saving} onClick={handleSaveOrg}>
                {saving ? "Saving..." : "Save Org Limits"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Agent Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="material-elevated border border-hairline-strong rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-ink-primary">
              Set Spend Limits for <span className="text-accent">{selectedAgent.agent_name}</span>
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-ink-muted font-medium mb-1">Agent Monthly Budget (USD)</label>
                <input
                  type="number"
                  step="5"
                  value={agentBudgetInput}
                  onChange={(e) => setAgentBudgetInput(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-mono"
                />
              </div>
              <div>
                <label className="block text-ink-muted font-medium mb-1">Agent Token Cap (Monthly Tokens)</label>
                <input
                  type="number"
                  step="50000"
                  value={agentTokenBudgetInput}
                  onChange={(e) => setAgentTokenBudgetInput(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedAgent(null)}>
                Cancel
              </Button>
              <Button variant="default" size="sm" disabled={saving} onClick={handleSaveAgent}>
                {saving ? "Saving..." : "Save Agent Limit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
