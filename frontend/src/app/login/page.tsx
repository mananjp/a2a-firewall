"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth, workspaces, setApiKey } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ShieldAlert, ArrowRight, KeyRound, UserPlus, TestTube2, ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

type Tab = "signin" | "register" | "apikey";

const DEMO_ROLES = [
  { email: "admin@a2afirewall.dev", label: "Admin", desc: "Full permissions" },
  { email: "auditor@a2afirewall.dev", label: "Auditor", desc: "Read-only access" },
  { email: "trial@a2afirewall.dev", label: "Trial", desc: "Standard bounds" },
  { email: "traffic@a2afirewall.dev", label: "Traffic", desc: "Agent gateway" },
];

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await auth.login(email);
      setApiKey(res.api_key);
      toast({
        title: "Authenticated",
        description: `Workspace: ${res.admin_email}`,
        variant: "success",
      });
      router.push("/dashboard");
    } catch (err) {
      toast({
        title: "Authentication Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await workspaces.register({ name, admin_email: email });
      setApiKey(res.api_key);
      toast({
        title: "Workspace Provisioned",
        description: res.name,
        variant: "success",
      });
      router.push("/dashboard");
    } catch (err) {
      toast({
        title: "Registration Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleApiKey(e: FormEvent) {
    e.preventDefault();
    if (apiKeyInput.trim()) {
      setApiKey(apiKeyInput.trim());
      toast({ title: "API Key Connected", variant: "success" });
      router.push("/dashboard");
    }
  }

  async function handleDemoRole(demoEmail: string) {
    setLoading(true);
    try {
      const res = await auth.login(demoEmail);
      setApiKey(res.api_key);
      toast({
        title: "Demo Role Granted",
        description: `${demoEmail.split("@")[0]} workspace`,
        variant: "success",
      });
      router.push("/dashboard");
    } catch (err) {
      toast({
        title: "Demo Login Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-base text-ink-primary flex flex-col">
      <header className="material-soft border-b border-hairline bg-surface/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink-primary transition-colors font-mono"
          >
            <ArrowLeft size={14} />
            Back to Home
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-allow/10 border border-allow/25 p-1 glow-allow shadow-sm">
              <Image
                src="/a2a-logo.png"
                alt="A2A Logo"
                width={28}
                height={28}
                className="object-contain"
              />
            </div>
            <span className="text-[14px] font-bold tracking-tight text-ink-primary">A2A Firewall</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="eyebrow mb-2">SOC Authentication</div>
            <h1 className="text-[24px] font-bold tracking-tight text-ink-primary">
              Access Governance Mesh
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-muted">
              Authenticate with your workspace administrator credentials or bearer key.
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="mb-4 flex gap-1 rounded-xl border border-hairline bg-surface p-1">
            {([
              { id: "signin", label: "Sign In", icon: ArrowRight },
              { id: "register", label: "Provision", icon: UserPlus },
              { id: "apikey", label: "API Key", icon: KeyRound },
            ] as const).map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-all ${
                    active
                      ? "bg-surface-elevated text-ink-primary border border-hairline-strong shadow-sm font-semibold"
                      : "text-ink-muted hover:text-ink-primary border border-transparent"
                  }`}
                >
                  <t.icon size={13} />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="material-panel rounded-2xl p-6 shadow-popover">
            {tab === "signin" && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <Input
                  label="Administrator Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@enterprise.com"
                  required
                />
                <Button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full font-mono text-[13px]"
                >
                  {loading ? "Authenticating..." : "Sign in to Dashboard"}
                </Button>
              </form>
            )}

            {tab === "register" && (
              <form onSubmit={handleRegister} className="space-y-4">
                <Input
                  label="Workspace Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="production-mesh"
                  required
                />
                <Input
                  label="Administrator Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@enterprise.com"
                  required
                />
                <Button
                  type="submit"
                  disabled={loading || !name || !email}
                  className="w-full font-mono text-[13px]"
                >
                  {loading ? "Provisioning..." : "Provision Workspace"}
                </Button>
              </form>
            )}

            {tab === "apikey" && (
              <form onSubmit={handleApiKey} className="space-y-4">
                <Input
                  label="Bearer Workspace Key"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="ws_..."
                  required
                />
                <Button
                  type="submit"
                  disabled={!apiKeyInput.trim()}
                  className="w-full font-mono text-[13px]"
                >
                  Connect Key
                </Button>
              </form>
            )}
          </div>

          {/* Quick Demo Access */}
          <div className="mt-6">
            <div className="eyebrow mb-2.5">Fast Demo Persona Access</div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ROLES.map((r) => (
                <button
                  key={r.email}
                  onClick={() => handleDemoRole(r.email)}
                  disabled={loading}
                  className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface px-3 py-2.5 text-left text-[12px] transition-all hover:border-hairline-strong hover:bg-surface-elevated disabled:opacity-40"
                >
                  <TestTube2 size={14} className="shrink-0 text-accent" />
                  <div className="min-w-0">
                    <div className="font-semibold text-ink-primary">{r.label}</div>
                    <div className="truncate text-ink-muted text-[11px] font-mono">{r.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
