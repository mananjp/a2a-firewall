"use client";

import { useState } from "react";
import { useSoc } from "@/components/soc/store";
import { Btn, PageHead, Panel, Stat, StatGrid, Tag, Terminal, inputCls } from "@/components/soc/ui";

export default function IdentityPage() {
  const { keys, rotateKey, revokeKey, workspace } = useSoc();
  const [q, setQ] = useState("");
  const [log, setLog] = useState<string[]>([
    "// Ed25519 identity ledger armed with cryptographic verification",
  ]);
  const [actingId, setActingId] = useState<string | null>(null);

  const rows = keys.filter((k) => (k.agent + k.fingerprint + k.id).toLowerCase().includes(q.toLowerCase()));

  const doRotate = async (id: string, agent: string) => {
    setActingId(id);
    try {
      await rotateKey(id);
      setLog((l) => [`rotate ${agent} → new ed25519 pair minted, previous key invalidated`, ...l].slice(0, 20));
    } finally {
      setActingId(null);
    }
  };

  const doRevoke = async (id: string, agent: string) => {
    setActingId(id);
    try {
      await revokeKey(id);
      setLog((l) => [`revoke ${agent} → agent suspended, sessions terminated fail-closed`, ...l].slice(0, 20));
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHead
        index="/09"
        title="Identity & Keys"
        subtitle="Every agent in the mesh holds an ed25519 identity. No key, no envelope, no verdict."
      />

      <StatGrid>
        <Stat label="Keys issued" value={String(keys.length)} />
        <Stat label="Valid" value={String(keys.filter((k) => k.status === "valid").length)} />
        <Stat label="Rotating" value={String(keys.filter((k) => k.status === "rotating").length)} />
        <Stat label="Revoked" value={String(keys.filter((k) => k.status === "revoked").length)} />
      </StatGrid>

      <input
        className={`${inputCls} max-w-sm`}
        placeholder="search agent, fingerprint or ID…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <Panel title="Key ledger" hint={`${rows.length} keys`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-ink/20 text-left label-mono text-muted-foreground">
                <th className="py-2 pr-4">Agent</th>
                <th className="py-2 pr-4">Alg</th>
                <th className="py-2 pr-4">Fingerprint</th>
                <th className="py-2 pr-4">Issued</th>
                <th className="py-2 pr-4">Expires</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id} className="border-b border-ink/10">
                  <td className="py-3 pr-4 font-bold">{k.agent}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{k.alg}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{k.fingerprint}</td>
                  <td className="py-3 pr-4">{k.issued}</td>
                  <td className="py-3 pr-4">{k.expires}</td>
                  <td className="py-3 pr-4">
                    <Tag tone={k.status === "valid" ? "lime" : k.status === "rotating" ? "violet" : "danger"}>
                      {k.status}
                    </Tag>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <Btn
                        disabled={k.status === "revoked" || actingId === k.id}
                        onClick={() => doRotate(k.id, k.agent)}
                      >
                        {actingId === k.id ? "Rotating..." : "Rotate"}
                      </Btn>
                      <Btn
                        variant="danger"
                        disabled={k.status === "revoked" || actingId === k.id}
                        onClick={() => doRevoke(k.id, k.agent)}
                      >
                        {actingId === k.id ? "Revoking..." : "Revoke"}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="py-6 font-mono text-xs text-muted-foreground">
              {"// No keys registered. Register agents in the registry to mint keys."}
            </p>
          )}
        </div>
      </Panel>

      <div className="grid gap-8 lg:grid-cols-2">
        <Terminal title="key operations" lines={log} />
        <Terminal
          title="trust anchors"
          lines={[
            `workspace        = ${workspace.name}`,
            `root_ca          = a2a-mesh-root/2026`,
            `signature_alg    = ed25519`,
            `nonce_window     = ${workspace.replayWindow}s`,
            `max_depth        = ${workspace.maxDepth}`,
            `fail_mode        = ${workspace.failMode}`,
          ]}
        />
      </div>
    </div>
  );
}
