import type { Metadata } from "next";
import Link from "next/link";
import { LegalNav } from "@/components/legal/legal-nav";
import { PricingGrid } from "@/components/pricing/pricing-grid";
import { SITE, PLANS, COMPARISON } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "A2A Firewall subscription plans and pricing. Free, Pro, and Team tiers in Indian Rupees with monthly or annual billing, plus Enterprise. All prices include applicable taxes.",
};

const FAQ = [
  {
    q: "Are these prices inclusive of taxes?",
    a: `Yes. All prices are stated in Indian Rupees and include all applicable taxes and levies. ${SITE.tradingAs} is not currently GST-registered and does not charge GST. If we become GST-registered, GST will be added to future invoices and existing customers will be notified before the change takes effect.`,
  },
  {
    q: "Can I cancel at any time?",
    a: "Yes, at any time and at no cost. Your subscription stays fully active until the end of the billing period you have already paid for, and no further charges are taken. See the Cancellation & Refund Policy.",
  },
  {
    q: "What happens if I exceed my inspection quota?",
    a: "Further inspections are rejected and your plan is not charged extra. There is no usage-based overage. You can upgrade at any time and the new limits apply immediately.",
  },
  {
    q: "Is there a charge for the agent traffic I inspect?",
    a: `No. Billing is based on your plan, not on the volume of payload content. We do not charge per agent message, per token, or per inspected byte.`,
  },
  {
    q: "Does the free plan require a payment method?",
    a: "No. The Free plan requires no payment method and no card.",
  },
  {
    q: "Can I self-host instead of subscribing?",
    a: "Yes. The core of A2A Firewall is open-source under the Apache License 2.0 and can be self-hosted at no cost. A subscription covers the hosted service only; it is not a licence of the software. See Section 2.1 of the Terms of Service.",
  },
  {
    q: "Which payment methods do you accept?",
    a: `Payments are processed by Razorpay, which supports major Indian credit and debit cards, UPI, net banking, and selected wallets. ${SITE.tradingAs} never receives or stores your card number or CVV.`,
  },
  {
    q: "Do you offer discounts for startups, NGOs, or education?",
    a: "Yes, in some cases. Contact us with a short description of your use case and we will consider it.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Masthead */}
      <div className="mx-auto w-full max-w-6xl px-5 pt-12 pb-6">
        <p className="eyebrow">Pricing</p>
        <h1 className="mt-2 text-[30px] sm:text-[34px]">
          Plans that scale with your agent estate
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          Start free on the full inspection pipeline. Move to Pro or Team when you need the
          semantic LLM layer, DLP vault, alerting, and longer retention. Every plan includes
          every plan below it &mdash; no feature is held back to force an upgrade.
        </p>
        <LegalNav />
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-16">
        {/* Plan cards with the billing toggle */}
        <PricingGrid />

        {/* Comparison table */}
        <section aria-labelledby="compare" className="mt-14">
          <h2 id="compare" className="text-[19px]">
            Compare plans in detail
          </h2>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
            Limits shown are the enforced quotas for each tier. Exceeding a limit blocks the
            action rather than billing you for it.
          </p>
          <div className="mt-5 overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-hairline bg-surface-elevated">
                  <th className="px-4 py-3 font-semibold text-ink-primary">Feature</th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan.id}
                      className="px-4 py-3 text-center font-semibold text-ink-primary"
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, index) => (
                  <tr
                    key={row.label}
                    className={
                      index % 2 === 0 ? "border-b border-hairline" : "border-b border-hairline bg-surface-elevated/50"
                    }
                  >
                    <td className="px-4 py-2.5 text-ink-muted">{row.label}</td>
                    {PLANS.map((plan) => (
                      <td
                        key={plan.id}
                        className="px-4 py-2.5 text-center font-mono text-[12px] text-ink-primary"
                      >
                        {row.values[plan.id]}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-2.5 font-semibold text-ink-primary">Price</td>
                  {PLANS.map((plan) => (
                    <td
                      key={plan.id}
                      className="px-4 py-2.5 text-center font-mono text-[12px] font-semibold text-ink-primary"
                    >
                      {plan.priceMonthly === null
                        ? "Custom"
                        : plan.priceMonthly === 0
                          ? "Free"
                          : `${plan.priceMonthly.toLocaleString("en-IN")} / mo`}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 mono-id">
            Enterprise pricing is quoted per deployment and may include on-site support, custom
            retention, and a signed data processing agreement.
          </p>
        </section>

        {/* Enterprise CTA */}
        <section
          aria-labelledby="enterprise"
          className="mt-14 rounded-2xl border border-hairline bg-surface p-6 sm:p-8 material-panel"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="enterprise" className="text-[18px]">
                Need unlimited volume or a security review?
              </h2>
              <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
                Enterprise includes unlimited inspections, SSO/SAML, SCIM provisioning, custom
                compliance packs, a contractual data processing agreement, and onboarding
                support. Tell us about your deployment and we will come back within{" "}
                {SITE.responseTimes.support}.
              </p>
            </div>
            <Link
              href="/contact"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-elevated px-5 text-[13px] font-medium text-ink-primary hover:border-hairline-strong hover:bg-surface shadow-sm transition-colors"
            >
              Contact sales
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq" className="mt-14">
          <h2 id="faq" className="text-[19px]">
            Billing questions
          </h2>
          <div className="mt-5 space-y-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border border-hairline bg-surface px-4 py-3.5 open:bg-surface-elevated"
              >
                <summary className="cursor-pointer list-none text-[14px] font-semibold text-ink-primary marker:hidden">
                  <span className="flex items-start justify-between gap-4">
                    {item.q}
                    <span className="mt-0.5 shrink-0 text-ink-faint transition-transform group-open:rotate-45">
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-[13.5px] leading-relaxed text-ink-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Legal disclaimer */}
        <section className="mt-14 rounded-xl border border-hairline bg-surface-sunken/60 p-5">
          <h2 className="text-[14px]">Terms governing these prices</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            The prices shown form part of the{" "}
            <Link href="/terms" className="text-accent underline underline-offset-2">
              Terms of Service
            </Link>
            . Subscriptions renew automatically at the end of each billing period until
            cancelled, and may be cancelled at any time at no cost with access continuing to the
            end of the paid period. Refund eligibility and processing times are set out in the{" "}
            <Link href="/refund" className="text-accent underline underline-offset-2">
              Cancellation &amp; Refund Policy
            </Link>
            . Plan limits are enforced as described in the{" "}
            <Link href="/terms#service" className="text-accent underline underline-offset-2">
              Terms of Service
            </Link>
            , and we may change plan pricing on 30 days&apos; notice to existing subscribers.
            All prices are in Indian Rupees and are inclusive of every tax and levy we are
            required to collect. {SITE.tradingAs} is not currently GST-registered and does not
            charge GST today; if that changes, GST will be added to future invoices and existing
            customers will be notified before it takes effect.
          </p>
        </section>
      </main>
    </div>
  );
}
