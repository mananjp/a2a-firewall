interface Feature {
  title: string;
  body: string;
  icon: React.ReactNode;
  tone: string;
}

const FEATURES: Feature[] = [
  {
    title: "Multi-layer inspection",
    body:
      "Six deterministic layers — rate-limit, preflight, schema, permissions, rule engine, and an LLM semantic guard — synthesize into one decision per message.",
    tone: "from-blue-500/20 to-blue-500/0",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
        <circle cx="19" cy="17" r="2" />
      </svg>
    ),
  },
  {
    title: "Distributed lineage",
    body:
      "Every task carries a trace_id, span_id, and parent pointer — build parent-child trees of an entire agent conversation in a single click.",
    tone: "from-cyan-500/20 to-cyan-500/0",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="12" cy="18" r="2.5" />
        <path d="M6 8.5v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-2M12 13.5V15.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Manual review queue",
    body:
      "Messages that fall in the gray zone are held — humans approve or reject from a queue with audit-grade reviewer notes and explicit expiry.",
    tone: "from-amber-500/20 to-amber-500/0",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path d="M4 5h16v12H7l-3 3z" strokeLinejoin="round" />
        <path d="M9 10h6M9 13h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Multi-tenant isolation",
    body:
      "Workspaces own their agents, schemas, policies, and lineage trees. Cross-tenant access is structurally impossible — every request is scoped by API key.",
    tone: "from-emerald-500/20 to-emerald-500/0",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <rect x="4" y="9" width="16" height="11" rx="2" />
        <path d="M8 9V6a4 4 0 1 1 8 0v3" />
      </svg>
    ),
  },
  {
    title: "Programmable policy engine",
    body:
      "Author regex and condition-based rules per workspace. Priorities resolve deterministically — block, flag, or review with the same primitives used in production SIEMs.",
    tone: "from-violet-500/20 to-violet-500/0",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path d="M5 4h14l-2 5v8a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3V9z" strokeLinejoin="round" />
        <path d="M9 13h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "OpenTelemetry native",
    body:
      "All decisions emit structured span events. Pipe traces straight into Jaeger, Tempo, or Honeycomb with zero instrumentation changes to your agents.",
    tone: "from-rose-500/20 to-rose-500/0",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path d="M3 12h4l3-7 4 14 3-7h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function Features() {
  return (
    <section id="features" className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <div className="mb-12 max-w-2xl">
        <span className="chip">Capabilities</span>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Built for production agent fleets.
        </h2>
        <p className="mt-3 text-slate-400">
          Every primitive you need to govern autonomous AI traffic — from rate limiting and
          schema validation to full OpenTelemetry lineage — composes into a single API call.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <article
            key={f.title}
            className="group relative overflow-hidden rounded-xl border border-white/10 bg-slate-900/50 p-6 transition-colors hover:bg-slate-900/70"
          >
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${f.tone} opacity-0 transition-opacity group-hover:opacity-100`}
            />
            <div className="relative">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-blue-300">
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
