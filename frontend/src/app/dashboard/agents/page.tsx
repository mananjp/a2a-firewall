"use client";

import { useState, useCallback, type FormEvent } from "react";
import { agents } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { Agent, AgentWithKey } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Bot, Copy, Check, Plus, RefreshCw, KeyRound, Lock, ShieldCheck, Loader2 } from "lucide-react";

export default function AgentsPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<{
    name: string;
    api_key: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    data,
    loading,
    error: loadErr,
    refresh,
  } = usePolling<Agent[]>(
    useCallback((_signal) => agents.list() as Promise<Agent[]>, []),
    8000
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = (await agents.register({
        name: name.trim(),
        description: description.trim() || undefined,
      })) as AgentWithKey;
      setLastKey({ name: res.name, api_key: res.api_key });
      setName("");
      setDescription("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register agent");
    } finally {
      setSubmitting(false);
    }
  }

  async function onAction(
    id: string,
    action: "suspend" | "reactivate" | "rotateKey"
  ) {
    try {
      if (action === "rotateKey") {
        const res = await agents.rotateKey(id);
        setLastKey({ name: id.slice(0, 8), api_key: res.api_key });
      } else {
        await agents[action](id);
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  function copyKey() {
    if (lastKey) {
      navigator.clipboard.writeText(lastKey.api_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agent Fleet"
        title="Registered Agents"
        description="Agents registered to this workspace with Ed25519 identity keys and capability manifests."
        trailing={loading && data ? <Loader2 size={16} className="text-accent animate-spin" /> : undefined}
      />

      {(error || loadErr) && (
        <div className="rounded-lg border border-block/30 bg-block/10 px-4 py-3 text-[13px] text-block font-mono">
          {error || loadErr?.message}
        </div>
      )}

      {/* Register Agent Form */}
      <div className="material-panel rounded-2xl p-6 max-w-2xl">
        <div className="eyebrow mb-3 flex items-center gap-1.5">
          <Plus size={13} className="text-accent" />
          <span>Provision New Autonomous Agent</span>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Agent Identifier"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. compliance-analyzer"
            required
          />
          <Input
            label="Description & Capabilities (Optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Evaluates SAR filings and customer risk scores"
          />
          <Button
            type="submit"
            disabled={submitting || !name.trim()}
            size="sm"
            className="font-mono text-[12px]"
          >
            {submitting ? "Registering..." : "Register Agent"}
          </Button>
        </form>

        {lastKey && (
          <div className="mt-4 rounded-xl border border-review/30 bg-review/10 p-4">
            <div className="text-[13px] text-ink-primary font-medium flex items-center gap-2 mb-1">
              <KeyRound size={14} className="text-review" />
              <span>
                API Key for <span className="font-mono font-bold">{lastKey.name}</span>
              </span>
            </div>
            <p className="text-[11px] text-ink-muted mb-2">
              Copy this token now. It is hashed with SHA-256 and will not be displayed again:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-surface-sunken px-3 py-2 text-[12px] font-mono text-allow border border-hairline break-all">
                {lastKey.api_key}
              </code>
              <button
                onClick={copyKey}
                className="rounded-lg p-2 bg-surface border border-hairline text-ink-muted hover:text-ink-primary transition-all shrink-0"
                aria-label="Copy key"
              >
                {copied ? <Check size={14} className="text-allow" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Agents Table */}
      <div className="material-panel rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-hairline flex items-center justify-between">
          <span className="eyebrow">Registered Agents</span>
          <span className="text-[11px] font-mono text-ink-muted">{data?.length ?? 0} agents active</span>
        </div>

        {loading && !data && <TableSkeleton rows={4} cols={4} />}

        {!loading && data && data.length === 0 && (
          <EmptyState
            icon={<Bot size={24} />}
            title="No agents registered yet"
            description="Provision an agent above to issue keys and configure permissions."
          />
        )}

        {data && data.length > 0 && (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] uppercase tracking-wide text-ink-muted bg-surface-elevated/40">
                <th className="px-5 py-3 font-medium">Agent Name</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Agent UUID</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-hairline/60 transition-colors duration-120 hover:bg-surface-elevated"
                >
                  <td className="px-5 py-3.5 font-semibold text-ink-primary flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-allow" />
                    <span>{a.name}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={a.status === "active" ? "allow" : "block"}>
                      {a.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-[12px] text-ink-muted">
                    {a.id}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {a.status === "active" ? (
                        <Button
                          onClick={() => onAction(a.id, "suspend")}
                          variant="danger"
                          size="sm"
                          className="h-7 px-2.5 text-[11px] font-mono"
                        >
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          onClick={() => onAction(a.id, "reactivate")}
                          variant="primary"
                          size="sm"
                          className="h-7 px-2.5 text-[11px] font-mono"
                        >
                          Reactivate
                        </Button>
                      )}
                      <Button
                        onClick={() => onAction(a.id, "rotateKey")}
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2.5 text-[11px] font-mono gap-1"
                      >
                        <RefreshCw size={11} />
                        Rotate
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
