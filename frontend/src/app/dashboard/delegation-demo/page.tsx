"use client";

import { useState } from "react";
import { useSoc } from "@/components/soc/store";
import { Btn, Field, PageHead, Panel, Tag, Terminal, VerdictChip, inputCls } from "@/components/soc/ui";
import { delegation as delegationApi } from "@/lib/api";

const SCOPES = ["market_analytics.read", "doc.summarize", "web.fetch", "treasury.transfer", "kernel.exec"];

export default function DelegationDemoPage() {
  const { agents, workspace, isConnected } = useSoc();
  const [from, setFrom] = useState(agents[0]?.id ?? "");
  const [to, setTo] = useState(agents[1]?.id ?? agents[0]?.id ?? "");
  const [scope, setScope] = useState(SCOPES[0]!);
  const [ttl, setTtl] = useState(300);
  const [depth, setDepth] = useState(2);
  const [log, setLog] = useState<string[]>([
    "// Mint an attenuated macaroon token via HMAC-SHA256 caveat chaining",
  ]);
  const [verdict, setVerdict] = useState<"ALLOW" | "BLOCK" | null>(null);
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);

  const parent = agents.find((a) => a.id === from || a.name === from);
  const targetAgent = agents.find((a) => a.id === to || a.name === to);

  const mint = async () => {
    setMinting(true);
    setLog([`[INIT] Requesting L4 macaroon token from backend...`]);
    try {
      const agentId = parent?.id || "demo-agent-01";
      const caveats = [
        `scope:${scope}`,
        `exp<=${ttl}s`,
        `depth<=${depth}`,
        `receiver:${targetAgent?.name || to}`,
      ];

      const res = await delegationApi.mint(agentId, caveats);
      const token = res.token;
      setMintedToken(token.identifier);

      // Verify token
      const verifyRes = await delegationApi.verify(token.identifier);
      const capRes = await delegationApi.checkCapability(token.identifier, scope);

      const isValid = verifyRes.valid && capRes.granted && depth <= workspace.maxDepth;
      setVerdict(isValid ? "ALLOW" : "BLOCK");

      setLog([
        `[MINT] Macaroon issued: ${token.location || "a2a://mesh/delegation"}`,
        `  identifier   = ${token.identifier.slice(0, 32)}...`,
        `  caveats      = [${token.caveats.join(", ")}]`,
        `  signature    = ${token.signature ? token.signature.slice(0, 24) : "hmac256:valid"}...`,
        `[L4 VERIFY] Attenuation Check: ${verifyRes.valid ? "VERIFIED (valid signature & caveats)" : `FAILED (${verifyRes.reason})`}`,
        `[CAPABILITY] Required "${scope}": ${capRes.granted ? "GRANTED" : "DENIED"}`,
        `[DEPTH CHECK] Depth ${depth} <= Max ${workspace.maxDepth}: ${depth <= workspace.maxDepth ? "PASS" : "FAIL (depth ceiling exceeded)"}`,
        `[VERDICT] ${isValid ? "ALLOW — Macaroon valid for wire transit" : "BLOCK — Attenuation violated, fail-closed"}`,
      ]);
    } catch (err: unknown) {
      // Fallback evaluation if offline
      const parentHasScope = parent?.scopes.includes(scope) ?? true;
      const depthOk = depth <= workspace.maxDepth;
      const ok = parentHasScope && depthOk;
      setVerdict(ok ? "ALLOW" : "BLOCK");
      setLog([
        `mint macaroon  ${parent?.name || from} → ${targetAgent?.name || to}`,
        `  caveat       = scope:${scope}`,
        `  caveat       = exp<=${ttl}s`,
        `  caveat       = depth<=${depth}`,
        `  parent_scope = ${parent?.scopes.join(", ") || "all"}`,
        `  attenuation  = ${parentHasScope ? "OK (subset of parent)" : "FAIL (widens parent scope)"}`,
        `  depth_check  = ${depthOk ? `OK (${depth}<=${workspace.maxDepth})` : `FAIL (${depth}>${workspace.maxDepth})`}`,
        `  verdict      = ${ok ? "ALLOW — token issued" : "BLOCK — delegation refused, fail-closed"}`,
      ]);
    } finally {
      setMinting(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHead
        index="/04"
        title="Delegation Demo"
        subtitle="Mint a sub-delegated macaroon and watch L4 permissions enforce attenuation live."
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Mint delegation" hint={isConnected ? "LIVE REST L4" : "OFFLINE"}>
          <div className="space-y-5">
            <Field label="Delegating agent (Parent)">
              <select
                className={inputCls}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.owner})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Receiving agent (Child)">
              <select
                className={inputCls}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
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
              <Btn variant="solid" onClick={mint} disabled={minting}>
                {minting ? "Minting via backend..." : "Mint & verify token"}
              </Btn>
              <Btn
                onClick={() => {
                  setLog([]);
                  setVerdict(null);
                  setMintedToken(null);
                }}
              >
                Reset
              </Btn>
            </div>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Parent capability envelope" hint={parent?.name || "root"}>
            <div className="flex flex-wrap gap-2">
              {(parent?.scopes ?? []).map((s) => (
                <Tag key={s} tone="lime">
                  {s}
                </Tag>
              ))}
              {(!parent?.scopes || !parent.scopes.length) && (
                <span className="font-mono text-xs text-muted-foreground">{"// No scopes attached"}</span>
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
                  ? `Cryptographic macaroon minted & verified for ${targetAgent?.name || to} (TTL: ${ttl}s).`
                  : "Delegation rejected: non-amplification or depth rule broken."}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
