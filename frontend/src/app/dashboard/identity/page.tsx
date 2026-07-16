"use client";

import { useState, useCallback, useEffect } from "react";
import { identity, delegation, agents } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { Agent, AgentIdentity, DelegationToken, DelegationChainEntry } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  KeyRound,
  ShieldCheck,
  Link2,
  Loader2,
  Plus,
  ChevronDown,
  ChevronRight,
  Fingerprint,
  Copy,
  CheckCircle2,
} from "lucide-react";

export default function IdentityPage() {
  return (
    <div>
      <PageHeader
        title="Identity & Delegation"
        description="Manage agent identities, Ed25519 keypairs, and attenuable delegation tokens."
      />
      <div className="grid grid-cols-2 gap-4">
        <WorkspaceIdentityCard />
        <AgentIdentityCard />
        <DelegationMinter />
        <DelegationVerifier />
      </div>
    </div>
  );
}

function WorkspaceIdentityCard() {
  const { data, loading } = usePolling<{ workspace_id: string; root_public_key: string }>(
    useCallback((_signal) => identity.workspaceIdentity(), []),
    30000
  );

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <KeyRound size={15} className="text-accent" />
        <div className="text-sm font-medium">Workspace Root Identity</div>
      </div>
      {loading && !data && <div className="text-xs text-muted">Loading...</div>}
      {data && (
        <div className="space-y-2">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Workspace ID</div>
            <div className="font-mono text-xs text-foreground break-all">{data.workspace_id}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Root Public Key (Ed25519)</div>
            <div className="font-mono text-[11px] text-foreground break-all leading-relaxed">{data.root_public_key}</div>
          </div>
        </div>
      )}
    </Card>
  );
}

function AgentIdentityCard() {
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [identityData, setIdentityData] = useState<AgentIdentity | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    agents.list().then((a) => {
      setAgentList(a as Agent[]);
      if (a.length > 0) setSelectedId(a[0].id);
    });
  }, []);

  async function handleRegister() {
    if (!selectedId) return;
    setLoading(true);
    try {
      // Generate a fresh Ed25519 keypair for this agent
      const keypair = await crypto.subtle.generateKey(
        { name: "Ed25519" },
        true,
        ["sign", "verify"]
      );
      const pubRaw = await crypto.subtle.exportKey("raw", keypair.publicKey);
      const pubB64 = btoa(String.fromCharCode(...new Uint8Array(pubRaw)));
      const result = await identity.register(selectedId, pubB64);
      setIdentityData(result);
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!identityData) return;
    navigator.clipboard.writeText(JSON.stringify(identityData.card, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Fingerprint size={15} className="text-accent" />
        <div className="text-sm font-medium">Agent Identity Registration</div>
      </div>
      <div className="space-y-3">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Select Agent</div>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground"
          >
            {agentList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.id.slice(0, 8)})
              </option>
            ))}
          </select>
        </div>
        <Button onClick={handleRegister} disabled={!selectedId || loading} variant="secondary" size="sm">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
          {loading ? "Generating..." : "Generate & Register Keypair"}
        </Button>
        {identityData && (
          <div className="rounded-md border border-border bg-surface p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-success font-medium flex items-center gap-1">
                <ShieldCheck size={12} /> Identity registered
              </div>
              <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground transition-colors">
                {copied ? <CheckCircle2 size={12} className="text-success" /> : <Copy size={12} />}
              </button>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Agent ID</div>
              <div className="font-mono text-xs">{identityData.agent_id}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Public Key</div>
              <div className="font-mono text-[10px] break-all text-muted-foreground">{identityData.public_key}</div>
            </div>
            <details className="group">
              <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                View Identity Card
              </summary>
              <pre className="mt-1 rounded bg-surface-elevated p-2 text-[10px] font-mono overflow-auto max-h-40">
                {JSON.stringify(identityData.card, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </Card>
  );
}

function DelegationMinter() {
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [caveats, setCaveats] = useState("task_type:investigation, max_amount:10000");
  const [token, setToken] = useState<DelegationToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [attenuated, setAttenuated] = useState<DelegationToken[]>([]);
  const [newCaveats, setNewCaveats] = useState("task_type:payment");
  const [attLoading, setAttLoading] = useState(false);

  useEffect(() => {
    agents.list().then((a) => {
      setAgentList(a as Agent[]);
      if (a.length > 0) setSelectedId(a[0].id);
    });
  }, []);

  async function handleMint() {
    if (!selectedId) return;
    setLoading(true);
    try {
      const parsed = caveats.split(",").map((c) => c.trim()).filter(Boolean);
      const result = await delegation.mint(selectedId, parsed);
      setToken(result.token);
      setAttenuated([]);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }

  async function handleAttenuate() {
    if (!token) return;
    setAttLoading(true);
    try {
      const parsed = newCaveats.split(",").map((c) => c.trim()).filter(Boolean);
      const result = await delegation.attenuate(
        `${token.location}|${token.identifier}|${token.signature}`,
        parsed
      );
      setAttenuated([...attenuated, result.token]);
    } catch {
      // Error
    } finally {
      setAttLoading(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Link2 size={15} className="text-warning" />
        <div className="text-sm font-medium">Delegation Token Minting</div>
      </div>
      <div className="space-y-3">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Delegate Agent</div>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground"
          >
            {agentList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.id.slice(0, 8)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Caveats (comma-separated)</div>
          <Input
            value={caveats}
            onChange={(e) => setCaveats(e.target.value)}
            className="text-xs font-mono"
            placeholder="task_type:investigation, max_amount:10000"
          />
        </div>
        <Button onClick={handleMint} disabled={!selectedId || loading} variant="secondary" size="sm">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          {loading ? "Minting..." : "Mint Token"}
        </Button>

        {/* Root token */}
        {token && (
          <div className="rounded-md border border-border bg-surface p-2.5 space-y-2">
            <div className="text-[10px] text-success font-medium flex items-center gap-1">
              <ShieldCheck size={12} /> Root token minted
            </div>
            <div className="space-y-1">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Identifier</div>
              <div className="font-mono text-[10px] break-all">{token.identifier}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Caveats</div>
              <div className="flex flex-wrap gap-1">
                {token.caveats.map((c, i) => (
                  <Badge key={i} variant="info">{c}</Badge>
                ))}
              </div>
            </div>

            {/* Attenuate form */}
            <div className="pt-2 border-t border-border">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Attenuate with new caveats</div>
              <div className="flex gap-2">
                <Input
                  value={newCaveats}
                  onChange={(e) => setNewCaveats(e.target.value)}
                  className="text-xs font-mono flex-1"
                  placeholder="task_type:payment"
                />
                <Button onClick={handleAttenuate} disabled={attLoading} variant="ghost" size="sm">
                  {attLoading ? <Loader2 size={11} className="animate-spin" /> : "Attenuate"}
                </Button>
              </div>
            </div>

            {/* Attenuated chain */}
            {attenuated.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Attenuated Chain</div>
                {attenuated.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 rounded bg-surface-elevated/50 px-2 py-1">
                    <span className="text-[10px] text-muted">Level {i + 1}</span>
                    <div className="flex flex-wrap gap-1 flex-1">
                      {t.caveats.map((c, j) => (
                        <Badge key={j} variant="warning" className="text-[9px]">{c}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function DelegationVerifier() {
  const [tokenInput, setTokenInput] = useState("");
  const [result, setResult] = useState<{ valid: boolean; reason: string; caveats: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [capInput, setCapInput] = useState("");
  const [capResult, setCapResult] = useState<{ granted: boolean; token_caveats: string[] } | null>(null);

  async function handleVerify() {
    if (!tokenInput.trim()) return;
    setLoading(true);
    try {
      const res = await delegation.verify(tokenInput.trim());
      setResult(res);
    } catch {
      setResult({ valid: false, reason: "Verification failed", caveats: [] });
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckCap() {
    if (!tokenInput.trim() || !capInput.trim()) return;
    setLoading(true);
    try {
      const res = await delegation.checkCapability(tokenInput.trim(), capInput.trim());
      setCapResult(res);
    } catch {
      setCapResult({ granted: false, token_caveats: [] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={15} className="text-success" />
        <div className="text-sm font-medium">Token Verification</div>
      </div>
      <div className="space-y-3">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Token (compact)</div>
          <Input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            className="text-xs font-mono"
            placeholder="location|identifier|signature"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleVerify} disabled={!tokenInput.trim() || loading} variant="secondary" size="sm">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
            Verify
          </Button>
          <Button onClick={handleCheckCap} disabled={!tokenInput.trim() || !capInput.trim() || loading} variant="ghost" size="sm">
            Check Capability
          </Button>
        </div>

        {/* Capability check */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Required Capability</div>
          <Input
            value={capInput}
            onChange={(e) => setCapInput(e.target.value)}
            className="text-xs font-mono"
            placeholder="task_type:investigation"
          />
        </div>

        {capResult && (
          <div className={`rounded-md border px-2.5 py-2 text-xs ${
            capResult.granted
              ? "border-success/20 bg-success/5 text-success"
              : "border-danger/20 bg-danger/5 text-danger"
          }`}>
            {capResult.granted ? "Capability granted" : "Capability denied"}
            {capResult.token_caveats.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {capResult.token_caveats.map((c, i) => (
                  <Badge key={i} variant={capResult.granted ? "success" : "danger"} className="text-[9px]">{c}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {result && (
          <div className={`rounded-md border px-2.5 py-2 text-xs ${
            result.valid
              ? "border-success/20 bg-success/5 text-success"
              : "border-danger/20 bg-danger/5 text-danger"
          }`}>
            <div className="flex items-center gap-1.5 mb-1">
              {result.valid ? <ShieldCheck size={12} /> : <KeyRound size={12} />}
              {result.valid ? "Token valid" : "Token invalid"}
            </div>
            <div className="text-muted-foreground">{result.reason}</div>
            {result.caveats.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {result.caveats.map((c, i) => (
                  <Badge key={i} variant="info" className="text-[9px]">{c}</Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
