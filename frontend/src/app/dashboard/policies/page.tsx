"use client";

import { useState } from "react";
import { useSoc, type Verdict } from "@/components/soc/store";
import { Bar, Btn, Field, PageHead, Panel, Stat, StatGrid, Tag, Terminal, VerdictChip, inputCls } from "@/components/soc/ui";

export default function PoliciesPage() {
  const { policies, togglePolicy, addPolicy, deletePolicy, isConnected } = useSoc();
  const [gate, setGate] = useState("ALL");
  const [name, setName] = useState("");
  const [selectedGate, setSelectedGate] = useState("L5");
  const [action, setAction] = useState<Verdict>("BLOCK");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const gates = ["ALL", "L1", "L2", "L3", "L4", "L5", "L6"];
  const rows = policies.filter((p) => gate === "ALL" || p.gate === gate);
  const maxHits = Math.max(...policies.map((p) => p.hits), 1);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await addPolicy({
        name: name.trim(),
        gate: selectedGate,
        action,
        description: description.trim() || `Enforce ${name.trim()} policy`,
      });
      setName("");
      setDescription("");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    try {
      await togglePolicy(id);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setTogglingId(id);
    try {
      await deletePolicy(id);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHead
        index="/11"
        title="Firewall Policies"
        subtitle="Declarative deny rules compiled into the kernel. Changes take effect on the next envelope."
      />

      <StatGrid>
        <Stat label="Rules" value={String(policies.length)} />
        <Stat label="Enabled" value={String(policies.filter((p) => p.enabled).length)} />
        <Stat label="Blocking" value={String(policies.filter((p) => p.action === "BLOCK").length)} />
        <Stat label="Hits / 24h" value={policies.reduce((a, p) => a + p.hits, 0).toLocaleString()} />
      </StatGrid>

      <div className="flex flex-wrap gap-2">
        {gates.map((g) => (
          <Btn key={g} variant={gate === g ? "solid" : "outline"} onClick={() => setGate(g)}>
            {g}
          </Btn>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Rule set" hint={`${rows.length} rules (${isConnected ? "Live REST" : "Local"})`}>
          <div className="divide-y divide-ink/10">
            {rows.map((p) => (
              <div key={p.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-bold uppercase">{p.name}</span>
                    <Tag>{p.gate}</Tag>
                    <VerdictChip verdict={p.action} />
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{p.description}</p>
                  <div className="mt-2 max-w-xs">
                    <Bar value={(p.hits / maxHits) * 100} tone={p.enabled ? "violet" : "danger"} />
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {p.hits.toLocaleString()} hits / 24h
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Btn
                    variant={p.enabled ? "lime" : "outline"}
                    disabled={togglingId === p.id}
                    onClick={() => handleToggle(p.id)}
                  >
                    {p.enabled ? "Active" : "Disabled"}
                  </Btn>
                  <Btn
                    variant="danger"
                    disabled={togglingId === p.id}
                    onClick={() => handleDelete(p.id)}
                  >
                    Delete
                  </Btn>
                </div>
              </div>
            ))}
            {!rows.length && (
              <p className="py-6 font-mono text-xs text-muted-foreground">
                {"// No policies configured for "}{gate}{". Add a new policy below."}
              </p>
            )}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Add policy rule" hint="compiles to kernel">
            <form className="space-y-4" onSubmit={handleCreate}>
              <Field label="Rule name">
                <input
                  className={inputCls}
                  placeholder="e.g. deny_treasury_unbound"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Gate layer">
                  <select
                    className={inputCls}
                    value={selectedGate}
                    onChange={(e) => setSelectedGate(e.target.value)}
                  >
                    {["L1", "L2", "L3", "L4", "L5", "L6"].map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Action">
                  <select
                    className={inputCls}
                    value={action}
                    onChange={(e) => setAction(e.target.value as Verdict)}
                  >
                    <option value="BLOCK">BLOCK</option>
                    <option value="REVIEW">REVIEW</option>
                    <option value="ALLOW">ALLOW</option>
                  </select>
                </Field>
              </div>
              <Field label="Rule description">
                <input
                  className={inputCls}
                  placeholder="Human explanation of rule trigger condition"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              <Btn type="submit" variant="solid" className="w-full" disabled={creating}>
                {creating ? "Adding rule..." : "Deploy rule to kernel"}
              </Btn>
            </form>
          </Panel>

          <Terminal
            title="policy.compiled"
            lines={[
              "# a2a-firewall compiled ruleset",
              ...policies.map((p) => `${p.enabled ? "" : "# "}${p.gate}  ${p.action.padEnd(6)} ${p.id.slice(0, 8)}  ${p.name}`),
              "",
              `active_rules = ${policies.filter((p) => p.enabled).length}`,
              "fail_mode    = CLOSED",
            ]}
          />
        </div>
      </div>
    </div>
  );
}
