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
import { Bot, Copy, Check } from "lucide-react";

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
    10000
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = (await agents.register({
        name,
        description: description || undefined,
      })) as AgentWithKey;
      setLastKey({ name: res.name, api_key: res.api_key });
      setName("");
      setDescription("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
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
      setError(err instanceof Error ? err.message : "Failed");
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
    <div>
      <PageHeader
        title="Agents"
        description="Register and manage agent identities and permissions."
      />

      {(error || loadErr) && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error || loadErr?.message}
        </div>
      )}

      {/* Register form */}
      <Card className="mb-6 max-w-xl">
        <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Register a new agent
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="researcher"
            required
          />
          <Input
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button type="submit" disabled={submitting || !name} size="sm">
            {submitting ? "Registering..." : "Register"}
          </Button>
        </form>

        {lastKey && (
          <div className="mt-3 rounded-md border border-warning/20 bg-warning/5 p-3">
            <div className="text-xs text-warning">
              API key for{" "}
              <span className="font-mono">{lastKey.name}</span> - copy now,
              you won&apos;t see it again:
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 rounded bg-background/50 px-2 py-1.5 text-[11px] font-mono text-foreground break-all">
                {lastKey.api_key}
              </code>
              <button
                onClick={copyKey}
                className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
              >
                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Agent list */}
      <div className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Existing agents
      </div>
      {loading && !data && (
        <Card className="text-sm text-muted">Loading...</Card>
      )}
      {data && data.length === 0 && (
        <EmptyState
          icon={<Bot size={24} />}
          title="No agents yet"
          description="Register one above to get started."
        />
      )}
      {data && data.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">ID</th>
                <th className="px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-border/50 transition-colors hover:bg-surface-elevated/50"
                >
                  <td className="px-4 py-2.5 font-medium">{a.name}</td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={a.status === "active" ? "success" : "danger"}
                    >
                      {a.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {a.id.slice(0, 8)}...
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1.5">
                      {a.status === "active" ? (
                        <Button
                          onClick={() => onAction(a.id, "suspend")}
                          variant="danger"
                          size="sm"
                        >
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          onClick={() => onAction(a.id, "reactivate")}
                          variant="primary"
                          size="sm"
                        >
                          Reactivate
                        </Button>
                      )}
                      <Button
                        onClick={() => onAction(a.id, "rotateKey")}
                        variant="ghost"
                        size="sm"
                      >
                        Rotate key
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
