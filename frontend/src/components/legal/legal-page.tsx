import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { SITE } from "@/lib/site-config";
import { LegalNav } from "@/components/legal/legal-nav";

/**
 * Shared typography for legal prose. Applied to semantic elements by the
 * individual pages so headings stay in the document outline (which matters for
 * both accessibility and for reviewers skimming the page).
 */
export const prose = {
  h2: "text-[19px] font-bold text-ink-primary mt-10 mb-3 scroll-mt-24",
  h3: "text-[15px] font-bold text-ink-primary mt-6 mb-2 scroll-mt-24",
  p: "text-[14px] leading-relaxed text-ink-muted mb-4",
  ul: "list-disc pl-5 mb-4 space-y-1.5",
  ol: "list-decimal pl-5 mb-4 space-y-1.5",
  li: "text-[14px] leading-relaxed text-ink-muted",
  a: "text-accent underline underline-offset-2 hover:text-accent-strong break-words",
  strong: "font-semibold text-ink-primary",
  note: "text-[13px] leading-relaxed text-ink-faint mb-4",
} as const;

interface LegalPageProps {
  title: string;
  /** Rendered under the title and used for the page description meta tag. */
  description: string;
  /** Optional short label above the H1, e.g. "Legal". */
  eyebrow?: string;
  children: React.ReactNode;
}

export function LegalPage({ title, description, eyebrow = "Legal", children }: LegalPageProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Slim top bar — brand + way back to the product */}
      <header className="sticky top-0 z-40 material-soft border-b border-hairline">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/a2a-logo.png"
              alt=""
              width={22}
              height={22}
              className="object-contain"
            />
            <span className="text-[14px] font-extrabold tracking-tight text-ink-primary font-sans">
              {SITE.brandName}
            </span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 font-mono text-[12px] text-ink-muted hover:text-ink-primary transition-colors"
          >
            <ArrowLeft size={13} />
            Back to site
          </Link>
        </div>
      </header>

      {/* Masthead */}
      <div className="mx-auto w-full max-w-5xl px-5 pt-12 pb-6">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 text-[30px] sm:text-[34px]">{title}</h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-muted">{description}</p>
        <p className="mt-4 mono-id">
          Effective {SITE.effectiveDate} &middot; {SITE.entityLine}
        </p>
        <LegalNav />
      </div>

      {/* Body */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-16">
        <article className="max-w-3xl">{children}</article>
      </main>
    </div>
  );
}

/** A numbered/clause heading with a stable anchor id for deep linking. */
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={prose.h2}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A bordered callout used for the "not registered / how to cancel" style notices. */
export function LegalCallout({
  title,
  tone = "info",
  children,
}: {
  title: string;
  tone?: "info" | "warn";
  children: React.ReactNode;
}) {
  const toneStyles =
    tone === "warn"
      ? "border-review-border bg-review-soft"
      : "border-info-border bg-info-soft";
  return (
    <div className={`mb-5 rounded-xl border ${toneStyles} p-4`}>
      <p className="text-[13px] font-bold text-ink-primary mb-1.5">{title}</p>
      <div className="text-[13px] leading-relaxed text-ink-muted">{children}</div>
    </div>
  );
}
