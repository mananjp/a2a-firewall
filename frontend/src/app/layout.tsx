import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { SocProvider } from "@/components/soc/store";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

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
    <html lang="en" className={`${archivo.variable} ${jetbrainsMono.variable}`}>
      <body>
        <SocProvider>{children}</SocProvider>
      </body>
    </html>
  );
}

