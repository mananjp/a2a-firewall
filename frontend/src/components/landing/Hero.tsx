import { Logo } from "./Logo";

interface HeroProps {
  onSignInClick: () => void;
}

export function Hero({ onSignInClick }: HeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 bg-hero-radial"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-grid-faint bg-grid-32 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />

      <div className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
          <a href="#features" className="hover:text-white">Features</a>
          <a href="#pipeline" className="hover:text-white">Pipeline</a>
          <a href="#auth" className="hover:text-white">Sign in</a>
          <a
            href="https://github.com/mananjp/a2a-firewall"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white"
          >
            GitHub ↗
          </a>
        </nav>
        <button
          type="button"
          onClick={onSignInClick}
          className="btn-ghost text-sm"
          data-testid="hero-signin"
        >
          Sign in
        </button>
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:pt-20">
        <div className="lg:col-span-7">
          <span className="chip mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> MVP — inter-agent governance mesh
          </span>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            The{" "}
            <span className="gradient-text-accent">governance mesh</span>
            <br />
            for autonomous agents.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-300">
            A2A Firewall intercepts every message between AI agents, runs it through a
            six-layer inspection pipeline, and emits a defensible{" "}
            <span className="font-mono text-emerald-300">allow</span> /{" "}
            <span className="font-mono text-red-300">block</span> /{" "}
            <span className="font-mono text-amber-300">review</span> decision — with full
            OpenTelemetry lineage.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onSignInClick}
              className="btn-shimmer rounded-md px-5 py-2.5 text-sm font-semibold shadow-lg shadow-blue-900/40"
              data-testid="hero-cta-signin"
            >
              Sign in to dashboard →
            </button>
            <a
              href="#features"
              className="rounded-md border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Explore the platform
            </a>
          </div>

          <dl className="mt-10 grid max-w-xl grid-cols-3 gap-6 text-left">
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Inspection</dt>
              <dd className="mt-1 text-2xl font-semibold text-white">6 layers</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Fail-mode</dt>
              <dd className="mt-1 text-2xl font-semibold text-white">Closed default</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Tracing</dt>
              <dd className="mt-1 text-2xl font-semibold text-white">OTel native</dd>
            </div>
          </dl>
        </div>

        <div className="relative lg:col-span-5">
          <HeroDiagram />
        </div>
      </div>
    </section>
  );
}

function HeroDiagram() {
  return (
    <div className="glass ring-soft relative rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <span className="text-[10px] uppercase tracking-widest text-slate-400">
          live decision trace
        </span>
      </div>
      <div className="space-y-2 font-mono text-xs">
        <Node label="Agent A · planner" tone="blue" />
        <Connector />
        <Node label="A2A Firewall" tone="cyan" emphasis />
        <div className="ml-3 space-y-1 border-l border-slate-700 pl-3">
          <SubNode label="L0  preflight" status="allow" />
          <SubNode label="L1  schema" status="allow" />
          <SubNode label="L2  permissions" status="allow" />
          <SubNode label="L3  rules" status="review" />
          <SubNode label="L4  groq semantic" status="allow" />
          <SubNode label="L5  decision" status="review" />
        </div>
        <Connector />
        <Node label="Manual review queue" tone="amber" emphasis />
      </div>
      <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        <span className="font-semibold">decision: review</span> · risk 0.42 · 38 ms
      </div>
    </div>
  );
}

function Node({
  label,
  tone,
  emphasis,
}: {
  label: string;
  tone: "blue" | "cyan" | "amber";
  emphasis?: boolean;
}) {
  const toneClass =
    tone === "blue"
      ? "border-blue-500/40 bg-blue-500/10 text-blue-200"
      : tone === "cyan"
      ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
      : "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return (
    <div
      className={`rounded-md border px-3 py-2 ${toneClass} ${emphasis ? "shadow-lg" : ""}`}
    >
      {label}
    </div>
  );
}

function SubNode({ label, status }: { label: string; status: "allow" | "block" | "review" }) {
  const cls =
    status === "allow"
      ? "bg-emerald-500/15 text-emerald-200"
      : status === "block"
      ? "bg-red-500/15 text-red-200"
      : "bg-amber-500/15 text-amber-200";
  return (
    <div className="flex items-center justify-between rounded-md bg-slate-900/60 px-2 py-1">
      <span className="text-slate-300">{label}</span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${cls}`}>{status}</span>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex justify-center">
      <span aria-hidden className="text-slate-600">│</span>
    </div>
  );
}
