import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "A2A Firewall",
  description:
    "Inter-agent governance mesh. Intercept, inspect, validate, and trace autonomous AI agent communication.",
  icons: { icon: "/a2a-logo.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        {/* Animated floating background blob (amber warmth) */}
        <div className="animated-bg-blob" aria-hidden="true" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
