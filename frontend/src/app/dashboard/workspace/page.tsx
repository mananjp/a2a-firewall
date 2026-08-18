"use client";

import { useState } from "react";
import { useSoc } from "@/components/soc/store";
import { Btn, Field, PageHead, Panel, Stat, StatGrid, Tag, Terminal, inputCls } from "@/components/soc/ui";

const MEMBERS: [string, string, string][] = [
  ["ada@mesh.dev", "Owner", "full control"],
  ["kai@mesh.dev", "Admin", "policies, registry"],
  ["mira@mesh.dev", "Auditor", "read-only"],
  ["ops-bot@mesh.dev", "Service", "review queue"],
];

export default function WorkspacePage() {
  const { workspace, setWorkspace, agents, policies } = useSoc();
  const [saved, setSaved] = useState(false);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className="space-y-8">
      <PageHead
        index="/12"
        title="Workspace"
        subtitle="Global defaults for this mesh. Every gate reads these values at compile time."
      />

      <StatGrid>
        <Stat label="Workspace" value={workspace.region} note={workspace.name} />
        <Stat label="Agents" value={String(agents.length)} />
        <Stat label="Active rules" value={String(policies.filter((p) => p.enabled).length)} />
        <Stat label="Fail mode" value={workspace.failMode} />
      </StatGrid>

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <Panel title="Configuration" hint="applies on next envelope">
          <form className="space-y-5" onSubmit={save}>
            <Field label="Workspace name">
              <input
                className={inputCls}
                value={workspace.name}
                onChange={(e) => setWorkspace({ name: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Region">
                <select
                  className={inputCls}
                  value={workspace.region}
                  onChange={(e) => setWorkspace({ region: e.target.value })}
                >
                  {["eu-west-1", "us-east-1", "ap-south-1"].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fail mode">
                <select
                  className={inputCls}
                  value={workspace.failMode}
                  onChange={(e) => setWorkspace({ failMode: e.target.value as "CLOSED" | "OPEN" })}
                >
                  <option value="CLOSED">CLOSED (recommended)</option>
                  <option value="OPEN">OPEN</option>
                </select>
              </Field>
            </div>
            <Field label={`Max delegation depth — ${workspace.maxDepth}`}>
              <input
                type="range"
                min={1}
                max={6}
                value={workspace.maxDepth}
                onChange={(e) => setWorkspace({ maxDepth: Number(e.target.value) })}
                className="w-full accent-violet"
              />
            </Field>
            <Field label={`Replay window — ${workspace.replayWindow}s`}>
              <input
                type="range"
                min={60}
                max={900}
                step={30}
                value={workspace.replayWindow}
                onChange={(e) => setWorkspace({ replayWindow: Number(e.target.value) })}
                className="w-full accent-violet"
              />
            </Field>
            <Field label={`Rate limit — ${workspace.rpmLimit} rpm`}>
              <input
                type="range"
                min={100}
                max={3000}
                step={100}
                value={workspace.rpmLimit}
                onChange={(e) => setWorkspace({ rpmLimit: Number(e.target.value) })}
                className="w-full accent-violet"
              />
            </Field>
            <Field label="Notification email">
              <input
                className={inputCls}
                value={workspace.notifyEmail}
                onChange={(e) => setWorkspace({ notifyEmail: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-3 border border-ink/20 px-3 py-3">
              <input
                type="checkbox"
                checked={workspace.autoQuarantine}
                onChange={(e) => setWorkspace({ autoQuarantine: e.target.checked })}
                className="h-4 w-4 accent-violet"
              />
              <span className="font-mono text-xs">Auto-quarantine agents after 3 critical violations</span>
            </label>
            <div className="flex items-center gap-3">
              <Btn type="submit" variant="solid">
                Save configuration
              </Btn>
              {saved && <Tag tone="lime">saved</Tag>}
            </div>
          </form>
        </Panel>

        <div className="space-y-8">
          <Panel title="Members" hint={`${MEMBERS.length} seats`}>
            <div className="divide-y divide-ink/10">
              {MEMBERS.map(([email, role, perms]) => (
                <div key={email} className="flex items-center justify-between gap-3 py-3 font-mono text-xs">
                  <span className="min-w-0">
                    <span className="block truncate">{email}</span>
                    <span className="block truncate text-muted-foreground">{perms}</span>
                  </span>
                  <Tag tone={role === "Owner" ? "violet" : "muted"}>{role}</Tag>
                </div>
              ))}
            </div>
          </Panel>

          <Terminal
            title="workspace.toml"
            lines={[
              `name           = "${workspace.name}"`,
              `region         = "${workspace.region}"`,
              `fail_mode      = "${workspace.failMode}"`,
              `max_depth      = ${workspace.maxDepth}`,
              `replay_window  = ${workspace.replayWindow}`,
              `rpm_limit      = ${workspace.rpmLimit}`,
              `auto_quarantine = ${workspace.autoQuarantine}`,
              `notify         = "${workspace.notifyEmail}"`,
            ]}
          />
        </div>
      </div>
    </div>
  );
}
