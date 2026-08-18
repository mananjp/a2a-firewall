"use client";

import { useState } from "react";
import { useSoc } from "@/components/soc/store";
import { Btn, Field, PageHead, Panel, Tag, Terminal, VerdictChip, inputCls } from "@/components/soc/ui";

const SCOPES = ["market_analytics.read", "doc.summarize", "web.fetch", "treasury.transfer", "kernel.exec"];

export default function DelegationDemoPage() {
  const { agents, workspace } = useSoc();
  const [from, setFrom] = useState(agents[0]?.name ?? "");
  const [to, setTo] = useState(agents[1]?.name ?? "");
  const [scope, setScope] = useState(SCOPES[0]!);
  const [ttl, setTtl] = useState(300);
  const [depth, setDepth] = useState(2);
  const [log, setLog] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<"ALLOW" | "BLOCK" | null>(null);

  const parent = agents.find((a) => a.name === from);

  const mint = () => {
    const parentHasScope = parent?.scopes.includes(scope) ?? false;
    const depthOk = depth <= workspace.maxDepth;
    const ok = parentHasScope && depthOk;
    setVerdict(ok ? "ALLOW" : "BLOCK");
    setLog([
      `mint macaroon  ${from} → ${to}`,
      `  root_key     = hmac256(workspace:${workspace.name})`,
      `  caveat       = scope:${scope}`,
      `  caveat       = exp<=${ttl}s`,
      `  caveat       = depth<=${depth}`,
      `  parent_scope = ${parent?.scopes.join(", ") || "none"}`,
      `  attenuation  = ${parentHasScope ? "OK (subset of parent)" : "FAIL (widens parent scope)"}`,
      `  depth_check  = ${depthOk ? `OK (${depth}<=${workspace.maxDepth})` : `FAIL (${depth}>${workspace.maxDepth})`}`,
      `  verdict      = ${ok ? "ALLOW — token issued" : "BLOCK — delegation refused, fail-closed"}`,
    ]);
  };

  return (
    <div className="space-y-8">
      <PageHead
        index="/04"
        title="Delegation Demo"
        subtitle="Mint a sub-delegated macaroon and watch L4 permissions enforce attenuation live."
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Mint delegation" hint="interactive">
          <div className="space-y-5">
            <Field label="Delegating agent">
              <select className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)}>
                {agents.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Receiving agent">
              <select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)}>
                {agents.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Requested scope">
              <select className={inputCls} value={scope} onChange={(e) => setScope(e.target.value)}>
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={`TTL ${ttl}s`}>
                <input
                  type="range"
                  min={30}
                  max={900}
                  step={30}
                  value={ttl}
                  onChange={(e) => setTtl(Number(e.target.value))}
                  className="w-full accent-violet"
                />
              </Field>
              <Field label={`Depth ${depth}`}>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={depth}
                  onChange={(e) => setDepth(Number(e.target.value))}
                  className="w-full accent-violet"
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Btn variant="solid" onClick={mint}>
                Mint & verify
              </Btn>
              <Btn
                onClick={() => {
                  setLog([]);
                  setVerdict(null);
                }}
              >
                Reset
              </Btn>
            </div>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Parent capability" hint={from}>
            <div className="flex flex-wrap gap-2">
              {(parent?.scopes ?? []).map((s) => (
                <Tag key={s} tone="lime">
                  {s}
                </Tag>
              ))}
              {!parent?.scopes.length && (
                <span className="font-mono text-xs text-muted-foreground">// no scopes</span>
              )}
            </div>
          </Panel>
          <Terminal title="delegation trace" lines={log} />
          {verdict && (
            <div
              className={`flex flex-wrap items-center gap-3 border border-ink px-4 py-4 ${
                verdict === "ALLOW"
                  ? "bg-lime text-lime-foreground"
                  : "bg-danger text-destructive-foreground"
              }`}
            >
              <VerdictChip verdict={verdict} />
              <span className="font-mono text-xs">
                {verdict === "ALLOW"
                  ? `Token issued to ${to} — expires in ${ttl}s.`
                  : "Delegation refused at L4 permissions."}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
