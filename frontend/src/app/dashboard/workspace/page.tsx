"use client";

import { useState, useCallback, useEffect, useRef, type FormEvent } from "react";
import { workspaces } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { Workspace } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Settings2, Save, Loader2 } from "lucide-react";

export default function WorkspacePage() {
  const { toast } = useToast();
  const { data: ws, loading, error: loadErr, refresh } = usePolling<Workspace>(
    useCallback((_signal) => workspaces.me(), []), 30000
  );

  const [failMode, setFailMode] = useState("closed");
  const [groqThreshold, setGroqThreshold] = useState("0.3");
  const [blockThreshold, setBlockThreshold] = useState("0.8");
  const [defaultDeny, setDefaultDeny] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (ws && !initialized.current) {
      initialized.current = true;
      setFailMode(ws.fail_mode);
      setGroqThreshold(String(ws.groq_threshold));
      setBlockThreshold(String(ws.block_threshold));
      setDefaultDeny(ws.default_deny);
    }
  }, [ws]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await workspaces.update({
        fail_mode: failMode as "open" | "closed",
        groq_threshold: parseFloat(groqThreshold),
        block_threshold: parseFloat(blockThreshold),
        default_deny: defaultDeny,
      });
      toast({ title: "Workspace updated", description: "Configuration saved.", variant: "success" });
      setDirty(false);
      refresh();
    } catch (err) {
      toast({ title: "Update failed", description: err instanceof Error ? err.message : "Unknown error", variant: "error" });
    } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="Workspace Configuration" description="Configure thresholds, fail mode, and access control." />

      {loadErr && <div className="mb-4 text-xs text-danger bg-danger/5 border border-danger/20 px-3 py-2 rounded">{loadErr.message}</div>}

      {loading && !ws && <Card className="text-sm text-muted">Loading...</Card>}

      {ws && (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Settings2 size={15} className="text-accent" />
                <span className="text-sm font-medium">Detection Thresholds & Mode</span>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Fail Mode</label>
                    <select value={failMode} onChange={e => { setFailMode(e.target.value); setDirty(true); }}
                      className="w-full h-9 rounded-md border border-border bg-surface-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40">
                      <option value="closed">Closed (block by default)</option>
                      <option value="open">Open (allow by default)</option>
                    </select>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {failMode === "closed" ? "All unconfigured sender-receiver pairs are blocked." : "All unconfigured pairs are allowed (legacy behavior)."}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Deny</label>
                    <select value={defaultDeny ? "true" : "false"} onChange={e => { setDefaultDeny(e.target.value === "true"); setDirty(true); }}
                      className="w-full h-9 rounded-md border border-border bg-surface-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40">
                      <option value="true">Enabled (whitelist)</option>
                      <option value="false">Disabled (blacklist)</option>
                    </select>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {defaultDeny ? "Agents need explicit permission to talk to each other." : "Any agent can talk to any agent unless explicitly denied."}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Input label="Groq Threshold (0-1)" type="number" min="0" max="1" step="0.05" value={groqThreshold}
                    onChange={e => { setGroqThreshold(e.target.value); setDirty(true); }} />
                  <Input label="Block Threshold (0-1)" type="number" min="0" max="1" step="0.05" value={blockThreshold}
                    onChange={e => { setBlockThreshold(e.target.value); setDirty(true); }} />
                </div>

                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={!dirty || saving} variant="secondary">
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    {saving ? "Saving..." : "Save Configuration"}
                  </Button>
                  {!dirty && <span className="text-xs text-muted">No changes</span>}
                </div>
              </form>
            </Card>
          </div>

          <div className="col-span-1 space-y-3">
            <Card>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Workspace Info</div>
              <div className="space-y-2">
                <div><div className="text-[10px] text-muted-foreground uppercase tracking-wide">ID</div><div className="text-xs font-mono break-all mt-0.5">{ws.id}</div></div>
                <div><div className="text-[10px] text-muted-foreground uppercase tracking-wide">Name</div><div className="text-xs mt-0.5">{ws.name}</div></div>
                <div><div className="text-[10px] text-muted-foreground uppercase tracking-wide">Email</div><div className="text-xs mt-0.5">{ws.admin_email}</div></div>
                <div><div className="text-[10px] text-muted-foreground uppercase tracking-wide">Created</div><div className="text-xs mt-0.5">{new Date(ws.created_at).toLocaleDateString()}</div></div>
              </div>
            </Card>
            <Card>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">How thresholds work</div>
              <div className="space-y-2 text-[11px] text-muted-foreground leading-relaxed">
                <p><strong className="text-foreground">Risk &lt; Groq threshold:</strong> Bypasses Groq analysis. Passes through to decision layer.</p>
                <p><strong className="text-foreground">Groq threshold ≤ Risk &lt; Block threshold:</strong> Triggers Groq semantic analysis. If injection detected, risk increases.</p>
                <p><strong className="text-foreground">Risk ≥ Block threshold:</strong> Task is blocked regardless of other factors.</p>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
