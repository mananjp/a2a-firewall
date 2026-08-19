"use client";

import { useState, useCallback, useEffect } from "react";
import { identity, delegation, agents } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { Agent, AgentIdentity, DelegationToken } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton, CardSkeleton } from "@/components/ui/skeleton";
import {
  KeyRound,
  ShieldCheck,
  Link2,
  Loader2,
  Plus,
  Fingerprint,
  Copy,
  CheckCircle2,
  Lock,
  ArrowRight,
} from "lucide-react";

export default function IdentityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 2 Cryptography"
        title="Agent Identity & Macaroon Delegation"
        description="Manage agent cryptographic identities, Ed25519 public key registries, and attenuable macaroon delegation tokens."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
    <div className="material-panel rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-hairline">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
          <KeyRound size={15} />
        </div>
        <div className="flex items-center justify-between flex-1">
          <div>
            <h3 className="text-[14px] font-semibold text-ink-primary">Workspace Root Identity</h3>
            <span className="text-[11px] text-ink-muted">Ed25519 Root Trust Anchor</span>
          </div>
          {loading && data && <Loader2 size={14} className="text-accent animate-spin" />}
        </div>
      </div>

      {loading && !data && <CardSkeleton lines={2} hasHeader={false} />}
      {data && (
        <div className="space-y-3">
          <div>
            <div className="eyebrow mb-1">Workspace ID</div>
            <div className="font-mono text-[12px] text-ink-primary bg-surface-sunken p-2.5 rounded-lg border border-hairline break-all">
              {data.workspace_id}
            </div>
          </div>
          <div>
            <div className="eyebrow mb-1">Root Public Key (Ed25519)</div>
            <div className="font-mono text-[11px] text-allow bg-surface-sunken p-2.5 rounded-lg border border-hairline break-all leading-relaxed">
              {data.root_public_key}
            </div>
          </div>
        </div>
      )}
    </div>
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
      const keypair = await crypto.subtle.generateKey(
        { name: "Ed25519" },
        true,
        ["sign", "verify"]
      );
      const pubRaw = await crypto.subtle.exportKey("raw", keypair.publicKey);
      const pubHex = Array.from(new Uint8Array(pubRaw))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const result = await identity.register(selectedId, pubHex);
      setIdentityData(result);
    } catch {
      // Ignored
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
    <div className="material-panel rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-hairline">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Fingerprint size={15} />
        </div>
        <div>
          <h3 className="text-[14px] font-semibold text-ink-primary">Agent Keypair Registry</h3>
          <span className="text-[11px] text-ink-muted">Register Ed25519 Public Keys</span>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="eyebrow mb-1.5">Select Agent Target</div>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-lg border border-hairline bg-surface-elevated px-3 py-2 text-[12px] font-mono text-ink-primary focus:outline-none focus:border-accent"
          >
            {agentList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.id.slice(0, 8)}...)
              </option>
            ))}
          </select>
        </div>

        <Button
          onClick={handleRegister}
          disabled={!selectedId || loading}
          variant="secondary"
          size="sm"
          className="gap-2 font-mono text-[12px]"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
          {loading ? "Registering..." : "Generate & Register Ed25519 Key"}
        </Button>

        {identityData && (
          <div className="rounded-lg border border-hairline bg-surface-elevated p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-allow font-semibold flex items-center gap-1 font-mono">
                <ShieldCheck size={13} /> Ed25519 Registered
              </div>
              <button
                onClick={handleCopy}
                className="text-ink-muted hover:text-ink-primary transition-colors p-1"
                aria-label="Copy identity card"
              >
                {copied ? <CheckCircle2 size={13} className="text-allow" /> : <Copy size={13} />}
              </button>
            </div>
            <div>
              <div className="eyebrow mb-0.5">Agent UUID</div>
              <div className="font-mono text-[11px] text-ink-primary">{identityData.agent_id}</div>
            </div>
            <div>
              <div className="eyebrow mb-0.5">Public Key</div>
              <div className="font-mono text-[10px] break-all text-ink-muted bg-surface-sunken p-1.5 rounded border border-hairline">
                {identityData.public_key}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DelegationMinter() {
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [caveats, setCaveats] = useState("task_type:research, max_depth:2");
  const [token, setToken] = useState<DelegationToken | null>(null);
  const [loading, setLoading] = useState(false);

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
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="material-panel rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-hairline">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-review-soft text-review">
          <Link2 size={15} />
        </div>
        <div>
          <h3 className="text-[14px] font-semibold text-ink-primary">Macaroon Token Minter</h3>
          <span className="text-[11px] text-ink-muted">Mint Scoped Caveat Chains</span>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="eyebrow mb-1.5">Delegate Target Agent</div>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-lg border border-hairline bg-surface-elevated px-3 py-2 text-[12px] font-mono text-ink-primary focus:outline-none focus:border-accent"
          >
            {agentList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.id.slice(0, 8)}...)
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="eyebrow mb-1.5">Caveats (Comma-separated)</div>
          <Input
            value={caveats}
            onChange={(e) => setCaveats(e.target.value)}
            className="font-mono text-[12px]"
            placeholder="task_type:research, max_depth:2"
          />
        </div>

        <Button
          onClick={handleMint}
          disabled={!selectedId || loading}
          variant="secondary"
          size="sm"
          className="gap-2 font-mono text-[12px]"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          {loading ? "Minting..." : "Mint Macaroon Token"}
        </Button>

        {token && (
          <div className="rounded-lg border border-hairline bg-surface-elevated p-3.5 space-y-2">
            <div className="text-[11px] text-allow font-mono font-semibold flex items-center gap-1">
              <ShieldCheck size={13} /> Token Minted Successfully
            </div>
            <div>
              <div className="eyebrow mb-0.5">Token Identifier</div>
              <div className="font-mono text-[11px] text-ink-primary truncate">{token.identifier}</div>
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {token.caveats.map((c, i) => (
                <Badge key={i} variant="allow" className="text-[10px]">{c}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DelegationVerifier() {
  const [tokenInput, setTokenInput] = useState("");
  const [result, setResult] = useState<{ valid: boolean; reason: string; caveats: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="material-panel rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-hairline">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-allow-soft text-allow">
          <ShieldCheck size={15} />
        </div>
        <div>
          <h3 className="text-[14px] font-semibold text-ink-primary">Token Verification Gate</h3>
          <span className="text-[11px] text-ink-muted">Validate Scopes & Caveat Signatures</span>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="eyebrow mb-1.5">Compact Token String</div>
          <Input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            className="font-mono text-[12px]"
            placeholder="location|identifier|signature"
          />
        </div>

        <Button
          onClick={handleVerify}
          disabled={!tokenInput.trim() || loading}
          variant="secondary"
          size="sm"
          className="gap-2 font-mono text-[12px]"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
          Verify Macaroon Token
        </Button>

        {result && (
          <div
            className={`rounded-lg border p-3 text-[12px] font-mono ${
              result.valid
                ? "border-allow/30 bg-allow/10 text-allow"
                : "border-block/30 bg-block/10 text-block"
            }`}
          >
            <div className="font-bold flex items-center gap-1.5 mb-1">
              {result.valid ? <ShieldCheck size={13} /> : <Lock size={13} />}
              {result.valid ? "VALID: Non-amplified signature confirmed" : "INVALID TOKEN"}
            </div>
            <div className="text-[11px] opacity-90">{result.reason}</div>
          </div>
        )}
      </div>
    </div>
  );
}
