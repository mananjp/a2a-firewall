"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dlpApi } from "@/lib/api";
import type {
  DlpRuleItem,
  DlpInspectResult,
} from "@/lib/types";
import {
  Lock,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Save,
  Layers,
  ArrowRight,
  Eye,
  Key,
  CreditCard,
} from "lucide-react";

const DATA_CLASSES = ["financial", "identity", "health", "contact", "sensitive"] as const;
const DESTINATIONS = ["external", "llm_provider", "partner", "internal"] as const;
const ACTIONS = ["allow", "redact", "tokenize", "hash", "block"] as const;

export default function DlpPage() {
  const [rules, setRules] = useState<DlpRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"policy" | "sandbox">("policy");

  // Sandbox state
  const [sandboxText, setSandboxText] = useState("");
  const [sandboxDest, setSandboxDest] = useState<string>("external");
  const [sandboxMode, setSandboxMode] = useState<"inspect" | "classify">("inspect");
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<DlpInspectResult | null>(null);

  const loadPolicy = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dlpApi.getPolicy();
      setRules(data);
    } catch (err) {
      console.error("Failed to load DLP policy:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicy();
  }, [loadPolicy]);

  const handleAddRule = () => {
    setRules((prev) => [
      ...prev,
      {
        data_class: "financial",
        destination: "external",
        action: "tokenize",
        allowed_purposes: [],
        enabled: true,
      },
    ]);
  };

  const handleRemoveRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRuleChange = (index: number, field: keyof DlpRuleItem, value: any) => {
    setRules((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSavePolicy = async () => {
    try {
      setSaving(true);
      const updated = await dlpApi.putPolicy(rules);
      setRules(updated);
      setStatusMessage("DLP policy successfully persisted to database!");
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save DLP policy:", err);
      setStatusMessage("Error saving DLP policy.");
    } finally {
      setSaving(false);
    }
  };

  const handleRunSandbox = async () => {
    if (!sandboxText.trim()) return;
    try {
      setSandboxLoading(true);
      if (sandboxMode === "inspect") {
        const res = await dlpApi.inspect(sandboxText, sandboxDest, undefined, true);
        setSandboxResult(res);
      } else {
        const res = await dlpApi.classify(sandboxText, sandboxDest);
        setSandboxResult(res);
      }
    } catch (err) {
      console.error("DLP test run failed:", err);
    } finally {
      setSandboxLoading(false);
    }
  };

  const sampleTemplates = [
    {
      name: "Credit Card & PAN",
      text: "Customer account payment: 4532-0123-4567-8910 and Indian PAN ABCDE1234F for invoice settlement.",
    },
    {
      name: "Aadhaar & SSN",
      text: "KYC onboarding data: Aadhaar 9999 8888 7777 and primary tax SSN 123-45-6789.",
    },
    {
      name: "Medical Records",
      text: "Patient MRN MRN-984719 diagnosed with type 2 diabetes under ICD-10 code E11.9.",
    },
    {
      name: "API Credentials",
      text: "Deploy webhook using Authorization Bearer sk_live_51Msz82938472918472 and contact admin@corp.org.",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data Governance & Protection"
        title="Lineage-Aware DLP & Tokenization"
        description="Destination-aware Data Loss Prevention engine with span-accurate entity classification, reversible tokenization vaulting, and derived data lineage."
        trailing={
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
            Vault Enabled
          </span>
        }
        action={
          <Button variant="secondary" size="sm" onClick={loadPolicy} disabled={loading}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        }
      />

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="material-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">Active DLP Rules</span>
            <Lock className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-ink-primary">{rules.length}</div>
            <p className="text-xs text-ink-muted mt-1">Tenant destination policies</p>
          </CardContent>
        </Card>

        <Card className="material-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">Tokenization Vault</span>
            <Key className="w-4 h-4 text-allow" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-allow">Reversible HMAC</div>
            <p className="text-xs text-ink-muted mt-1">Safe detokenization for backends</p>
          </CardContent>
        </Card>

        <Card className="material-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">Data Classes</span>
            <Layers className="w-4 h-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-ink-primary">5 Categories</div>
            <p className="text-xs text-ink-muted mt-1">Financial • Identity • Health • Contact • Sensitive</p>
          </CardContent>
        </Card>

        <Card className="material-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">Compliance Lineage</span>
            <ShieldCheck className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-ink-primary">Purpose-Bound</div>
            <p className="text-xs text-ink-muted mt-1">Inherited tags on derived outputs</p>
          </CardContent>
        </Card>
      </div>

      {statusMessage && (
        <div className="p-3 rounded-lg border border-accent/30 bg-accent/10 text-xs font-mono text-accent flex items-center justify-between">
          <span>{statusMessage}</span>
          <Button variant="secondary" size="sm" className="h-6 text-[10px]" onClick={() => setStatusMessage(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-hairline pb-2">
        <Button
          variant={activeTab === "policy" ? "default" : "secondary"}
          size="sm"
          onClick={() => setActiveTab("policy")}
          className="text-xs"
        >
          <Lock className="w-3.5 h-3.5 mr-1.5" />
          DLP Policy Matrix ({rules.length})
        </Button>
        <Button
          variant={activeTab === "sandbox" ? "default" : "secondary"}
          size="sm"
          onClick={() => setActiveTab("sandbox")}
          className="text-xs"
        >
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          Live Tokenization Sandbox
        </Button>
      </div>

      {/* Tab 1: Policy Rules Matrix */}
      {activeTab === "policy" && (
        <Card className="material-soft space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Tenant DLP Policy Rules</CardTitle>
              <p className="text-xs text-ink-muted mt-0.5">
                Define security actions triggered when classified data flows to specific external or internal destinations.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={handleAddRule} className="text-xs">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Rule
              </Button>
              <Button variant="default" size="sm" onClick={handleSavePolicy} disabled={saving} className="text-xs">
                <Save className="w-3.5 h-3.5 mr-1" />
                {saving ? "Saving..." : "Save Policy"}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto border border-hairline rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-hairline bg-surface-elevated/50 text-ink-muted font-mono uppercase">
                  <th className="p-3">Data Class</th>
                  <th className="p-3">Destination</th>
                  <th className="p-3">Enforced Action</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-ink-muted font-mono">
                      No policy rules configured. Click &ldquo;Add Rule&rdquo; above to establish destination constraints.
                    </td>
                  </tr>
                ) : (
                  rules.map((rule, idx) => (
                    <tr key={idx} className="hover:bg-surface-elevated/40">
                      <td className="p-3">
                        <select
                          className="bg-surface/80 border border-hairline rounded p-1.5 text-xs font-mono text-ink-primary"
                          value={rule.data_class}
                          onChange={(e) => handleRuleChange(idx, "data_class", e.target.value)}
                        >
                          {DATA_CLASSES.map((dc) => (
                            <option key={dc} value={dc}>
                              {dc.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3">
                        <select
                          className="bg-surface/80 border border-hairline rounded p-1.5 text-xs font-mono text-ink-primary"
                          value={rule.destination}
                          onChange={(e) => handleRuleChange(idx, "destination", e.target.value)}
                        >
                          {DESTINATIONS.map((dest) => (
                            <option key={dest} value={dest}>
                              {dest}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3">
                        <select
                          className="bg-surface/80 border border-hairline rounded p-1.5 text-xs font-mono text-ink-primary"
                          value={rule.action}
                          onChange={(e) => handleRuleChange(idx, "action", e.target.value)}
                        >
                          {ACTIONS.map((act) => (
                            <option key={act} value={act}>
                              {act.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3">
                        <label className="flex items-center gap-1.5 cursor-pointer font-mono text-xs">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(e) => handleRuleChange(idx, "enabled", e.target.checked)}
                            className="rounded border-hairline accent-accent"
                          />
                          <span>{rule.enabled ? "Enabled" : "Disabled"}</span>
                        </label>
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 w-7 p-0 text-block hover:bg-block/10"
                          onClick={() => handleRemoveRule(idx)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 2: Interactive Sandbox */}
      {activeTab === "sandbox" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Input Panel (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="material-soft space-y-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                Live DLP Evaluation Playground
              </CardTitle>
              <p className="text-xs text-ink-muted">
                Test how payloads are classified, masked, or tokenized for target destinations.
              </p>

              {/* Sample buttons */}
              <div className="flex flex-wrap gap-1.5">
                {sampleTemplates.map((tpl, i) => (
                  <Button
                    key={i}
                    variant="secondary"
                    size="sm"
                    className="text-[11px] h-6 px-2"
                    onClick={() => {
                      setSandboxText(tpl.text);
                      setSandboxResult(null);
                    }}
                  >
                    {tpl.name}
                  </Button>
                ))}
              </div>

              {/* Text Area */}
              <textarea
                className="w-full h-36 p-3 rounded-lg bg-surface/70 border border-hairline text-xs font-mono text-ink-primary resize-none focus:outline-none focus:border-accent"
                placeholder="Type or paste payload containing sensitive PII or credentials..."
                value={sandboxText}
                onChange={(e) => setSandboxText(e.target.value)}
              />

              {/* Controls */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <label className="text-ink-muted block mb-1">Target Destination:</label>
                  <select
                    className="w-full bg-surface/80 border border-hairline rounded p-1.5 text-xs font-mono text-ink-primary"
                    value={sandboxDest}
                    onChange={(e) => setSandboxDest(e.target.value)}
                  >
                    {DESTINATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-ink-muted block mb-1">Evaluation Mode:</label>
                  <select
                    className="w-full bg-surface/80 border border-hairline rounded p-1.5 text-xs font-mono text-ink-primary"
                    value={sandboxMode}
                    onChange={(e) => setSandboxMode(e.target.value as any)}
                  >
                    <option value="inspect">Transform (Tokenize / Redact)</option>
                    <option value="classify">Classify Only (Preview)</option>
                  </select>
                </div>
              </div>

              <Button
                variant="default"
                size="sm"
                className="w-full text-xs"
                onClick={handleRunSandbox}
                disabled={sandboxLoading || !sandboxText.trim()}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                {sandboxLoading ? "Evaluating..." : "Run DLP Pipeline"}
              </Button>
            </Card>
          </div>

          {/* Result Panel (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {sandboxResult ? (
              <Card className="material-soft border-hairline-strong space-y-4">
                <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-hairline">
                  <div>
                    <div className="text-xs font-mono text-ink-muted uppercase tracking-wider">
                      DLP Decision Outcome
                    </div>
                    <CardTitle className="text-sm font-mono text-ink-primary flex items-center gap-2 mt-1">
                      <span>Action:</span>
                      <Badge
                        tone={
                          sandboxResult.action === "allow"
                            ? "allow"
                            : sandboxResult.action === "block"
                            ? "block"
                            : "warning"
                        }
                      >
                        {sandboxResult.action.toUpperCase()}
                      </Badge>
                    </CardTitle>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono text-ink-muted">
                      {sandboxResult.findings.length} findings detected
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  {/* Transformed Output */}
                  <div>
                    <div className="text-xs font-mono text-ink-muted uppercase tracking-wider mb-1.5">
                      Transformed Payload ({sandboxMode === "inspect" ? "Safe for Egress" : "Preview Mode"})
                    </div>
                    <pre className="p-3 rounded-lg bg-surface-elevated border border-hairline text-xs font-mono text-ink-primary whitespace-pre-wrap leading-relaxed">
                      {sandboxResult.transformed_text || "No modification needed."}
                    </pre>
                  </div>

                  {/* Findings Breakdown */}
                  {sandboxResult.findings.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-mono text-ink-muted uppercase tracking-wider">
                        Detected Entity Spans
                      </div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {sandboxResult.findings.map((finding, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded border border-hairline bg-surface/70 text-xs font-mono flex items-center justify-between"
                          >
                            <div>
                              <span className="font-bold text-ink-primary">
                                {finding.pattern_type.toUpperCase()}
                              </span>
                              <span className="text-ink-muted ml-2">
                                (Confidence: {(finding.confidence * 100).toFixed(0)}%)
                              </span>
                              {finding.span && (
                                <span className="text-[10px] text-ink-muted ml-2">
                                  [{finding.span[0]}:{finding.span[1]}]
                                </span>
                              )}
                            </div>
                            <div className="flex gap-1">
                              {finding.framework_tags?.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surface-elevated text-accent border border-hairline"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="material-soft p-12 text-center text-ink-muted">
                Run the evaluation playground to inspect entity spans, reversible tokenizations, and policy actions.
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
