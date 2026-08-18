"use client";

import { useState, useCallback, useMemo, type FormEvent } from "react";
import { policies } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { Policy, PolicyAction } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Trash2,
  Plus,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Binary,
  Layers,
  Zap,
  HelpCircle,
  Play,
  RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ACTIONS: PolicyAction[] = ["block", "allow", "review", "flag"];

const TASK_TYPE_SUGGESTIONS = [
  { type: "wire_transfer", category: "Financial", desc: "Outbound money movement and settlement" },
  { type: "investigation", category: "Security", desc: "Account security and fraud anomaly checks" },
  { type: "identity_verification", category: "Identity", desc: "Biometric and government ID checks" },
  { type: "payment_hold", category: "Financial", desc: "Placing risk holds on pending transactions" },
  { type: "payment_approval", category: "Financial", desc: "Approving transactions for settlement" },
  { type: "data_export", category: "Data", desc: "Exporting customer records or internal metrics" },
  { type: "research", category: "General", desc: "Open-ended web and intelligence retrieval" },
  { type: "compliance_check", category: "Compliance", desc: "Regulatory and OFAC sanction checks" },
  { type: "status_update", category: "General", desc: "Inter-agent workflow status notifications" },
];

interface PolicyTemplate {
  name: string;
  taskType: string;
  action: PolicyAction;
  priority: string;
  badge: string;
  badgeColor: string;
  description: string;
}

const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    name: "Anti-Agentic Pentest Immunity Guard",
    taskType: "",
    action: "block",
    priority: "10",
    badge: "Immunity",
    badgeColor: "border-block/40 text-block bg-block/10",
    description: "Quarantine agents probing honeypot canaries, fuzzing endpoints, or seeking system prompt leaks.",
  },
  {
    name: "SQL Injection & Tautology Shield",
    taskType: "investigation",
    action: "block",
    priority: "20",
    badge: "SQL Guard",
    badgeColor: "border-block/40 text-block bg-block/10",
    description: "Drop requests with UNION SELECT, stacked SQL commands, or tautological bypass predicates.",
  },
  {
    name: "High-Value Wire Transfer Boundary ($100k+)",
    taskType: "wire_transfer",
    action: "block",
    priority: "30",
    badge: "Financial",
    badgeColor: "border-review/40 text-review bg-review/10",
    description: "Enforce strict dual-authorization on wire transfers exceeding standard threshold.",
  },
  {
    name: "Customer PII Data Export Human Review",
    taskType: "data_export",
    action: "review",
    priority: "40",
    badge: "Compliance",
    badgeColor: "border-accent/40 text-accent bg-accent/10",
    description: "Route any bulk data export containing customer identity fields to SOC review queue.",
  },
  {
    name: "Synthetic KYC Bypass Prevention",
    taskType: "identity_verification",
    action: "block",
    priority: "50",
    badge: "KYC Guard",
    badgeColor: "border-block/40 text-block bg-block/10",
    description: "Immediately reject identity verification requests attempting to override mismatched SSNs.",
  },
];

export default function PoliciesPage() {
  const [priority, setPriority] = useState("100");
  const [name, setName] = useState("");
  const [action, setAction] = useState<PolicyAction>("block");
  const [taskType, setTaskType] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");

  // Sandbox Tester State
  const [testTaskType, setTestTaskType] = useState("wire_transfer");
  const [testPayloadSummary, setTestPayloadSummary] = useState("Wire transfer of $250,000 to Shell Company LLC");
  const [testResult, setTestResult] = useState<{
    matchedPolicy: Policy | null;
    verdict: string;
    reason: string;
  } | null>(null);

  const {
    data,
    loading,
    error: loadErr,
    refresh,
  } = usePolling<Policy[]>(
    useCallback((_signal) => policies.list() as Promise<Policy[]>, []),
    8000
  );

  const filteredSuggestions = useMemo(() => {
    if (!taskType.trim()) return TASK_TYPE_SUGGESTIONS;
    return TASK_TYPE_SUGGESTIONS.filter((s) =>
      s.type.toLowerCase().includes(taskType.toLowerCase()) ||
      s.desc.toLowerCase().includes(taskType.toLowerCase())
    );
  }, [taskType]);

  const filteredPolicies = useMemo(() => {
    if (!data) return [];
    return data
      .filter((p) => {
        const matchesAction = filterAction === "all" || p.action === filterAction;
        const matchesSearch =
          !searchTerm.trim() ||
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (p.task_type && p.task_type.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesAction && matchesSearch;
      })
      .sort((a, b) => a.priority - b.priority);
  }, [data, filterAction, searchTerm]);

  function applyTemplate(tpl: PolicyTemplate) {
    setName(tpl.name);
    setTaskType(tpl.taskType);
    setAction(tpl.action);
    setPriority(tpl.priority);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await policies.create({
        priority: Number(priority) || 100,
        name: name.trim(),
        action,
        task_type: taskType.trim() || undefined,
      });
      setName("");
      setTaskType("");
      setShowSuggestions(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create policy");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    try {
      await policies.delete(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete policy");
    }
  }

  function runSandboxTest() {
    if (!data || data.length === 0) {
      setTestResult({
        matchedPolicy: null,
        verdict: "allow",
        reason: "No declarative policies configured (default permit)",
      });
      return;
    }

    const sorted = [...data].sort((a, b) => a.priority - b.priority);
    const matched = sorted.find(
      (p) => !p.task_type || p.task_type.toLowerCase() === testTaskType.toLowerCase()
    );

    if (matched) {
      setTestResult({
        matchedPolicy: matched,
        verdict: matched.action,
        reason: `Matched policy #${matched.priority} "${matched.name}" targeting task_type: ${matched.task_type || "*"}`,
      });
    } else {
      setTestResult({
        matchedPolicy: null,
        verdict: "allow",
        reason: `No policy explicitly targets task_type: "${testTaskType}". Evaluated clean.`,
      });
    }
  }

  const blockCount = data?.filter((p) => p.action === "block").length || 0;
  const reviewCount = data?.filter((p) => p.action === "review").length || 0;
  const allowCount = data?.filter((p) => p.action === "allow").length || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 5 Rule Engine"
        title="Firewall Policies & Safety Predicates"
        description="Configure declarative rule predicates, anti-pentesting immunity gates, and priority-ranked evaluation rules for agent payloads."
      />

      {(error || loadErr) && (
        <div className="rounded-lg border border-block/30 bg-block/10 px-4 py-3 text-[13px] text-block font-mono">
          {error || loadErr?.message}
        </div>
      )}

      {/* Policy Pipeline Visual Architecture Flow */}
      <div className="material-panel rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-5 border-b border-hairline">
          <div>
            <div className="eyebrow mb-1 flex items-center gap-1.5">
              <Layers size={13} className="text-accent" />
              <span>Layer 5 Decision Architecture</span>
            </div>
            <h2 className="text-[18px] font-bold text-ink-primary">
              Sequential Policy Evaluation Pipeline
            </h2>
            <p className="text-[12.5px] text-ink-muted mt-1 max-w-xl">
              Requests pass sequentially from lowest priority number (#10) to highest (#100+).
              The first matching declarative policy immediately determines the firewall verdict.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3.5 py-2 rounded-xl border border-block/30 bg-block/10 flex flex-col items-center min-w-[90px]">
              <span className="text-[10.5px] font-mono text-block font-bold uppercase">Block</span>
              <span className="text-[20px] font-mono font-bold text-block mt-0.5">{blockCount}</span>
            </div>
            <div className="px-3.5 py-2 rounded-xl border border-review/30 bg-review/10 flex flex-col items-center min-w-[90px]">
              <span className="text-[10.5px] font-mono text-review font-bold uppercase">Review</span>
              <span className="text-[20px] font-mono font-bold text-review mt-0.5">{reviewCount}</span>
            </div>
            <div className="px-3.5 py-2 rounded-xl border border-allow/30 bg-allow/10 flex flex-col items-center min-w-[90px]">
              <span className="text-[10.5px] font-mono text-allow font-bold uppercase">Allow</span>
              <span className="text-[20px] font-mono font-bold text-allow mt-0.5">{allowCount}</span>
            </div>
          </div>
        </div>

        {/* Visual Evaluation Stages */}
        <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div className="p-3 rounded-xl border border-hairline bg-surface-elevated flex flex-col">
            <span className="text-[10.5px] font-mono text-accent font-bold uppercase">Stage 1</span>
            <span className="text-[13px] font-semibold text-ink-primary mt-1">L0 Preflight</span>
            <span className="text-[11px] text-ink-muted mt-0.5">Canaries & Nonces</span>
          </div>
          <div className="p-3 rounded-xl border border-hairline bg-surface-elevated flex flex-col">
            <span className="text-[10.5px] font-mono text-accent font-bold uppercase">Stage 2</span>
            <span className="text-[13px] font-semibold text-ink-primary mt-1">L1 & L2 Schema</span>
            <span className="text-[11px] text-ink-muted mt-0.5">RBAC & JSON Types</span>
          </div>
          <div className="p-3 rounded-xl border border-hairline bg-surface-elevated flex flex-col">
            <span className="text-[10.5px] font-mono text-accent font-bold uppercase">Stage 3</span>
            <span className="text-[13px] font-semibold text-ink-primary mt-1">L3 Rules & SQL</span>
            <span className="text-[11px] text-ink-muted mt-0.5">Injections & Anti-Pentest</span>
          </div>
          <div className="p-3 rounded-xl border border-hairline bg-surface-elevated flex flex-col">
            <span className="text-[10.5px] font-mono text-accent font-bold uppercase">Stage 4</span>
            <span className="text-[13px] font-semibold text-ink-primary mt-1">L4 Groq AI</span>
            <span className="text-[11px] text-ink-muted mt-0.5">Intent Drift & Semantic</span>
          </div>
          <div className="p-3 rounded-xl border border-accent/40 bg-accent/10 flex flex-col ring-1 ring-accent/30">
            <span className="text-[10.5px] font-mono text-accent font-bold uppercase">Stage 5</span>
            <span className="text-[13px] font-semibold text-accent mt-1">L5 Declarative Gate</span>
            <span className="text-[11px] text-ink-primary mt-0.5">{data?.length || 0} Ranked Rules</span>
          </div>
        </div>
      </div>

      {/* Quick-Fill Security Templates */}
      <div>
        <div className="eyebrow mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-accent" />
            <span>One-Click Security Policy Presets</span>
          </div>
          <span className="text-[11px] text-ink-muted">Click any preset to auto-populate the builder below</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {POLICY_TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              onClick={() => applyTemplate(tpl)}
              className="rounded-xl border border-hairline bg-surface p-4 text-left transition-all duration-150 hover:border-hairline-strong hover:bg-surface-elevated hover:shadow-card group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${tpl.badgeColor}`}>
                  {tpl.badge}
                </span>
                <span className="text-[11px] font-mono text-ink-muted">
                  Priority #{tpl.priority}
                </span>
              </div>
              <div className="text-[13px] font-semibold text-ink-primary group-hover:text-accent transition-colors">
                {tpl.name}
              </div>
              <p className="text-[11.5px] text-ink-muted mt-1.5 leading-relaxed">
                {tpl.description}
              </p>
              <div className="mt-3 pt-2 border-t border-hairline flex items-center justify-between text-[11px] font-mono text-ink-muted">
                <span>Task: {tpl.taskType || "wildcard (*)"}</span>
                <span className="text-accent flex items-center gap-1 font-semibold">
                  Fill Form <ArrowRight size={11} />
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Sentence-style Policy Builder with Auto-Complete */}
      <div className="material-panel rounded-2xl p-6">
        <div className="eyebrow mb-3 flex items-center gap-1.5">
          <Binary size={13} className="text-accent" />
          <span>Declarative Policy Sentence Builder & Auto-Complete</span>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="p-4 rounded-xl border border-hairline-strong bg-surface-elevated text-[14px] leading-loose text-ink-primary font-medium">
            <span>When incoming task of type </span>
            <div className="relative inline-block mx-1.5">
              <input
                type="text"
                value={taskType}
                onChange={(e) => {
                  setTaskType(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="any (e.g. wire_transfer)"
                className="px-3 py-1 rounded-lg border border-hairline bg-surface text-accent font-mono text-[13px] focus:outline-none focus:border-accent w-48"
              />

              {/* Auto-Complete Dropdown */}
              <AnimatePresence>
                {showSuggestions && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="absolute z-20 top-full mt-1.5 left-0 w-72 rounded-xl border border-hairline-strong bg-surface-elevated shadow-card-hover p-1.5 max-h-56 overflow-y-auto"
                  >
                    <div className="px-2 py-1 text-[10px] font-mono text-ink-muted uppercase border-b border-hairline mb-1">
                      Suggested Task Types
                    </div>
                    {filteredSuggestions.map((s) => (
                      <button
                        key={s.type}
                        type="button"
                        onClick={() => {
                          setTaskType(s.type);
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] hover:bg-surface hover:text-accent transition-colors flex flex-col"
                      >
                        <span className="font-mono font-semibold text-ink-primary">{s.type}</span>
                        <span className="text-[10.5px] text-ink-muted">{s.desc}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <span> matches policy </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Block unverified external payouts"
              required
              className="inline-block mx-1.5 px-3 py-1 rounded-lg border border-hairline bg-surface text-ink-primary text-[13px] focus:outline-none focus:border-accent w-72"
            />
            <span> immediately set verdict to </span>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as PolicyAction)}
              className={`inline-block mx-1.5 px-3 py-1 rounded-lg border font-mono font-bold text-[12px] uppercase focus:outline-none ${
                action === "block"
                  ? "bg-block/15 text-block border-block/40"
                  : action === "allow"
                  ? "bg-allow/15 text-allow border-allow/40"
                  : "bg-review/15 text-review border-review/40"
              }`}
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a} className="bg-surface text-ink-primary">
                  {a.toUpperCase()}
                </option>
              ))}
            </select>
            <span> with evaluation priority </span>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="inline-block mx-1.5 px-2.5 py-1 rounded-lg border border-hairline bg-surface text-ink-primary font-mono text-[13px] focus:outline-none focus:border-accent w-20 text-center"
            />
            <span>.</span>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={submitting || !name.trim()}
              size="sm"
              className="gap-1.5 font-mono text-[12px]"
            >
              <Plus size={14} />
              {submitting ? "Enforcing..." : "Enforce Policy"}
            </Button>
          </div>
        </form>
      </div>

      {/* Interactive Policy Simulation Sandbox */}
      <div className="material-panel rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 eyebrow">
            <Flame size={13} className="text-warning" />
            <span>Policy Evaluation Sandbox & Live Simulator</span>
          </div>
          <span className="text-[11px] font-mono text-ink-muted">Simulate policy matches before deploying</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
          <div>
            <label className="text-[11px] font-mono text-ink-muted block mb-1">Simulated Task Type</label>
            <input
              type="text"
              value={testTaskType}
              onChange={(e) => setTestTaskType(e.target.value)}
              placeholder="e.g. wire_transfer"
              className="w-full px-3 py-1.5 rounded-lg border border-hairline bg-surface text-ink-primary font-mono text-[12.5px] focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-[11px] font-mono text-ink-muted block mb-1">Test Payload Scenario</label>
            <input
              type="text"
              value={testPayloadSummary}
              onChange={(e) => setTestPayloadSummary(e.target.value)}
              placeholder="e.g. High value transfer to offshore account"
              className="w-full px-3 py-1.5 rounded-lg border border-hairline bg-surface text-ink-primary text-[12.5px] focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={runSandboxTest}
              variant="secondary"
              size="sm"
              className="w-full gap-1.5 font-mono text-[12px]"
            >
              <Play size={13} />
              Evaluate Policy Match
            </Button>
          </div>
        </div>

        {testResult && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-4 p-3.5 rounded-xl border flex items-start gap-3 text-[13px] ${
              testResult.verdict === "block"
                ? "border-block/40 bg-block/10 text-block"
                : testResult.verdict === "allow"
                ? "border-allow/40 bg-allow/10 text-allow"
                : "border-review/40 bg-review/10 text-review"
            }`}
          >
            <div className="mt-0.5">
              {testResult.verdict === "block" ? (
                <ShieldAlert size={16} />
              ) : testResult.verdict === "allow" ? (
                <CheckCircle2 size={16} />
              ) : (
                <AlertTriangle size={16} />
              )}
            </div>
            <div className="flex-1">
              <div className="font-bold flex items-center gap-2">
                <span>Verdict: {testResult.verdict.toUpperCase()}</span>
                {testResult.matchedPolicy && (
                  <Badge variant={testResult.verdict === "block" ? "block" : "review"}>
                    Priority #{testResult.matchedPolicy.priority}
                  </Badge>
                )}
              </div>
              <p className="text-[12px] opacity-90 mt-0.5 font-mono">{testResult.reason}</p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Active Rules Grid with Filter & Search */}
      <div className="material-panel rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="eyebrow">Active Firewall Policies</span>
            <span className="text-[11px] font-mono text-ink-muted">
              {data?.length ?? 0} rules registered
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search policies..."
                className="pl-7 pr-3 py-1 rounded-lg border border-hairline bg-surface text-[12px] text-ink-primary focus:outline-none focus:border-accent w-44"
              />
            </div>

            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="rounded-lg border border-hairline bg-surface px-2.5 py-1 text-[12px] font-mono text-ink-primary focus:outline-none focus:border-accent"
              aria-label="Filter Action"
            >
              <option value="all">All Actions</option>
              <option value="block">BLOCK</option>
              <option value="review">REVIEW</option>
              <option value="allow">ALLOW</option>
            </select>
          </div>
        </div>

        {loading && !data && <TableSkeleton rows={4} cols={4} />}

        {!loading && filteredPolicies.length === 0 && (
          <EmptyState
            icon={<FileText size={24} />}
            title="No declarative policies match filter"
            description="Use the sentence builder above or one of the one-click presets to enforce strict safety boundaries."
          />
        )}

        {filteredPolicies.length > 0 && (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] uppercase tracking-wide text-ink-muted bg-surface-elevated/40">
                <th className="px-5 py-3 font-medium">Priority</th>
                <th className="px-5 py-3 font-medium">Policy Name</th>
                <th className="px-5 py-3 font-medium">Action Verdict</th>
                <th className="px-5 py-3 font-medium">Target Task Type</th>
                <th className="px-5 py-3 font-medium text-right w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPolicies.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-hairline/60 transition-colors duration-120 hover:bg-surface-elevated"
                >
                  <td className="px-5 py-3.5 font-mono text-[12px] font-bold text-accent tabular-nums">
                    #{p.priority}
                  </td>
                  <td className="px-5 py-3.5 font-medium text-ink-primary">
                    {p.name}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge
                      variant={
                        p.action === "block"
                          ? "block"
                          : p.action === "allow"
                          ? "allow"
                          : p.action === "review"
                          ? "review"
                          : "info"
                      }
                    >
                      {p.action}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-[12px] text-ink-muted">
                    {p.task_type ?? "wildcard (*)"}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => onDelete(p.id)}
                      className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-block/15 hover:text-block"
                      aria-label={`Delete ${p.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
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
