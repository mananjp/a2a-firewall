interface Layer {
  id: string;
  label: string;
  description: string;
  tone: string;
  text: string;
}

const LAYERS: Layer[] = [
  {
    id: "L-1",
    label: "Rate limiter",
    description: "Sliding-window per workspace and per agent.",
    tone: "bg-slate-800/60 border-slate-600",
    text: "text-slate-200",
  },
  {
    id: "L0",
    label: "Preflight & idempotency",
    description: "Size, depth, cycles, duplicate task_id replay.",
    tone: "bg-blue-900/30 border-blue-700",
    text: "text-blue-200",
  },
  {
    id: "L1",
    label: "JSON schema",
    description: "Validate the message against the registered schema.",
    tone: "bg-cyan-900/30 border-cyan-700",
    text: "text-cyan-200",
  },
  {
    id: "L2",
    label: "Permissions",
    description: "Is sender → receiver allowed for this task_type?",
    tone: "bg-violet-900/30 border-violet-700",
    text: "text-violet-200",
  },
  {
    id: "L3",
    label: "Rule engine",
    description: "Regex and condition policies per workspace.",
    tone: "bg-amber-900/30 border-amber-700",
    text: "text-amber-200",
  },
  {
    id: "L4",
    label: "Groq semantic guard",
    description: "LLM reasoning for prompt injection & hallucination.",
    tone: "bg-rose-900/30 border-rose-700",
    text: "text-rose-200",
  },
  {
    id: "L5",
    label: "Decision synthesis",
    description: "Allow · Block · Review based on aggregate risk.",
    tone: "bg-emerald-900/30 border-emerald-700",
    text: "text-emerald-200",
  },
];

export function Pipeline() {
  return (
    <section id="pipeline" className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <div className="mb-12 max-w-2xl">
        <span className="chip">Inspection pipeline</span>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Seven layers, one defensible decision.
        </h2>
        <p className="mt-3 text-slate-400">
          Each message from any agent is intercepted and walked through every layer in order.
          The result is a structured decision with a full evidence trail.
        </p>
      </div>

      <ol className="relative space-y-3" data-testid="pipeline-list">
        {LAYERS.map((layer, i) => (
          <li
            key={layer.id}
            className={`flex items-start gap-4 rounded-lg border ${layer.tone} px-4 py-3`}
          >
            <span
              className={`mt-0.5 inline-flex h-9 w-12 shrink-0 items-center justify-center rounded-md font-mono text-xs font-semibold ${layer.text} bg-black/30`}
            >
              {layer.id}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-semibold ${layer.text}`}>{layer.label}</div>
              <div className="text-xs text-slate-400">{layer.description}</div>
            </div>
            {i < LAYERS.length - 1 && (
              <span aria-hidden className="self-center text-slate-600">↓</span>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <OutCard tone="emerald" label="Allow" body="Passes every layer below threshold." />
        <OutCard tone="amber" label="Review" body="Aggregate risk in the gray zone — held for a human." />
        <OutCard tone="red" label="Block" body="A hard violation or risk above the block threshold." />
      </div>
    </section>
  );
}

function OutCard({ tone, label, body }: { tone: "emerald" | "amber" | "red"; label: string; body: string }) {
  const map = {
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    red: "border-red-500/40 bg-red-500/10 text-red-200",
  } as const;
  return (
    <div className={`rounded-lg border p-4 ${map[tone]}`}>
      <div className="text-sm font-semibold uppercase tracking-wider">{label}</div>
      <p className="mt-1 text-xs text-slate-300">{body}</p>
    </div>
  );
}
