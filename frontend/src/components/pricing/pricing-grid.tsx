"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiKey } from "@/lib/api";
import {
  PLANS,
  formatINR,
  annualSavingPercent,
  type Plan,
} from "@/lib/site-config";

type Cycle = "monthly" | "annual";

export function PricingGrid() {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [showAnnual, setShowAnnual] = useState(true);

  const headlineSavings = PLANS.reduce<number | null>((best, plan) => {
    const pct = annualSavingPercent(plan);
    if (pct === null) return best;
    return best === null ? pct : Math.max(best, pct);
  }, null);

  return (
    <div>
      {/* Billing period toggle */}
      <div className="flex flex-col items-center gap-3">
        <div
          role="radiogroup"
          aria-label="Billing period"
          className="inline-flex items-center gap-1 rounded-xl border border-hairline bg-surface-sunken/60 p-1"
        >
          <CycleButton
            active={cycle === "monthly"}
            onClick={() => setCycle("monthly")}
            label="Monthly"
          />
          <CycleButton
            active={cycle === "annual"}
            onClick={() => setCycle("annual")}
            label="Annual"
          />
        </div>

        <div className="flex min-h-[24px] flex-col items-center gap-2">
          {cycle === "annual" && headlineSavings !== null && (
            <p className="rounded-full border border-allow-border bg-allow-soft px-3 py-1 font-mono text-[11px] font-medium text-allow">
              Save {headlineSavings}% vs. paying monthly
            </p>
          )}
          <p className="text-[13px] text-ink-muted">
            {cycle === "annual"
              ? "Billed once per year. Cancel any time — access continues to the end of the year."
              : "Billed every month. Cancel any time — access continues to the end of the month."}
          </p>
        </div>

        {showAnnual && (
          <button
            type="button"
            onClick={() => setShowAnnual(false)}
            className="sr-only focus:not-sr-only"
          >
            Hide plan details
          </button>
        )}
      </div>

      {/* Plan cards */}
      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} cycle={cycle} />
        ))}
      </div>
    </div>
  );
}

function CycleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={
        active
          ? "rounded-lg border border-accent bg-accent-soft px-4 py-1.5 font-mono text-[12px] font-semibold text-accent shadow-sm"
          : "rounded-lg border border-transparent px-4 py-1.5 font-mono text-[12px] text-ink-muted hover:text-ink-primary"
      }
    >
      {label}
    </button>
  );
}

function PlanCard({ plan, cycle }: { plan: Plan; cycle: Cycle }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => {
    setIsLoggedIn(Boolean(getApiKey()));
  }, []);

  const isCustom = plan.priceMonthly === null;
  const price = cycle === "annual" ? plan.priceAnnual : plan.priceMonthly;
  const isFree = plan.priceMonthly === 0;

  // Compute smart destination and label
  let targetHref = plan.cta.href;
  let targetLabel = plan.cta.label;

  if (isCustom) {
    targetHref = "/contact";
    targetLabel = "Contact sales";
  } else if (isFree) {
    targetHref = isLoggedIn ? "/dashboard" : "/login";
    targetLabel = isLoggedIn ? "Go to Dashboard" : "Start free";
  } else {
    // Pro or Team
    targetHref = isLoggedIn
      ? `/dashboard/billing?plan=${plan.id}&cycle=${cycle}`
      : `/login?next=${encodeURIComponent(`/dashboard/billing?plan=${plan.id}&cycle=${cycle}`)}`;
    targetLabel = isLoggedIn
      ? `Upgrade to ${plan.name}`
      : `Get ${plan.name} (${formatINR(price as number)})`;
  }

  return (
    <article
      className={
        plan.highlight
          ? "relative flex flex-col rounded-2xl border border-accent/40 bg-surface p-6 shadow-card-hover"
          : "relative flex flex-col rounded-2xl border border-hairline bg-surface p-6 shadow-card"
      }
    >
      {plan.highlight && (
        <span className="absolute -top-2.5 left-6 rounded-full border border-accent/40 bg-accent px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
          Popular
        </span>
      )}

      <h3 className="text-[17px]">{plan.name}</h3>
      <p className="mt-1.5 min-h-[40px] text-[12.5px] leading-relaxed text-ink-muted">
        {plan.blurb}
      </p>

      <div className="mt-5 border-b border-hairline pb-5">
        {isCustom ? (
          <>
            <p className="font-mono text-[26px] font-bold tracking-tight text-ink-primary">
              Custom
            </p>
            <p className="mt-1 font-mono text-[11.5px] text-ink-muted">
              Priced per deployment
            </p>
          </>
        ) : isFree ? (
          <>
            <p className="font-mono text-[26px] font-bold tracking-tight text-ink-primary">
              Free
            </p>
            <p className="mt-1 font-mono text-[11.5px] text-ink-muted">
              No card required &middot; forever
            </p>
          </>
        ) : (
          <>
            <p className="font-mono text-[26px] font-bold tracking-tight text-ink-primary">
              {formatINR(price as number)}
              <span className="ml-1 text-[12px] font-medium text-ink-muted">
                /{cycle === "annual" ? "year" : "month"}
              </span>
            </p>
            <p className="mt-1 font-mono text-[11.5px] text-ink-muted">
              {cycle === "annual"
                ? `Billed annually · ${formatINR(Math.round((price as number) / 12))}/mo equivalent`
                : plan.priceAnnual
                  ? `Billed monthly · ${formatINR(plan.priceAnnual)}/yr if billed annually`
                  : "Billed monthly"}
            </p>
          </>
        )}
      </div>

      <ul className="mt-5 flex-1 space-y-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-muted">
            <Check size={13} className="mt-0.5 shrink-0 text-allow" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Link href={targetHref} className="mt-6 block">
        <Button
          variant={plan.highlight ? "primary" : "secondary"}
          size="md"
          className="w-full font-mono text-[12px]"
        >
          {targetLabel}
          <ArrowRight size={13} />
        </Button>
      </Link>
    </article>
  );
}
