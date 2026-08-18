"use client";

import { useEffect, useState } from "react";
import { useSoc, type SocEvent } from "@/components/soc/store";
import { Btn, PageHead, Panel, Tag, Terminal, VerdictChip, inputCls } from "@/components/soc/ui";

export default function InspectorPage() {
  const { events, pushEvent } = useSoc();
  const [live, setLive] = useState(true);
  const [filter, setFilter] = useState("");
  const [verdict, setVerdict] = useState("ALL");
  const [selected, setSelected] = useState<SocEvent | null>(events[0] ?? null);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(pushEvent, 2200);
    return () => clearInterval(id);
  }, [live, pushEvent]);

  const rows = events.filter(
    (e) =>
      (verdict === "ALL" || e.verdict === verdict) &&
      (filter === "" || (e.agent + e.intent).toLowerCase().includes(filter.toLowerCase())),
  );

  return (
    <div className="space-y-8">
      <PageHead
        index="/02"
        title="Live Inspector"
        subtitle="Every envelope crossing the mesh, decoded gate by gate with cryptographic lineage."
        action={
          <div className="flex gap-2">
            <Btn variant={live ? "lime" : "outline"} onClick={() => setLive((l) => !l)}>
              {live ? "Streaming" : "Paused"}
            </Btn>
            <Btn variant="solid" onClick={pushEvent}>
              Inject request
            </Btn>
          </div>
        }
      />

      <div className="flex flex-wrap gap-3">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="filter agent or intent…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {["ALL", "ALLOW", "REVIEW", "BLOCK"].map((v) => (
          <Btn key={v} variant={verdict === v ? "solid" : "outline"} onClick={() => setVerdict(v)}>
            {v}
          </Btn>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Request stream" hint={`${rows.length} matches`}>
          <div className="max-h-[520px] divide-y divide-ink/10 overflow-y-auto">
            {rows.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelected(e)}
                className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-3 text-left font-mono text-xs transition-colors ${
                  selected?.id === e.id ? "bg-secondary" : "hover:bg-secondary/60"
                }`}
              >
                <span className="shrink-0 text-muted-foreground">{e.ts}</span>
                <span className="min-w-0">
                  <span className="block truncate">{e.agent}</span>
                  <span className="block truncate text-muted-foreground">{e.intent}</span>
                </span>
                <VerdictChip verdict={e.verdict} />
              </button>
            ))}
            {!rows.length && <p className="py-6 font-mono text-xs text-muted-foreground">// no matching requests</p>}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Envelope detail" hint={selected?.id ?? "—"}>
            {selected ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <VerdictChip verdict={selected.verdict} />
                  <Tag tone={selected.risk > 70 ? "danger" : selected.risk > 30 ? "violet" : "lime"}>
                    risk {selected.risk}%
                  </Tag>
                  <Tag>gate {selected.gate}</Tag>
                  <Tag>depth {selected.depth}</Tag>
                </div>
                <dl className="grid grid-cols-2 gap-y-2 font-mono text-[11px]">
                  {[
                    ["agent", selected.agent],
                    ["intent", selected.intent],
                    ["nonce", selected.nonce],
                    ["latency", `${selected.latency}ms`],
                    ["timestamp", selected.ts],
                    ["signature", "ed25519:valid"],
                  ].map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="truncate">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="font-mono text-[11px] text-muted-foreground">{selected.reason}</p>
              </div>
            ) : (
              <p className="font-mono text-xs text-muted-foreground">// select a request</p>
            )}
          </Panel>

          <Terminal
            title="gate trace"
            lines={
              selected
                ? [
                    `L1 rate_limiter    ok  ${selected.latency.toFixed(1)}ms window 600rpm`,
                    `L2 preflight       ok  nonce ${selected.nonce} fresh`,
                    `L3 schema          ok  ${selected.intent}@v2`,
                    `L4 permissions     ${selected.verdict === "BLOCK" ? "DENY caveat chain mismatch" : "ok  caveat chain intact"}`,
                    `L5 rules           ${selected.verdict === "REVIEW" ? "SOFT flag → review queue" : "0 deny rules matched"}`,
                    `L6 groq_guard      drift ${(selected.risk / 100).toFixed(2)} → ${selected.verdict}`,
                  ]
                : []
            }
          />
        </div>
      </div>
    </div>
  );
}
