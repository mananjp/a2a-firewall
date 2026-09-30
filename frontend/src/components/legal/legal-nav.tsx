"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEGAL_PAGES } from "@/lib/site-config";

/**
 * Cross-link bar between the compliance pages. Razorpay reviewers follow these
 * to confirm the policies actually reference each other, so every legal page
 * renders this.
 */
export function LegalNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Legal and commercial pages"
      className="mt-7 flex flex-wrap gap-1.5"
    >
      {LEGAL_PAGES.map((page) => {
        const active = pathname === page.href;
        return (
          <Link
            key={page.href}
            href={page.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-lg border border-accent bg-accent-soft px-2.5 py-1.5 font-mono text-[11.5px] font-medium text-accent"
                : "rounded-lg border border-hairline bg-surface-elevated px-2.5 py-1.5 font-mono text-[11.5px] text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink-primary"
            }
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
