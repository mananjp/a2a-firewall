"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/site/Chrome";

const TABS = ["Sign In", "Provision", "API Key"] as const;

const PERSONAS = [
  ["Admin", "Full permissions"],
  ["Auditor", "Read-only access"],
  ["Trial", "Standard bounds"],
  ["Traffic", "Agent gateway"],
];

export default function LoginPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Sign In");
  const router = useRouter();

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
STATUS: awaiting operator credentials_`}</pre>
      </div>

      {/* right panel */}
      <div className="flex flex-col bg-paper">
        <div className="flex items-center justify-between border-b border-ink/20 px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2 label-mono hover:text-violet">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to home
          </Link>
          <span className="lg:hidden">
            <Logo />
          </span>
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
                onClick={() => setTab(t)}
                className={`px-2 py-3 label-mono transition-colors ${
                  tab === t ? "bg-ink text-paper" : "bg-paper hover:bg-secondary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <form
            className="mt-8 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              router.push("/dashboard");
            }}
          >
            {tab === "API Key" ? (
              <Field label="Bearer API key" type="password" placeholder="a2a_sk_live_••••••••••••" />
            ) : (
              <>
                <Field label="Administrator email" type="email" placeholder="operator@mesh.io" />
                <Field label="Passphrase" type="password" placeholder="••••••••••••" />
                {tab === "Provision" && (
                  <Field label="Workspace slug" type="text" placeholder="acme-agent-mesh" />
                )}
              </>
            )}
            <button
              type="submit"
              className="group inline-flex w-full items-center justify-center gap-3 border border-ink bg-ink px-6 py-4 label-mono text-paper transition-colors hover:border-violet hover:bg-violet"
            >
              {tab === "Provision" ? "Provision workspace" : "Sign in to dashboard"}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          </form>

          <div className="mt-12">
            <span className="label-mono text-muted-foreground">Fast demo persona access</span>
            <div className="mt-4 grid gap-px border border-ink bg-ink/15 sm:grid-cols-2">
              {PERSONAS.map(([name, desc]) => (
                <Link
                  key={name}
                  href="/dashboard"
                  className="bg-paper px-4 py-4 transition-colors hover:bg-violet hover:text-violet-foreground"
                >
                  <span className="block font-display text-sm font-bold uppercase">{name}</span>
                  <span className="mt-1 block font-mono text-[11px] opacity-70">{desc}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, type, placeholder }: { label: string; type: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="label-mono text-muted-foreground">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        className="mt-2 w-full border border-ink bg-transparent px-4 py-3 font-mono text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:border-violet focus:ring-1 focus:ring-violet"
      />
    </label>
  );
}
