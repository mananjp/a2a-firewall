"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/site/Chrome";
import { auth, setApiKey, workspaces } from "@/lib/api";

const TABS = ["Sign In", "Provision", "API Key"] as const;

const PERSONAS = [
  { name: "Admin", desc: "Full permissions & policy control", email: "admin@mesh.dev" },
  { name: "Auditor", desc: "Read-only inspection & lineage audit", email: "auditor@mesh.dev" },
  { name: "Operator", desc: "Review queue adjudication", email: "operator@mesh.dev" },
  { name: "Traffic", desc: "Direct agent inspection gateway", email: "traffic@mesh.dev" },
];

export default function LoginPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Sign In");
  const [email, setEmail] = useState("");
  const [slug, setSlug] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (tab === "API Key") {
        if (!apiKeyInput.trim()) {
          throw new Error("Please enter a valid Bearer API key");
        }
        setApiKey(apiKeyInput.trim());
        router.push("/dashboard");
        return;
      }

      if (tab === "Provision") {
        const workspaceName = slug.trim() || "Production Mesh";
        const adminEmail = email.trim() || "admin@mesh.dev";
        const res = await workspaces.register({
          name: workspaceName,
          admin_email: adminEmail,
        });
        if (res.api_key) {
          setApiKey(res.api_key);
        }
        router.push("/dashboard");
        return;
      }

      // Sign In
      const userEmail = email.trim() || "operator@mesh.dev";
      try {
        const res = await auth.login(userEmail);
        if (res.api_key) {
          setApiKey(res.api_key);
        }
      } catch {
        // If user doesn't exist, auto-provision for seamless demo experience
        const res = await workspaces.register({
          name: "Default Workspace",
          admin_email: userEmail,
        });
        if (res.api_key) {
          setApiKey(res.api_key);
        }
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePersonaLogin = async (personaEmail: string) => {
    setLoading(true);
    setError(null);
    try {
      try {
        const res = await auth.login(personaEmail);
        if (res.api_key) {
          setApiKey(res.api_key);
        }
      } catch {
        const res = await workspaces.register({
          name: `${personaEmail.split("@")[0]} Workspace`,
          admin_email: personaEmail,
        });
        if (res.api_key) {
          setApiKey(res.api_key);
        }
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Persona login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* left panel */}
      <div className="relative hidden flex-col justify-between border-r border-ink bg-ink p-12 text-paper lg:flex">
        <div className="grid-paper absolute inset-0 opacity-20" />
        <div className="relative flex items-center gap-2">
          <span className="grid h-6 w-6 grid-cols-2 grid-rows-2 gap-[2px]">
            <span className="bg-paper" />
            <span className="bg-violet" />
            <span className="bg-lime" />
            <span className="bg-paper" />
          </span>
          <span className="font-display text-lg font-extrabold">A2A_</span>
        </div>
        <div className="relative">
          <h1 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] font-extrabold leading-[0.85]">
            Access
            <br />
            Governance
            <br />
            Mesh
          </h1>
          <p className="mt-6 max-w-sm font-mono text-xs leading-relaxed text-paper/60">
            Six-gate inspection, cryptographic lineage and deterministic verdicts for every inter-agent request.
          </p>
        </div>
        <pre className="relative font-mono text-[11px] leading-relaxed text-paper/50">{`> auth.handshake --mode=ed25519
> ledger.lookup  --agent=soc-operator
> session.mint   --ttl=900s
STATUS: live backend connected_`}</pre>
      </div>


      {/* right panel */}
      <div className="flex flex-col bg-paper">
        <div className="flex items-center justify-between border-b border-ink/20 px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2 label-mono hover:text-violet">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to home
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/demo"
              className="inline-flex items-center gap-1.5 border border-ink bg-lime px-3 py-1.5 label-mono text-lime-foreground transition-colors hover:bg-ink hover:text-paper"
            >
              Explore Live Demo
              <ArrowUpRight className="h-3 w-3" />
            </Link>
            <span className="lg:hidden">
              <Logo />
            </span>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md flex-1 px-6 py-12">
          <span className="label-mono text-violet">SOC Authentication</span>
          <h2 className="mt-4 font-display text-3xl font-extrabold">Sign in</h2>
          <p className="mt-3 font-mono text-xs leading-relaxed text-muted-foreground">
            Authenticate with workspace administrator credentials or a bearer key.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-px border border-ink bg-ink/15">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}
                className={`px-2 py-3 label-mono transition-colors ${
                  tab === t ? "bg-ink text-paper" : "bg-paper hover:bg-secondary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 border border-destructive bg-destructive/10 p-3 font-mono text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form className="mt-8 space-y-5" onSubmit={handleLogin}>
            {tab === "API Key" ? (
              <label className="block">
                <span className="label-mono text-muted-foreground">Bearer API key</span>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="a2a_sk_live_••••••••••••"
                  className="mt-2 w-full border border-ink bg-transparent px-4 py-3 font-mono text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:border-violet focus:ring-1 focus:ring-violet"
                />
              </label>
            ) : (
              <>
                <label className="block">
                  <span className="label-mono text-muted-foreground">Administrator email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@mesh.io"
                    className="mt-2 w-full border border-ink bg-transparent px-4 py-3 font-mono text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:border-violet focus:ring-1 focus:ring-violet"
                  />
                </label>
                {tab === "Provision" && (
                  <label className="block">
                    <span className="label-mono text-muted-foreground">Workspace name</span>
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="acme-agent-mesh"
                      className="mt-2 w-full border border-ink bg-transparent px-4 py-3 font-mono text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:border-violet focus:ring-1 focus:ring-violet"
                    />
                  </label>
                )}
              </>
            )}
            <button
              type="submit"
              disabled={loading}
              className="group inline-flex w-full items-center justify-center gap-3 border border-ink bg-ink px-6 py-4 label-mono text-paper transition-colors hover:border-violet hover:bg-violet disabled:opacity-50"
            >
              {loading ? "Authenticating..." : tab === "Provision" ? "Provision workspace" : "Sign in to dashboard"}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          </form>

          <div className="mt-12">
            <span className="label-mono text-muted-foreground">Fast demo persona access</span>
            <div className="mt-4 grid gap-px border border-ink bg-ink/15 sm:grid-cols-2">
              {PERSONAS.map(({ name, desc, email: pEmail }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => handlePersonaLogin(pEmail)}
                  className="bg-paper px-4 py-4 text-left transition-colors hover:bg-violet hover:text-violet-foreground"
                >
                  <span className="block font-display text-sm font-bold uppercase">{name}</span>
                  <span className="mt-1 block font-mono text-[11px] opacity-70">{desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
