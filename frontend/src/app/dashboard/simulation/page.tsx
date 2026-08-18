"use client";

import { useState } from "react";
import { useSoc } from "@/components/soc/store";
import { Bar, Btn, Field, PageHead, Panel, Stat, StatGrid, Terminal, VerdictChip, inputCls } from "@/components/soc/ui";

export default function SimulationPage() {
  const { policies, workspace } = useSoc();
  const [volume, setVolume] = useState(10000);
  const [injection, setInjection] = useState(12);
  const [depth, setDepth] = useState(3);
  const [strict, setStrict] = useState(true);
  const [result, setResult] = useState<{ allow: number; review: number; block: number; p99: number } | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const active = policies.filter((p) => p.enabled).length;

  const run = () => {
    const blockRate = Math.min(0.6, (injection / 100) * (strict ? 1 : 0.55) + (depth > workspace.maxDepth ? 0.08 : 0.01));
    const reviewRate = Math.min(0.3, 0.04 + (injection / 100) * 0.35 + (active < 5 ? 0.05 : 0));
    const block = Math.round(volume * blockRate);
    const review = Math.round(volume * reviewRate);
    const allow = volume - block - review;
    const p99 = Number((11 + active * 1.1 + (strict ? 2.4 : 0)).toFixed(1));
    setResult({ allow, review, block, p99 });
    setLog([
      `simulate  n=${volume} injection=${injection}% depth=${depth} strict=${strict}`,
      `  policies.active   = ${active}/${policies.length}`,
      `  gate.L4.max_depth = ${workspace.maxDepth}`,
      `  allow             = ${allow} (${((allow / volume) * 100).toFixed(1)}%)`,
      `  review            = ${review} (${((review / volume) * 100).toFixed(1)}%)`,
      `  block             = ${block} (${((block / volume) * 100).toFixed(1)}%)`,
      `  p99_latency       = ${p99}ms`,
      `  verdict           = ${block / volume > 0.25 ? "POLICY TOO TIGHT — expect churn" : "HEALTHY"}`,
    ]);
  };

  return (
    <div className="space-y-8">
      <PageHead
        index="/07"
        title="Simulation"
        subtitle="Replay synthetic mesh traffic against the current ruleset before promoting it to production."
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Parameters" hint="dry run">
          <div className="space-y-5">
            <Field label={`Request volume — ${volume.toLocaleString()}`}>
              <input
                type="range"
                min={1000}
                max={100000}
                step={1000}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full accent-violet"
              />
            </Field>
            <Field label={`Injection rate — ${injection}%`}>
              <input
                type="range"
                min={0}
                max={60}
                value={injection}
                onChange={(e) => setInjection(Number(e.target.value))}
                className="w-full accent-violet"
              />
            </Field>
            <Field label={`Max delegation depth — ${depth}`}>
              <input
                type="range"
                min={1}
                max={6}
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="w-full accent-violet"
              />
            </Field>
            <Field label="Semantic gate mode">
              <select
                className={inputCls}
                value={strict ? "strict" : "lenient"}
                onChange={(e) => setStrict(e.target.value === "strict")}
              >
                <option value="strict">strict — block on drift &gt; 0.75</option>
                <option value="lenient">lenient — review on drift &gt; 0.75</option>
              </select>
            </Field>
            <div className="flex gap-2">
              <Btn variant="solid" onClick={run}>
                Run simulation
              </Btn>
              <Btn
                onClick={() => {
                  setResult(null);
                  setLog([]);
                }}
              >
                Clear
              </Btn>
            </div>
          </div>
        </Panel>

        <div className="space-y-6">
          {result && (
            <>
              <StatGrid>
                <Stat label="Allowed" value={result.allow.toLocaleString()} />
                <Stat label="Review" value={result.review.toLocaleString()} />
                <Stat label="Blocked" value={result.block.toLocaleString()} />
                <Stat label="P99" value={`${result.p99}ms`} />
              </StatGrid>
              <Panel title="Outcome distribution">
                <div className="space-y-4">
                  {(
                    [
                      ["Allow", result.allow, "lime"],
                      ["Review", result.review, "violet"],
                      ["Block", result.block, "danger"],
                    ] as const
                  ).map(([l, v, tone]) => (
                    <div key={l}>
                      <div className="flex justify-between font-mono text-[11px]">
                        <span className="label-mono">{l}</span>
                        <span className="text-muted-foreground">{((v / volume) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="mt-2">
                        <Bar value={(v / volume) * 100} tone={tone} />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
              <div className="flex items-center gap-3 border border-ink px-4 py-3">
                <VerdictChip verdict={result.block / volume > 0.25 ? "BLOCK" : "ALLOW"} />
                <span className="font-mono text-xs">
                  {result.block / volume > 0.25
                    ? "Ruleset rejects over a quarter of traffic — review policy scope."
                    : "Ruleset is within healthy operating bounds."}
                </span>
              </div>
            </>
          )}
          <Terminal title="simulation" lines={log} />
        </div>
      </div>
    </div>
  );
}
