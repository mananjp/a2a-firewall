import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Clock, MapPin, ShieldCheck } from "lucide-react";
import { GithubIcon } from "@/components/ui/github-icon";
import { LegalNav } from "@/components/legal/legal-nav";
import { SITE, CONTACT_CHANNELS } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact A2A Firewall for support, billing, privacy and data requests, and responsible security disclosure, along with our registered address and response commitments.",
};

export const revalidate = 3600;

export default function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Masthead */}
      <div className="mx-auto w-full max-w-5xl px-5 pt-12 pb-6">
        <p className="eyebrow">Contact</p>
        <h1 className="mt-2 text-[30px] sm:text-[34px]">Talk to a human</h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          {SITE.brandName} is run by a small team. Every message is read by the person who
          operates the service, so please include enough detail to let us help on the first
          reply. Choose the channel that matches your question and we will respond within the
          window shown.
        </p>
        <LegalNav />
      </div>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-16">
        {/* Channels */}
        <section aria-labelledby="channels">
          <h2 id="channels" className="text-[19px]">
            Support channels
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {CONTACT_CHANNELS.map((channel) => (
              <article
                key={channel.key}
                className="flex flex-col rounded-2xl border border-hairline bg-surface p-5 shadow-card"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent/30 bg-accent-soft">
                    <Mail size={13} className="text-accent" />
                  </span>
                  <h3 className="text-[15px]">{channel.label}</h3>
                </div>
                <p className="mt-3 flex-1 text-[13px] leading-relaxed text-ink-muted">
                  {channel.description}
                </p>
                <a
                  href={`mailto:${channel.email}`}
                  className="mt-4 break-all font-mono text-[13px] text-accent underline underline-offset-2 hover:text-accent-strong"
                >
                  {channel.email}
                </a>
                <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-ink-faint">
                  <Clock size={11} />
                  Responds within {channel.sla}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Security disclosure note */}
        <section
          aria-labelledby="security"
          className="mt-8 rounded-2xl border border-allow-border bg-allow-soft p-5"
        >
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-allow" />
            <div>
              <h2 id="security" className="text-[15px]">
                Reporting a vulnerability
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                If you have found a security vulnerability in {SITE.brandName}, please email{" "}
                <a
                  href={`mailto:${SITE.emails.security}`}
                  className="break-all text-accent underline underline-offset-2"
                >
                  {SITE.emails.security}
                </a>{" "}
                rather than opening a public issue or disclosing it publicly. Please give us a
                reasonable opportunity to release a fix before any public disclosure. We will
                acknowledge your report within {SITE.responseTimes.security} and will not require
                you to sign a non-disclosure agreement. Our full disclosure policy is published
                in the project&apos;s{" "}
                <a
                  href={`${SITE.repositoryUrl}/blob/main/SECURITY.md`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline underline-offset-2"
                >
                  SECURITY.md
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        {/* Registered details */}
        <section aria-labelledby="details" className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-card">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-hairline bg-surface-sunken">
                <MapPin size={13} className="text-ink-muted" />
              </span>
              <h2 id="details" className="text-[15px]">
                Registered address
              </h2>
            </div>
            <address className="mt-4 not-italic text-[13px] leading-relaxed text-ink-muted">
              <span className="block font-semibold text-ink-primary">{SITE.legalName}</span>
              <span className="block">Sole proprietor, trading as &ldquo;{SITE.tradingAs}&rdquo;</span>
              {SITE.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
            <p className="mt-4 mono-id">
              Legal notices under the{" "}
              <Link href="/terms#notices" className="text-accent underline underline-offset-2">
                Terms of Service
              </Link>{" "}
              should be sent to this address.
            </p>
          </div>

          <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-card">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-hairline bg-surface-sunken">
                <GithubIcon size={13} className="text-ink-muted" />
              </span>
              <h2 className="text-[15px]">Elsewhere</h2>
            </div>
            <ul className="mt-4 space-y-3 text-[13px]">
              <li>
                <a
                  href={SITE.repositoryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline underline-offset-2 hover:text-accent-strong"
                >
                  Source code and issue tracker on GitHub
                </a>
                <p className="mt-0.5 text-[12px] text-ink-faint">
                  Bug reports are welcome. The core is Apache-2.0 licensed.
                </p>
              </li>
              <li>
                <span className="text-ink-muted">
                  Self-hosting? Read the{" "}
                  <a
                    href={`${SITE.repositoryUrl}#readme`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline underline-offset-2"
                  >
                    README
                  </a>{" "}
                  and{" "}
                  <a
                    href={`${SITE.repositoryUrl}/blob/main/docs/deployment-guide.md`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline underline-offset-2"
                  >
                    deployment guide
                  </a>
                  .
                </span>
              </li>
              <li>
                <span className="text-ink-muted">
                  For billing, see the{" "}
                  <Link href="/refund" className="text-accent underline underline-offset-2">
                    Cancellation &amp; Refund Policy
                  </Link>
                  . For data rights, see the{" "}
                  <Link href="/privacy" className="text-accent underline underline-offset-2">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </li>
            </ul>
          </div>
        </section>

        <p className="mt-8 text-[12.5px] leading-relaxed text-ink-faint">
          All four channels above reach the same mailbox, which is monitored by the operator of{" "}
          {SITE.tradingAs}. Data protection requests are handled under the{" "}
          <Link href="/privacy#grievance" className="underline underline-offset-2">
            Grievance Officer
          </Link>{" "}
          provisions of the Privacy Policy and answered within {SITE.responseTimes.privacy}.
        </p>
      </main>
    </div>
  );
}
