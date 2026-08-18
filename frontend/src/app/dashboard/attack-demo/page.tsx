"use client";

import { Sandbox } from "@/components/site/Sandbox";
import { PageHead, Panel, Stat, StatGrid } from "@/components/soc/ui";
import { useSoc } from "@/components/soc/store";

export default function AttackDemoPage() {
  const { workspace, stats } = useSoc();

  const avgLatency = stats?.avg_latency_ms != null
    ? `${stats.avg_latency_ms.toFixed(1)}ms`
    : "—";

  return (
    <div className="space-y-8">
      <PageHead
        index="/08"
        title="Live Attack Demo"
        subtitle="Dispatch adversarial envelopes through the live kernel. Every gate is armed and fails closed."
      />

      <StatGrid>
        <Stat label="Scenarios" value="3" note="injection · review · clean" />
        <Stat label="Gates armed" value="6" note="L1 → L6" />
        <Stat label="Fail mode" value={workspace.failMode} />
        <Stat label="Avg verdict latency" value={avgLatency} note="live backend" />
      </StatGrid>

      <Sandbox />

      <div className="grid gap-8 lg:grid-cols-3">
        <Panel title="Prompt injection">
          <p className="font-mono text-xs leading-relaxed text-muted-foreground">
            Untrusted tool output carries instructions that hijack the calling agent. Caught by L6 semantic guard on intent drift.
          </p>
        </Panel>
        <Panel title="Privilege escalation">
          <p className="font-mono text-xs leading-relaxed text-muted-foreground">
            A sub-delegated agent asks for scope wider than its attenuated macaroon. Caught at L4 permissions, chain verified.
          </p>
        </Panel>
        <Panel title="Cryptographic replay">
          <p className="font-mono text-xs leading-relaxed text-muted-foreground">
            A previously observed signed envelope is re-sent. Caught at L2 preflight by the 300s nonce cache.
          </p>
        </Panel>
      </div>
    </div>
  );
}

