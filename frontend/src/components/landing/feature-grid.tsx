import { FEATURES } from "./data";

export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-20 scroll-mt-20">
      <div className="eyebrow mb-2">Enterprise Ready</div>
      <h2 className="text-[24px] font-bold tracking-tight text-ink-primary mb-8">
        Complete Security Stack for Agent Operations
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-hairline bg-surface p-6 transition-all duration-200 hover:border-hairline-strong hover:bg-surface-elevated hover:shadow-card-hover group"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-surface-sunken text-accent border border-hairline">
                {f.tag}
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-elevated text-ink-primary border border-hairline group-hover:border-accent/40 group-hover:text-accent transition-colors">
                <f.Icon size={17} />
              </div>
            </div>
            <div className="text-[16px] font-semibold tracking-tight text-ink-primary">
              {f.title}
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
