"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useSoc } from "@/components/soc/store";
import { Bar, PageHead, Panel, Stat, StatGrid, VerdictChip } from "@/components/soc/ui";

const GATES: [string, string, number][] = [
  ["L1 Rate limiter", "1.2M req", 96],
  ["L2 Preflight", "1.2M req", 92],
  ["L3 Schema", "1.1M req", 88],
  ["L4 Permissions", "1.1M req", 74],
  ["L5 Rule engine", "980K req", 61],
  ["L6 Groq guard", "940K req", 43],
];

export default function OverviewPage() {
  const { events, queue, violations, agents } = useSoc();
  const pending = queue.filter((q) => q.status === "pending").length;

  return (
    <div className="space-y-8">
      <PageHead
        index="/01"
        title="Verdict Operations"
        subtitle="Aggregate posture across the six-gate kernel. Fail mode CLOSED, all gates armed."
        action={
          <Link
            href="/dashboard/attack-demo"
            className="group inline-flex items-center gap-2 border border-ink bg-ink px-5 py-3 label-mono text-paper transition-colors hover:border-violet hover:bg-violet"
          >
            Run attack demo
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        }
      />

      <StatGrid>
        <Stat label="Requests / 24h" value="1,204,881" note="+4.2% vs yesterday" />
        <Stat label="Blocked" value="3,417" note={`${violations.filter((v) => !v.acknowledged).length} unacknowledged`} />
        <Stat label="Held for review" value={String(812 + pending)} note={`${pending} pending now`} />
        <Stat label="P99 latency" value="17.4ms" note="fail mode CLOSED" />
      </StatGrid>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Verdict stream" hint={`${events.length} events`}>
          <div className="divide-y divide-ink/10">
            {events.slice(0, 12).map((e) => (
              <div key={e.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-3 font-mono text-xs">
                <span className="shrink-0 text-muted-foreground">{e.ts}</span>
                <span className="min-w-0">
                  <span className="block truncate text-ink">{e.agent}</span>
                  <span className="block truncate text-muted-foreground">{e.intent}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-muted-foreground">{e.risk}%</span>
                  <VerdictChip verdict={e.verdict} />
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-8">
          <Panel title="Gate throughput" hint="24h">
            <div className="space-y-5">
              {GATES.map(([l, v, p]) => (
                <div key={l}>
                  <div className="flex items-baseline justify-between font-mono text-[11px]">
                    <span className="label-mono">{l}</span>
                    <span className="text-muted-foreground">{v}</span>
                  </div>
                  <div className="mt-2">
                    <Bar value={p} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="border border-ink bg-ink p-5 text-paper">
            <div className="label-mono text-paper/50">// identity ledger</div>
            <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-relaxed">{`agents.registered   = ${agents.length}
keys.ed25519        = ${agents.length}
macaroon.depth.max  = 3
nonce.cache.window  = 300s
fail.mode           = CLOSED`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
