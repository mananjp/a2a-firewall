"use client";

import { useState } from "react";
import { useSoc } from "@/components/soc/store";
import { Btn, PageHead, Panel, Stat, StatGrid, Tag, inputCls } from "@/components/soc/ui";

const SEV = ["all", "critical", "high", "medium", "low"] as const;

export default function ViolationsPage() {
  const { violations, ackViolation } = useSoc();
  const [sev, setSev] = useState<(typeof SEV)[number]>("all");
  const [q, setQ] = useState("");

  const rows = violations.filter(
    (v) => (sev === "all" || v.severity === sev) && (v.agent + v.rule).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <PageHead
        index="/06"
        title="Violations"
        subtitle="Immutable ledger of every deny-rule hit, keyed by gate, agent and severity."
      />

      <StatGrid>
        <Stat label="Total" value={String(violations.length)} />
        <Stat
          label="Critical"
          value={String(violations.filter((v) => v.severity === "critical").length)}
        />
        <Stat
          label="Unacknowledged"
          value={String(violations.filter((v) => !v.acknowledged).length)}
        />
        <Stat label="Top gate" value="L4" note="permissions" />
      </StatGrid>

      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="search rule or agent…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {SEV.map((s) => (
          <Btn key={s} variant={sev === s ? "solid" : "outline"} onClick={() => setSev(s)}>
            {s}
          </Btn>
        ))}
      </div>

      <Panel title="Violation ledger" hint={`${rows.length} records`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-ink/20 text-left label-mono text-muted-foreground">
                <th className="py-2 pr-4">ID</th>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Agent</th>
                <th className="py-2 pr-4">Rule</th>
                <th className="py-2 pr-4">Gate</th>
                <th className="py-2 pr-4">Severity</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className="border-b border-ink/10">
                  <td className="py-3 pr-4 text-muted-foreground">{v.id}</td>
                  <td className="py-3 pr-4">{v.ts}</td>
                  <td className="py-3 pr-4">{v.agent}</td>
                  <td className="py-3 pr-4">{v.rule}</td>
                  <td className="py-3 pr-4">{v.gate}</td>
                  <td className="py-3 pr-4">
                    <Tag
                      tone={
                        v.severity === "critical" || v.severity === "high"
                          ? "danger"
                          : v.severity === "medium"
                            ? "violet"
                            : "muted"
                      }
                    >
                      {v.severity}
                    </Tag>
                  </td>
                  <td className="py-3">
                    {v.acknowledged ? (
                      <Tag tone="lime">acked</Tag>
                    ) : (
                      <Btn onClick={() => ackViolation(v.id)}>Acknowledge</Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="py-6 font-mono text-xs text-muted-foreground">// no violations match</p>}
        </div>
      </Panel>
    </div>
  );
}
