"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Maximize2 } from "lucide-react";
import { SectionHead, SiteFooter, SiteHeader } from "@/components/site/Chrome";
import { Sandbox } from "@/components/site/Sandbox";

const PRINCIPLES = [
  { n: "L1", t: "Rate Limiting", d: "Per-agent quotas. Burst control. No flood reaches the mesh." },
  { n: "L2", t: "Cryptographic Preflight", d: "Ed25519 signatures, monotonic nonces, timestamp freshness." },
  { n: "L3", t: "Schema Contract", d: "Typed payloads only. Malformed intent never gets parsed." },
  { n: "L4", t: "Macaroon Permissions", d: "Attenuated delegation. Children can only ever do less." },
  { n: "L5", t: "Deterministic Rules", d: "48 deny rules. Explicit policy over probabilistic hope." },
  { n: "L6", t: "Groq Semantic Guard", d: "Sub-20ms inference on injection, jailbreak and intent drift." },
];

const CAPABILITIES = [
  {
    tag: "Layer 2",
    t: "Cryptographic Identity",
    d: "Every agent carries an Ed25519 keypair. Messages are signed and nonces verified on the wire — impersonation and replay are physically impossible.",
  },
  {
    tag: "Layer 4 & 5",
    t: "Attenuable Delegation",
    d: "When A delegates to B and B to C, C can only do less than A — never more. Enforced by HMAC caveat chaining.",
  },
  {
    tag: "Layer 6",
    t: "Semantic Guard",
    d: "Groq Llama 3.1 catches indirect prompt injection, jailbreaks and drift from the root task's declared intent in real time.",
  },
];

const STACK = ["ED25519", "MACAROONS", "GROQ LPU", "OPENTELEMETRY", "POSTGRES", "LLAMA 3.1", "HMAC-SHA256"];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />

      {/* /01 HERO */}
      <section className="border-b border-ink/20">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 lg:grid-cols-[1.05fr_1fr] lg:px-8 lg:py-20">
          <div className="min-w-0">
            <span className="label-mono text-violet">/01</span>
            <h1 className="mt-6 font-display text-[clamp(2.75rem,9vw,6.5rem)] font-extrabold leading-[0.85]">
              Agent
              <br />
              Firewall
            </h1>
            <p className="mt-6 label-mono text-violet">Intercept. Inspect. Adjudicate.</p>
            <p className="mt-5 max-w-lg font-mono text-sm leading-relaxed text-muted-foreground">
              A2A Firewall intercepts every inter-agent request, runs a sequential six-layer cryptographic and
              semantic inspection pipeline in under 20ms, and emits deterministic Allow, Block or Review verdicts
              with cryptographic lineage.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/login"
                className="group inline-flex items-center gap-3 border border-ink bg-ink px-6 py-4 label-mono text-paper transition-colors hover:border-violet hover:bg-violet"
              >
                Launch SOC
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <a href="#sandbox" className="inline-flex items-center gap-3 px-2 py-4 label-mono hover:text-violet">
                Live Simulation <Maximize2 className="h-3.5 w-3.5" />
              </a>
            </div>

            <dl className="mt-12 grid grid-cols-2 gap-px border border-ink/20 bg-ink/15 sm:grid-cols-4">
              {[
                ["6", "Inspection gates"],
                ["<20ms", "P99 latency"],
                ["Closed", "Default fail mode"],
                ["OTel", "Trace lineage"],
              ].map(([v, l]) => (
                <div key={l} className="bg-paper px-4 py-4">
                  <dt className="font-display text-xl font-extrabold">{v}</dt>
                  <dd className="mt-1 label-mono text-muted-foreground">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative min-w-0 border border-ink">
            <div className="absolute left-4 top-4 z-10 border border-ink bg-paper px-3 py-1.5 label-mono">
              <span className="mr-2 inline-block h-1.5 w-1.5 bg-lime" />
              Rendering mesh · 83%
            </div>
            <Image
              src="/mesh-render.jpg"
              alt="Isometric wireframe render of an inspected agent mesh"
              width={1200}
              height={1008}
              priority
              className="h-full w-full object-cover"
            />
            <div className="absolute bottom-4 right-4 border border-ink bg-lime px-3 py-2 font-mono text-[11px] leading-tight text-lime-foreground">
              <div>X_36.1749</div>
              <div>Y_-86.7676</div>
              <div>Z_46.6827</div>
            </div>
          </div>
        </div>
      </section>

      {/* /02 PIPELINE */}
      <section id="pipeline" className="border-b border-ink/20">
        <div className="mx-auto max-w-[1400px] px-4 py-14 lg:px-8">
          <SectionHead index="02" title="Six-Gate Pipeline" />
          <div className="mt-px grid gap-px bg-ink/15 sm:grid-cols-2 lg:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <div key={p.n} className="group bg-paper p-6 transition-colors hover:bg-secondary">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-violet">{p.n}</span>
                  <span className="text-muted-foreground">+</span>
                </div>
                <h3 className="mt-6 font-display text-base font-bold">{p.t}</h3>
                <p className="mt-3 font-mono text-xs leading-relaxed text-muted-foreground">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* /03 SANDBOX */}
      <section id="sandbox" className="border-b border-ink/20">
        <div className="mx-auto max-w-[1400px] px-4 py-14 lg:px-8">
          <SectionHead index="03" title="Interactive Attack Sandbox">
            <span className="label-mono text-muted-foreground">4 scenarios · fail-closed</span>
          </SectionHead>
          <div className="mt-8">
            <Sandbox />
          </div>
        </div>
      </section>

      {/* /04 ARCHITECTURE */}
      <section id="architecture" className="border-b border-ink/20">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 lg:grid-cols-[1fr_1.1fr] lg:px-8">
          <div>
            <SectionHead index="04" title="Wire Protocol" />
            <p className="mt-6 max-w-md font-mono text-sm leading-relaxed text-muted-foreground">
              Every message on the mesh carries a signed identity header and a replay nonce. The gateway validates
              the public key against the Agent Identity Ledger, enforces monotonic nonces, and checks timestamp
              freshness against a 300s cache.
            </p>
            <ul className="mt-8 space-y-3">
              {[
                "Zero agent impersonation across trust boundaries",
                "Strict replay mitigation with 300s nonce cache",
                "Signed headers compatible with OpenTelemetry",
              ].map((li) => (
                <li key={li} className="flex gap-3 font-mono text-xs text-ink">
                  <span className="text-violet">+</span>
                  {li}
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-ink bg-ink p-6 text-paper">
            <div className="label-mono text-paper/50">{"// a2a wire protocol headers"}</div>
            <pre className="mt-4 overflow-x-auto font-mono text-[11px] leading-relaxed">{`X-Agent-ID:   "portfolio-manager-01"
X-Signature:  "ed25519:7f8a9e2b1c4d0e91a2b3c4d5e6f7a8b9"
X-Nonce:      "0x9f18a24c00ef12ab"
X-Timestamp:  "2026-08-17T10:00:00.000Z"  // age 120ms
X-Caveats:    "issuer:admin; scope:market_analytics.read;
               depth:1; ttl:300s"

// intercepted payload
{
  "action": "fetch_volatility_summary",
  "pair": "ETH/USD",
  "window_days": 30,
  "format": "risk_adjusted_markdown"
}`}</pre>
            <div className="mt-6 inline-block bg-lime px-3 py-2 label-mono text-lime-foreground">
              Cryptographically verified by sentinel gateway
            </div>
          </div>
        </div>
      </section>

      {/* /05 CAPABILITIES */}
      <section id="capabilities" className="border-b border-ink/20">
        <div className="mx-auto max-w-[1400px] px-4 py-14 lg:px-8">
          <SectionHead index="05" title="Complete Security Stack" />
          <div className="mt-px grid gap-px bg-ink/15 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <div key={c.t} className="bg-paper p-8">
                <span className="inline-block border border-ink px-2 py-1 label-mono">{c.tag}</span>
                <h3 className="mt-6 font-display text-xl font-extrabold leading-tight">{c.t}</h3>
                <p className="mt-4 font-mono text-xs leading-relaxed text-muted-foreground">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* /06 STATUS + CTA */}
      <section className="border-b border-ink/20">
        <div className="mx-auto grid max-w-[1400px] gap-px bg-ink/15 px-0 lg:grid-cols-2">
          <div className="bg-paper p-8 lg:p-14">
            <span className="label-mono text-violet">/06</span>
            <h2 className="mt-6 font-display text-3xl font-extrabold leading-[0.9] sm:text-4xl">
              Deploy the
              <br />
              perimeter
            </h2>
            <p className="mt-5 max-w-sm font-mono text-xs leading-relaxed text-muted-foreground">
              Secure inter-agent communication, stop privilege escalation, and keep auditable cryptographic
              compliance across every delegation hop.
            </p>
            <Link
              href="/login"
              className="group mt-8 inline-flex items-center gap-3 border border-ink bg-ink px-6 py-4 label-mono text-paper transition-colors hover:border-violet hover:bg-violet"
            >
              Get access
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
          <div className="bg-paper p-8 lg:p-14">
            <span className="label-mono text-violet">/07</span>
            <h2 className="mt-6 font-display text-xl font-extrabold">System Status</h2>
            <div className="mt-8 space-y-5">
              {[
                ["Gateway load", "72%", 72],
                ["Nonce cache", "8.6 / 16 GB", 54],
                ["Uptime", "7d 14h 22m", 99],
                ["Mesh network", "SECURE", 100],
              ].map(([l, v, p]) => (
                <div key={l as string}>
                  <div className="flex items-baseline justify-between font-mono text-[11px]">
                    <span className="label-mono text-muted-foreground">{l}</span>
                    <span>{v}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full bg-ink/10">
                    <div className="h-full bg-violet" style={{ width: `${p as number}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 border border-ink bg-lime px-4 py-3 label-mono text-lime-foreground">
              All systems operational
            </div>
          </div>
        </div>
      </section>

      {/* stack marquee */}
      <section className="overflow-hidden border-b border-ink/20 py-8">
        <div className="flex w-max marquee-track gap-14 pr-14">
          {[...STACK, ...STACK].map((s, i) => (
            <span key={`${s}-${i}`} className="font-display text-2xl font-extrabold text-ink/25">
              {s}
            </span>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
