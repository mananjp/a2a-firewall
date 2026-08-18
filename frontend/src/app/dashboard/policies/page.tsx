"use client";

import { useState } from "react";
import { useSoc } from "@/components/soc/store";
import { Bar, Btn, PageHead, Panel, Stat, StatGrid, Tag, Terminal, VerdictChip } from "@/components/soc/ui";

export default function PoliciesPage() {
  const { policies, togglePolicy } = useSoc();
  const [gate, setGate] = useState("ALL");
  const gates = ["ALL", "L1", "L2", "L3", "L4", "L5", "L6"];
  const rows = policies.filter((p) => gate === "ALL" || p.gate === gate);
  const maxHits = Math.max(...policies.map((p) => p.hits));

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
        <Panel title="Rule set" hint={`${rows.length} rules`}>
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
                <Btn variant={p.enabled ? "lime" : "outline"} onClick={() => togglePolicy(p.id)}>
                  {p.enabled ? "Enabled" : "Disabled"}
                </Btn>
              </div>
            ))}
          </div>
        </Panel>

        <Terminal
          title="policy.compiled"
          lines={[
            "# a2a-firewall policy bundle",
            ...policies.map((p) => `${p.enabled ? "" : "# "}${p.gate}  ${p.action.padEnd(6)} ${p.id}  ${p.name}`),
            "",
            `active_rules = ${policies.filter((p) => p.enabled).length}`,
            "fail_mode    = CLOSED",
          ]}
        />
      </div>
    </div>
  );
}
