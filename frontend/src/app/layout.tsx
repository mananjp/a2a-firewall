import type { Metadata } from "next";
import { SocProvider } from "@/components/soc/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "A2A Firewall — Zero-Trust Agent Mesh",
  description:
    "Six-gate cryptographic and semantic inspection for every inter-agent request.",
  icons: { icon: "/favicon.svg" },
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
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        <SocProvider>{children}</SocProvider>
      </body>
    </html>
  );
}
