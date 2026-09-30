import Link from "next/link";
import { Mail } from "lucide-react";
import { GithubIcon } from "@/components/ui/github-icon";
import { SITE } from "@/lib/site-config";

/**
 * Site-wide footer. Rendered from the root layout so the compliance pages are
 * linked from every public route, not just the landing page.
 *
 * The legal links here are the primary discovery path for payment-processor
 * website verification — a policy page nobody can reach does not count as
 * published.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-surface-elevated/40">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <p className="text-[14px] font-extrabold tracking-tight text-ink-primary font-sans">
              {SITE.brandName}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
              {SITE.tagline}. Built with Ed25519, Macaroons &amp; Groq LPU.
            </p>
            <a
              href={SITE.repositoryUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11.5px] text-ink-muted hover:text-ink-primary transition-colors"
            >
              <GithubIcon size={13} />
              github.com/mananjp/a2a-firewall
            </a>
          </div>

          {/* Product */}
          <nav aria-label="Product">
            <p className="eyebrow">Product</p>
            <ul className="mt-3 space-y-2">
              {[
                { href: "/#features", label: "Capabilities" },
                { href: "/#architecture", label: "6-Gate Pipeline" },
                { href: "/#sandbox", label: "Live Sandbox" },
                { href: "/dashboard/demo", label: "Attack Scenarios" },
                { href: "/pricing", label: "Pricing" },
                { href: "/login", label: "Sign in" },
              ].map((link) => (
                <li key={link.href}>
                  <FooterLink href={link.href}>{link.label}</FooterLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* Legal */}
          <nav aria-label="Legal">
            <p className="eyebrow">Legal</p>
            <ul className="mt-3 space-y-2">
              {[
                { href: "/terms", label: "Terms of Service" },
                { href: "/privacy", label: "Privacy Policy" },
                { href: "/refund", label: "Cancellation & Refund" },
                { href: "/pricing", label: "Pricing" },
                { href: "/contact", label: "Contact" },
              ].map((link) => (
                <li key={link.href}>
                  <FooterLink href={link.href}>{link.label}</FooterLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div>
            <p className="eyebrow">Contact</p>
            <a
              href={`mailto:${SITE.emails.support}`}
              className="mt-3 inline-flex items-center gap-1.5 break-all font-mono text-[11.5px] text-ink-muted hover:text-ink-primary transition-colors"
            >
              <Mail size={13} className="shrink-0" />
              {SITE.emails.support}
            </a>
            <address className="mt-3 not-italic text-[11.5px] leading-relaxed text-ink-faint">
              {SITE.legalName}
              <br />
              Sole proprietor, trading as &ldquo;{SITE.tradingAs}&rdquo;
              <br />
              {SITE.addressLines[0]}
              <br />
              {SITE.addressLines[2]}
            </address>
            <p className="mt-2 font-mono text-[10.5px] text-ink-faint">
              Responding within {SITE.responseTimes.support}
            </p>
          </div>
        </div>

        <div className="mt-9 flex flex-col gap-2 border-t border-hairline pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] text-ink-faint">
            &copy; {SITE.effectiveDate.split(" ").pop()} {SITE.legalName}. Sole proprietor,
            trading as &ldquo;{SITE.tradingAs}&rdquo;.
          </p>
          <p className="font-mono text-[11px] text-ink-faint">
            Prices in INR, inclusive of applicable taxes &middot; Payments by Razorpay
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[12px] text-ink-muted hover:text-ink-primary transition-colors"
    >
      {children}
    </Link>
  );
}
