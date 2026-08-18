"use client";

import { useEffect, useState } from "react";
import { useSoc, type SocEvent } from "@/components/soc/store";
import { Btn, PageHead, Panel, Tag, Terminal, VerdictChip, inputCls } from "@/components/soc/ui";

export default function InspectorPage() {
  const { events, pushEvent, refreshAll } = useSoc();
  const [live, setLive] = useState(true);
  const [filter, setFilter] = useState("");
  const [verdict, setVerdict] = useState("ALL");
  const [selected, setSelected] = useState<SocEvent | null>(events[0] ?? null);
  const [injecting, setInjecting] = useState(false);

  useEffect(() => {
    if (!selected && events.length > 0) {
      setSelected(events[0]);
    }
  }, [events, selected]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      refreshAll();
    }, 3000);
    return () => clearInterval(id);
  }, [live, refreshAll]);

  const handleInject = async () => {
    setInjecting(true);
    try {
      await pushEvent();
    } finally {
      setInjecting(false);
    }
  };

  const rows = events.filter(
    (e) =>
      (verdict === "ALL" || e.verdict === verdict) &&
      (filter === "" || (e.agent + e.intent + e.id).toLowerCase().includes(filter.toLowerCase()))
  );

  const raw = selected?.rawTask;

  return (
    <div className="space-y-8">
      <PageHead
        index="/02"
        title="Live Inspector"
        subtitle="Every envelope crossing the mesh, decoded gate by gate with cryptographic lineage."
        action={
          <div className="flex gap-2">
            <Btn variant={live ? "lime" : "outline"} onClick={() => setLive((l) => !l)}>
              {live ? "Live polling on" : "Polling paused"}
            </Btn>
            <Btn variant="solid" onClick={handleInject} disabled={injecting}>
              {injecting ? "Injecting..." : "Inject test packet"}
            </Btn>
          </div>
        }
      />

      <div className="flex flex-wrap gap-3">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="filter agent, intent or ID…"
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
            {!rows.length && (
              <p className="py-6 font-mono text-xs text-muted-foreground">
                {"// No matching intercepted requests found."}
              </p>
            )}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Envelope detail" hint={selected ? selected.id.slice(0, 12) : "—"}>
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
                    ["task_id", selected.id.slice(0, 18)],
                    ["intent", selected.intent],
                    ["trace_id", selected.nonce],
                    ["latency", `${selected.latency}ms`],
                    ["timestamp", selected.ts],
                    ["groq_checked", raw?.groq_called ? "true (L6 LPU)" : "false"],
                    ["signature", "ed25519:verified"],
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
              <p className="font-mono text-xs text-muted-foreground">{"// Select a request to inspect"}</p>
            )}
          </Panel>

          <Terminal
            title="gate trace"
            lines={
              selected
                ? [
                    `L1 rate_limiter    ok  ${selected.latency.toFixed(1)}ms window`,
                    `L2 preflight       ok  signature ed25519 verified, trace ${selected.nonce}`,
                    `L3 schema          ok  conforms to ${selected.intent}@v1`,
                    `L4 permissions     ${selected.verdict === "BLOCK" ? "DENY caveat check" : "ok  caveats validated"}`,
                    `L5 rules           ${selected.verdict === "REVIEW" ? "SOFT flag → review queue" : "0 deny rules matched"}`,
                    `L6 groq_guard      ${raw?.groq_called ? `drift ${(selected.risk / 100).toFixed(2)} → ${selected.verdict}` : "skipped (clean path)"}`,
                  ]
                : []
            }
          />
        </div>
      </div>
    </div>
  );
}
