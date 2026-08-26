"use client";

import { useState, useCallback } from "react";
import { usePolling } from "@/hooks/use-polling";
import { scim } from "@/lib/api";
import type { SCIMTokenItem } from "@/lib/types";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  UserCheck,
  KeyRound,
  Copy,
  Check,
  Shield,
  Layers,
  ExternalLink,
  Plus,
  Server,
  BookOpen,
} from "lucide-react";

export default function ScimPage() {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [tokenName, setTokenName] = useState("Okta SCIM Sync");
  const [generatedToken, setGeneratedToken] = useState<{
    token: string;
    name: string;
    warning: string;
  } | null>(null);
  const [generating, setGenerating] = useState(false);

  const {
    data: tokens,
    loading: tokensLoading,
    refresh: refreshTokens,
  } = usePolling<SCIMTokenItem[]>(
    useCallback((_signal) => scim.tokens(), []),
    10000
  );

  const scimBaseUrl = typeof window !== "undefined"
    ? `${window.location.origin.replace("5173", "8000")}/scim/v2`
    : "http://localhost:8000/scim/v2";

  async function handleGenerateToken() {
    setGenerating(true);
    try {
      const res = await scim.generateToken(tokenName);
      setGeneratedToken(res);
      setIsGenerating(false);
      refreshTokens();
    } catch (err: any) {
      alert(err.message || "Failed to generate SCIM token");
    } finally {
      setGenerating(false);
    }
  }

  function handleCopy(text: string, type: "url" | "token") {
    navigator.clipboard.writeText(text);
    if (type === "url") {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  }

  return (
    <div className="space-y-6">
      <Header
        title="SCIM 2.0 Identity Provisioning"
        description="Automate enterprise user lifecycle synchronization, role assignments, and instant deprovisioning from identity providers (Okta, Microsoft Entra ID, OneLogin)."
        action={
          <Button
            variant="default"
            size="sm"
            onClick={() => setIsGenerating(true)}
            className="flex items-center gap-1.5"
          >
            <Plus size={14} /> Generate SCIM Token
          </Button>
        }
      />

      {/* Connection Info Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="material-base">
          <CardHeader className="border-b border-hairline pb-3">
            <CardTitle className="text-sm font-semibold text-ink-primary flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Server size={16} className="text-accent" />
                <span>SCIM 2.0 Base URL</span>
              </span>
              <Badge variant="outline" className="font-mono text-[10px]">
                RFC 7644
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={scimBaseUrl}
                className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-xs font-mono text-ink-primary select-all"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(scimBaseUrl, "url")}
                className="shrink-0"
              >
                {copiedUrl ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </Button>
            </div>
            <p className="text-[11px] text-ink-muted">
              Configure this as the SCIM connector base URL in your enterprise Identity Provider.
            </p>
          </CardContent>
        </Card>

        <Card className="material-base">
          <CardHeader className="border-b border-hairline pb-3">
            <CardTitle className="text-sm font-semibold text-ink-primary flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Shield size={16} className="text-emerald-400" />
                <span>Authentication Method</span>
              </span>
              <Badge variant="success" className="text-[10px]">
                OAuth Bearer Token
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-ink-primary font-medium">
              SCIM Bearer Token Authentication
            </p>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              Use a dedicated SCIM provisioning token generated below or your standard workspace API key. Tokens are hashed with SHA-256 at rest.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Generated Token Dialog/Banner */}
      {generatedToken && (
        <div className="p-4 rounded-xl bg-accent/10 border border-accent/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-accent">New SCIM Token Created: {generatedToken.name}</span>
            <span className="text-[10px] text-amber-400 font-medium">Save this token now</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={generatedToken.token}
              className="w-full bg-surface border border-accent/30 rounded-lg px-3 py-2 text-xs font-mono text-ink-primary select-all"
            />
            <Button
              variant="default"
              size="sm"
              onClick={() => handleCopy(generatedToken.token, "token")}
            >
              {copiedToken ? <Check size={14} /> : <Copy size={14} />}
            </Button>
          </div>
          <p className="text-[11px] text-ink-muted">{generatedToken.warning}</p>
        </div>
      )}

      {/* Active SCIM Tokens */}
      <Card className="material-base">
        <CardHeader className="border-b border-hairline pb-4">
          <CardTitle className="text-base font-semibold text-ink-primary flex items-center gap-2">
            <KeyRound size={18} className="text-accent" />
            <span>Active SCIM Provisioning Tokens</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-hairline bg-surface-elevated/40 text-ink-muted font-medium">
                  <th className="py-3 px-4">Token Name</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4">Last Synchronized</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {tokensLoading ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-ink-muted">
                      Loading tokens...
                    </td>
                  </tr>
                ) : tokens && tokens.length > 0 ? (
                  tokens.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-elevated/30 transition-colors">
                      <td className="py-3 px-4 font-semibold text-ink-primary flex items-center gap-2">
                        <KeyRound size={14} className="text-accent" />
                        {t.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-ink-muted">
                        {t.created_at ? new Date(t.created_at).toLocaleDateString() : "-"}
                      </td>
                      <td className="py-3 px-4 font-mono text-ink-muted">
                        {t.last_used_at ? new Date(t.last_used_at).toLocaleString() : "Never"}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="success" className="text-[10px]">
                          Active
                        </Badge>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-ink-muted">
                      No dedicated SCIM tokens created yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* IdP Guides Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="material-base">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-ink-primary flex items-center gap-2">
              <BookOpen size={16} className="text-indigo-400" />
              <span>Okta Setup Guide</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-ink-muted space-y-2">
            <p>
              1. Add an Application in Okta with SCIM Provisioning enabled.
            </p>
            <p>
              2. Paste the SCIM Base URL and OAuth Bearer Token.
            </p>
            <p>
              3. Enable <strong>Create Users</strong>, <strong>Update Attributes</strong>, and <strong>Deactivate Users</strong>.
            </p>
          </CardContent>
        </Card>

        <Card className="material-base">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-ink-primary flex items-center gap-2">
              <BookOpen size={16} className="text-blue-400" />
              <span>Microsoft Entra ID (Azure AD)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-ink-muted space-y-2">
            <p>
              1. In Microsoft Entra ID, select Enterprise Applications &rarr; Provisioning.
            </p>
            <p>
              2. Set Provisioning Mode to Automatic and enter the Tenant URL and Secret Token.
            </p>
            <p>
              3. Test Connection and start automatic sync cycle.
            </p>
          </CardContent>
        </Card>

        <Card className="material-base">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-ink-primary flex items-center gap-2">
              <BookOpen size={16} className="text-emerald-400" />
              <span>OneLogin Integration</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-ink-muted space-y-2">
            <p>
              1. Use OneLogin SCIM V2 Enterprise Provisioner.
            </p>
            <p>
              2. Configure SCIM JSON API endpoint and Bearer Authorization Header.
            </p>
            <p>
              3. Enable real-time push synchronization on user changes.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Generate Token Modal */}
      {isGenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="material-elevated border border-hairline-strong rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-ink-primary">Generate Dedicated SCIM Token</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-ink-muted font-medium mb-1">Token Name / Integration Label</label>
                <input
                  type="text"
                  placeholder="e.g. Okta Production SCIM"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-2 text-ink-primary font-sans"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsGenerating(false)}>
                Cancel
              </Button>
              <Button variant="default" size="sm" disabled={generating} onClick={handleGenerateToken}>
                {generating ? "Generating..." : "Generate Token"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
