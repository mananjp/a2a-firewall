"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * The dashboard has its own shell and sidebar, so the marketing footer is not
 * rendered there. Everything else — landing, /login, and the compliance pages —
 * gets it.
 */
export function SiteFooterGate() {
  const pathname = usePathname();
  if (pathname.startsWith("/dashboard")) return null;
  return <SiteFooter />;
}
