"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth, workspaces, setApiKey } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ShieldAlert, ArrowRight, KeyRound, UserPlus, TestTube2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type Tab = "signin" | "register" | "apikey";

const DEMO_ROLES = [
  { email: "admin@a2afirewall.dev", label: "Admin", desc: "Full access" },
  { email: "auditor@a2afirewall.dev", label: "Auditor", desc: "Read-only" },
  { email: "trial@a2afirewall.dev", label: "Trial", desc: "Limited" },
  { email: "traffic@a2afirewall.dev", label: "Traffic", desc: "Agent only" },
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
        title: "Signed in",
        description: `Workspace: ${res.admin_email}`,
        variant: "success",
      });
      router.push("/dashboard");
    } catch (err) {
      toast({
        title: "Sign in failed",
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
        title: "Workspace created",
        description: res.name,
        variant: "success",
      });
      router.push("/dashboard");
    } catch (err) {
      toast({
        title: "Registration failed",
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
      toast({ title: "Connected", variant: "success" });
      router.push("/dashboard");
    }
  }

  async function handleDemoRole(demoEmail: string) {
    setLoading(true);
    try {
      const res = await auth.login(demoEmail);
      setApiKey(res.api_key);
      toast({
        title: "Demo access granted",
        description: `${demoEmail.split("@")[0]} workspace`,
        variant: "success",
      });
      router.push("/dashboard");
    } catch (err) {
      toast({
        title: "Demo login failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={13} />
            Back to home
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
              <ShieldAlert size={15} strokeWidth={2.2} />
            </div>
            <span className="text-sm font-semibold">A2A Firewall</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-xl font-semibold">Welcome</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sign in to your workspace or create a new one.
            </p>
          </div>

          {/* Tabs */}
          <div className="mb-4 flex gap-1 rounded-md border border-border bg-surface p-1">
            {([
              { id: "signin", label: "Sign in", icon: ArrowRight },
              { id: "register", label: "Register", icon: UserPlus },
              { id: "apikey", label: "API Key", icon: KeyRound },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.id
                    ? "bg-surface-elevated text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon size={13} />
                {t.label}
              </button>
            ))}
          </div>

          <Card>
            {tab === "signin" && (
              <form onSubmit={handleSignIn} className="space-y-3">
                <Input
                  label="Workspace email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                />
                <Button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            )}

            {tab === "register" && (
              <form onSubmit={handleRegister} className="space-y-3">
                <Input
                  label="Workspace name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-workspace"
                  required
                />
                <Input
                  label="Admin email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                />
                <Button
                  type="submit"
                  disabled={loading || !name || !email}
                  className="w-full"
                >
                  {loading ? "Creating..." : "Create workspace"}
                </Button>
              </form>
            )}

            {tab === "apikey" && (
              <form onSubmit={handleApiKey} className="space-y-3">
                <Input
                  label="API key"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="ws_..."
                  required
                />
                <Button
                  type="submit"
                  disabled={!apiKeyInput.trim()}
                  className="w-full"
                >
                  Connect
                </Button>
              </form>
            )}
          </Card>

          {/* Demo roles */}
          <div className="mt-5">
            <div className="mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Quick demo access
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ROLES.map((r) => (
                <button
                  key={r.email}
                  onClick={() => handleDemoRole(r.email)}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5 text-left text-xs transition-colors hover:border-border/80 hover:bg-surface-elevated disabled:opacity-40"
                >
                  <TestTube2 size={13} className="shrink-0 text-muted" />
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{r.label}</div>
                    <div className="truncate text-muted-foreground">{r.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-md border border-warning/20 bg-warning/5 p-3 text-xs text-warning/80">
            <span className="font-semibold text-warning">Dev-only build.</span>{" "}
            Uses localStorage and auto-provisioned workspaces. Replace before production.
          </div>
        </div>
      </main>
    </div>
  );
}
