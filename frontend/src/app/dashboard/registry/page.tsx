"use client";

import { useState } from "react";
import { useSoc } from "@/components/soc/store";
import { Btn, Field, PageHead, Panel, Stat, StatGrid, Tag, inputCls } from "@/components/soc/ui";

export default function RegistryPage() {
  const { agents, toggleAgent, addAgent, isConnected } = useSoc();
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [scopes, setScopes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const rows = agents.filter((a) =>
    (a.name + a.owner + a.scopes.join(" ") + a.id).toLowerCase().includes(q.toLowerCase())
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await addAgent(name.trim(), owner.trim() || "unassigned@mesh", scopes);
      setName("");
      setOwner("");
      setScopes("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    try {
      await toggleAgent(id);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHead
        index="/10"
        title="Agent Registry"
        subtitle="The authoritative roster. Unregistered identities are refused at L2 preflight."
      />

      <StatGrid>
        <Stat label="Registered" value={String(agents.length)} />
        <Stat label="Active" value={String(agents.filter((a) => a.status === "active").length)} />
        <Stat label="Suspended" value={String(agents.filter((a) => a.status === "suspended").length)} />
        <Stat label="Backend Sync" value={isConnected ? "LIVE" : "LOCAL"} note="Database backed roster" />
      </StatGrid>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Registered agents" hint={`${rows.length} records`}>
          <input
            className={`${inputCls} mb-4 max-w-sm`}
            placeholder="search agent, owner, capability or ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="divide-y divide-ink/10">
            {rows.map((a) => (
              <div key={a.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-bold uppercase">{a.name}</span>
                    <Tag tone={a.status === "active" ? "lime" : "danger"}>{a.status}</Tag>
                    <Tag>depth {a.depth}</Tag>
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {a.owner} · ID: {a.id.slice(0, 10)}... · {a.lastSeen}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.scopes.map((s) => (
                      <Tag key={s} tone="violet">
                        {s}
                      </Tag>
                    ))}
                  </div>
                </div>
                <Btn
                  variant={a.status === "active" ? "danger" : "lime"}
                  disabled={togglingId === a.id}
                  onClick={() => handleToggle(a.id)}
                >
                  {togglingId === a.id ? "Updating..." : a.status === "active" ? "Suspend" : "Reinstate"}
                </Btn>
              </div>
            ))}
            {!rows.length && (
              <p className="py-6 font-mono text-xs text-muted-foreground">
                {"// No registered agents match search criteria."}
              </p>
            )}
          </div>
        </Panel>

        <Panel title="Register agent" hint="issues ed25519 identity">
          <form className="space-y-5" onSubmit={submit}>
            <Field label="Agent name">
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="research-agent-08"
                required
              />
            </Field>
            <Field label="Owner / Description">
              <input
                className={inputCls}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="research@mesh.dev"
              />
            </Field>
            <Field label="Capabilities / Scopes (comma separated)">
              <input
                className={inputCls}
                value={scopes}
                onChange={(e) => setScopes(e.target.value)}
                placeholder="web.fetch, doc.summarize, research"
              />
            </Field>
            <Btn type="submit" variant="solid" className="w-full" disabled={submitting}>
              {submitting ? "Registering on server..." : "Register & issue key"}
            </Btn>
            <p className="font-mono text-[11px] text-muted-foreground">
              New agents are saved into Postgres and issued unique Ed25519 identities with fail-closed defaults.
            </p>
          </form>
        </Panel>
      </div>
    </div>
  );
}
