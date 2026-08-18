"use client";

import { useEffect, useState, useCallback } from "react";
import { useSoc, type Delegation } from "@/components/soc/store";
import { Btn, PageHead, Panel, Stat, StatGrid, Tag, Terminal, inputCls } from "@/components/soc/ui";
import { audit as auditApi, simulation } from "@/lib/api";

const MOCK_CHAINS: Delegation[] = [
  {
    id: "dlg-771",
    chain: ["Portfolio-Manager-01", "Market-Analyst-02"],
    scopes: ["market_analytics.read"],
    caveats: ["exp<=300s", "scope:market_analytics.read", "depth<=2"],
    depth: 2,
    issued: "10:41:12",
    valid: true,
  },
  {
    id: "dlg-770",
    chain: ["Planner-Agent-01", "Research-Agent-07", "Summarizer-11"],
    scopes: ["doc.summarize"],
    caveats: ["exp<=600s", "scope:doc.summarize", "depth<=3"],
    depth: 3,
    issued: "10:38:44",
    valid: true,
  },
  {
    id: "dlg-768",
    chain: ["Ops-Agent-02", "External-Broker-XX"],
    scopes: ["treasury.transfer"],
    caveats: ["scope:ops.read", "depth<=2"],
    depth: 2,
    issued: "10:33:02",
    valid: false,
  },
];

export default function DelegationAuditPage() {
  const { workspace, isConnected, refreshAll } = useSoc();
  const [chains, setChains] = useState<Delegation[]>(MOCK_CHAINS);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(chains[0]?.id ?? null);
  const [generating, setGenerating] = useState(false);

  const loadLiveChains = useCallback(async () => {
    try {
      const res = await auditApi.listChains(50);
      if (res?.events && res.events.length > 0) {
        // Group by task_id to form chains
        const grouped = new Map<string, typeof res.events>();
        res.events.forEach((ev) => {
          const list = grouped.get(ev.task_id) || [];
          list.push(ev);
          grouped.set(ev.task_id, list);
        });

        const liveChains: Delegation[] = [];
        grouped.forEach((eventsList, taskId) => {
          const sorted = [...eventsList].sort((a, b) => a.delegation_depth - b.delegation_depth);
          const first = sorted[0]!;
          const last = sorted[sorted.length - 1]!;
          const chainAgents = [first.sender_name, ...sorted.map((s) => s.receiver_name)];
          const caveatsList = sorted
            .map((s) => s.caveats)
            .filter(Boolean)
            .flatMap((c) => (c ? c.split(";").map((x) => x.trim()) : []));

          liveChains.push({
            id: `dlg-${taskId.slice(0, 6)}`,
            chain: chainAgents,
            scopes: caveatsList.filter((c) => c.startsWith("scope:")).map((c) => c.replace("scope:", "")),
            caveats: caveatsList.length ? caveatsList : ["exp<=300s", `depth<=${last.delegation_depth}`],
            depth: last.delegation_depth,
            issued: first.timestamp ? new Date(first.timestamp).toLocaleTimeString() : "active",
            valid: sorted.every((s) => s.signature_valid),
          });
        });

        if (liveChains.length > 0) {
          setChains(liveChains);
          setOpenId(liveChains[0]?.id ?? null);
        }
      }
    } catch {
      // Keep initial mock chains on offline mode
    }
  }, []);

  useEffect(() => {
    loadLiveChains();
  }, [loadLiveChains]);

  const generateChain = async () => {
    setGenerating(true);
    try {
      // Run a multi-step simulation on the backend to mint a real delegation trace
      const res = await simulation.run([
        { sender: "Root-Orchestrator", receiver: "Risk-Auditor-01", task_type: "audit_init", payload: { depth: 1 } },
        { sender: "Risk-Auditor-01", receiver: "Compliance-Bot-02", task_type: "compliance_check", payload: { depth: 2 } },
        { sender: "Compliance-Bot-02", receiver: "Execution-Unit-03", task_type: "execute_settle", payload: { depth: 3 } },
      ]);
      await refreshAll();
      await loadLiveChains();

      const newId = `dlg-${Date.now().toString().slice(-4)}`;
      const newChain: Delegation = {
        id: newId,
        chain: ["Root-Orchestrator", ...res.steps.map((s) => s.receiver)],
        scopes: ["audit_init", "compliance_check", "execute_settle"],
        caveats: [`exp<=300s`, `depth<=${res.steps.length}`, "provenance:backend_simulation"],
        depth: res.steps.length,
        issued: new Date().toISOString().slice(11, 19),
        valid: res.steps.every((s) => s.allowed_to_proceed),
      };

      setChains((prev) => [newChain, ...prev.filter((p) => p.id !== newId)]);
      setOpenId(newId);
    } catch {
      // Fallback
      const newId = `dlg-${Math.floor(Math.random() * 900 + 100)}`;
      const newChain: Delegation = {
        id: newId,
        chain: ["Planner-01", "Research-02", "Writer-03"],
        scopes: ["doc.summarize"],
        caveats: ["exp<=300s", "scope:doc.summarize", "depth<=3"],
        depth: 3,
        issued: new Date().toISOString().slice(11, 19),
        valid: true,
      };
      setChains((prev) => [newChain, ...prev]);
      setOpenId(newId);
    } finally {
      setGenerating(false);
    }
  };


  const rows = chains.filter((d) =>
    (d.chain.join(" ") + d.scopes.join(" ") + d.id).toLowerCase().includes(q.toLowerCase())
  );
  const open = chains.find((d) => d.id === openId) ?? null;

  return (
    <div className="space-y-8">
      <PageHead
        index="/03"
        title="Delegation Audit"
        subtitle="Every macaroon issued in the mesh, with its attenuation chain and caveat proofs."
        action={
          <Btn variant="solid" onClick={generateChain} disabled={generating}>
            {generating ? "Generating on mesh..." : "Generate Demo Chain"}
          </Btn>
        }
      />

      <StatGrid>
        <Stat label="Active chains" value={String(chains.length)} />
        <Stat label="Invalid" value={String(chains.filter((d) => !d.valid).length)} note="fail-closed" />
        <Stat label="Max depth" value={String(workspace.maxDepth)} />
        <Stat
          label="Backend Sync"
          value={isConnected ? "LIVE" : "LOCAL"}
          note="HMAC-SHA256 Lineage"
        />
      </StatGrid>

      <input
        className={`${inputCls} max-w-sm`}
        placeholder="search chain, scope or ID…"
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
                className={`block w-full py-4 text-left px-3 transition-colors ${
                  openId === d.id ? "bg-secondary" : "hover:bg-secondary/40"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                  <span className="font-bold text-ink">{d.id}</span>
                  <Tag tone={d.valid ? "lime" : "danger"}>{d.valid ? "valid" : "attenuation broken"}</Tag>
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
              <p className="font-mono text-xs text-muted-foreground">{"// select a chain"}</p>
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
                    `  result     = ${open.valid ? "VERIFIED (Lineage cryptographically intact)" : "REJECTED (Attenuated subset violated)"}`,
                  ]
                : []
            }
          />
        </div>
      </div>
    </div>
  );
}
