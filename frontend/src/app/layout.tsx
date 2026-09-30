import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { SiteFooterGate } from "@/components/layout/site-footer-client";
import { SITE } from "@/lib/site-config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.siteUrl),
  title: {
    default: "A2A Firewall",
    template: "%s — A2A Firewall",
  },
  description:
    "Inter-agent governance mesh. Intercept, inspect, validate, and trace autonomous AI agent communication.",
  icons: { icon: "/a2a-logo.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground flex flex-col">
        {/* Animated floating background blob (amber warmth) */}
        <div className="animated-bg-blob" aria-hidden="true" />
        <Providers>
          <div className="flex-1 flex flex-col">{children}</div>
          <SiteFooterGate />
        </Providers>
      </body>
    </html>
  );
}
