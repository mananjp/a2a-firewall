"use client";

import { useState } from "react";
import { useSoc } from "@/components/soc/store";
import { PageHead, Panel, Stat, StatGrid, Tag, Terminal, inputCls } from "@/components/soc/ui";

export default function DelegationAuditPage() {
  const { delegations, workspace } = useSoc();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(delegations[0]?.id ?? null);

  const rows = delegations.filter((d) =>
    (d.chain.join(" ") + d.scopes.join(" ")).toLowerCase().includes(q.toLowerCase())
  );
  const open = delegations.find((d) => d.id === openId) ?? null;

  return (
    <div className="space-y-8">
      <PageHead
        index="/03"
        title="Delegation Audit"
        subtitle="Every macaroon issued in the mesh, with its attenuation chain and caveat proofs."
      />

      <StatGrid>
        <Stat label="Active chains" value={String(delegations.length)} />
        <Stat label="Invalid" value={String(delegations.filter((d) => !d.valid).length)} note="fail-closed" />
        <Stat label="Max depth" value={String(workspace.maxDepth)} />
        <Stat
          label="Avg caveats"
          value={(delegations.reduce((a, d) => a + d.caveats.length, 0) / delegations.length).toFixed(1)}
        />
      </StatGrid>

      <input
        className={`${inputCls} max-w-sm`}
        placeholder="search chain or scope…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="Delegation chains" hint={`${rows.length} records`}>
          <div className="divide-y divide-ink/10">
            {rows.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setOpenId(d.id)}
                className={`block w-full py-4 text-left ${openId === d.id ? "bg-secondary" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                  <span className="text-muted-foreground">{d.id}</span>
                  <Tag tone={d.valid ? "lime" : "danger"}>{d.valid ? "valid" : "revoked"}</Tag>
                  <span className="text-muted-foreground">depth {d.depth}</span>
                  <span className="ml-auto text-muted-foreground">{d.issued}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs">
                  {d.chain.map((c, i) => (
                    <span key={c} className="flex items-center gap-2">
                      {i > 0 && <span className="text-violet">→</span>}
                      <span className="border border-ink/25 px-2 py-0.5">{c}</span>
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Caveat inspection" hint={open?.id ?? "—"}>
            {open ? (
              <ul className="space-y-2 font-mono text-xs">
                {open.caveats.map((c) => (
                  <li key={c} className="flex items-center justify-between border border-ink/20 px-3 py-2">
                    <span>{c}</span>
                    <Tag tone="lime">enforced</Tag>
                  </li>
                ))}
                <li className="flex items-center justify-between border border-ink/20 px-3 py-2">
                  <span>scopes: {open.scopes.join(", ")}</span>
                  <Tag tone={open.valid ? "lime" : "danger"}>{open.valid ? "in chain" : "escalation"}</Tag>
                </li>
              </ul>
            ) : (
              <p className="font-mono text-xs text-muted-foreground">// select a chain</p>
            )}
          </Panel>

          <Terminal
            title="macaroon verify"
            lines={
              open
                ? [
                    `verify ${open.id}`,
                    `  root_key   = hmac256(workspace:${workspace.name})`,
                    ...open.caveats.map((c) => `  caveat     = ${c} ✓`),
                    `  depth      = ${open.depth}/${workspace.maxDepth}`,
                    `  result     = ${open.valid ? "VERIFIED" : "REJECTED (scope not attenuated)"}`,
                  ]
                : []
            }
          />
        </div>
      </div>
    </div>
  );
}
