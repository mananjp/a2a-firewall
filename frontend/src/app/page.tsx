"use client";

import Link from "next/link";
import { ShieldAlert, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
              <ShieldAlert size={15} strokeWidth={2.2} />
            </div>
            <span className="text-sm font-semibold">A2A Firewall</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/mananjp/a2a-firewall"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <Link href="/login">
              <Button variant="secondary" size="sm">
                Sign in
                <ArrowRight size={13} />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-20 sm:py-32">
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Inter-agent governance mesh
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            The governance layer
            <br />
            for autonomous agents.
          </h1>
          <p className="mt-5 max-w-lg text-base text-muted-foreground leading-relaxed">
            A2A Firewall intercepts every message between AI agents, runs it
            through a six-layer inspection pipeline, and emits a defensible
            decision with full lineage. Purpose-built for banks correlating
            agent traffic with fraud signals.
          </p>
          <div className="mt-8 flex items-center gap-6 text-sm">
            <div>
              <div className="text-2xl font-semibold">6</div>
              <div className="text-xs text-muted-foreground">Inspection layers</div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="text-2xl font-semibold">Closed</div>
              <div className="text-xs text-muted-foreground">Default fail-mode</div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="text-2xl font-semibold">OTel</div>
              <div className="text-xs text-muted-foreground">Native tracing</div>
            </div>
          </div>
          <div className="mt-10">
            <Link href="/login">
              <Button variant="secondary" size="lg">
                Get started
                <ArrowRight size={15} />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-lg font-semibold mb-8">How it works</h2>
          <div className="grid grid-cols-3 gap-6">
            {[
              {
                title: "Cryptographic Identity",
                desc: "Every agent has an Ed25519 keypair. Messages are signed — no impersonation possible.",
                tag: "Identity",
              },
              {
                title: "Attenuable Delegation",
                desc: "When A delegates to B who delegates to C, C can only do less than A — never more.",
                tag: "Delegation",
              },
              {
                title: "Structured Telemetry",
                desc: "Every decision emits a structured event for correlation with fraud and transaction data.",
                tag: "Correlation",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-border bg-surface p-5"
              >
                <div className="text-xs font-medium text-accent mb-2">
                  {item.tag}
                </div>
                <div className="text-sm font-medium mb-1">{item.title}</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        A2A Firewall — inter-agent governance mesh
      </footer>
    </div>
  );
}
