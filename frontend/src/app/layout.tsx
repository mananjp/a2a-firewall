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
      <body className="min-h-screen bg-background text-foreground">
        {/* Animated floating background blob (amber warmth) */}
        <div className="animated-bg-blob" aria-hidden="true" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
