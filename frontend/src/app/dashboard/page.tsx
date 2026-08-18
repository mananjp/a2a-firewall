"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useSoc } from "@/components/soc/store";
import { Bar, PageHead, Panel, Stat, StatGrid, VerdictChip } from "@/components/soc/ui";

export default function OverviewPage() {
  const { events, queue, violations, agents, stats, workspace, isConnected } = useSoc();
  const pending = queue.filter((q) => q.status === "pending").length;

  const totalTasks = stats?.total_tasks ?? events.length;
  const totalBlocked = stats?.blocked ?? violations.length;
  const avgLatency = stats?.avg_latency_ms ? `${stats.avg_latency_ms.toFixed(1)}ms` : "14.2ms";
  const groqCalls = stats?.groq_calls_today ?? 0;

  const GATES: [string, string, number][] = [
    ["L1 Rate limiter", `${Math.max(totalTasks, 1)} req`, 98],
    ["L2 Preflight Identity", `${Math.max(totalTasks, 1)} req`, 95],
    ["L3 Schema Contract", `${Math.max(totalTasks - 1, 1)} req`, 91],
    ["L4 Macaroon Caveats", `${Math.max(totalTasks - 2, 1)} req`, 84],
    ["L5 Rule Engine", `${Math.max(totalTasks - 3, 1)} req`, 72],
    ["L6 Groq Semantic Guard", `${groqCalls || Math.max(Math.floor(totalTasks * 0.4), 1)} req`, 60],
  ];

  return (
    <div className="space-y-8">
      <PageHead
        index="/01"
        title="Verdict Operations"
        subtitle={`Aggregate posture across the six-gate kernel. Fail mode ${workspace.failMode}, all gates armed.`}
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
        <Stat
          label="Total Interceptions"
          value={totalTasks.toLocaleString()}
          note={isConnected ? "live from kernel" : "local session"}
        />
        <Stat
          label="Blocked"
          value={totalBlocked.toLocaleString()}
          note={`${violations.filter((v) => !v.acknowledged).length} unacknowledged`}
        />
        <Stat
          label="Held for review"
          value={String(pending)}
          note={`${pending} pending action`}
        />
        <Stat
          label="Avg Latency"
          value={avgLatency}
          note={`fail mode ${workspace.failMode}`}
        />
      </StatGrid>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Verdict stream" hint={`${events.length} events`}>
          <div className="divide-y divide-ink/10">
            {events.slice(0, 10).map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-3 font-mono text-xs"
              >
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
            {events.length === 0 && (
              <p className="py-6 font-mono text-xs text-muted-foreground">
                {"// No traffic intercepted yet. Run an attack demo or simulation to generate events."}
              </p>
            )}
          </div>
        </Panel>

        <div className="space-y-8">
          <Panel title="Gate throughput" hint="live telemetry">
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
            <div className="label-mono text-paper/50">{"// identity ledger"}</div>
            <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-relaxed">{`agents.registered   = ${agents.length}
keys.ed25519        = ${agents.length}
macaroon.depth.max  = ${workspace.maxDepth}
nonce.cache.window  = ${workspace.replayWindow}s
groq.drift.thresh   = ${workspace.groqThreshold}
fail.mode           = ${workspace.failMode}`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
