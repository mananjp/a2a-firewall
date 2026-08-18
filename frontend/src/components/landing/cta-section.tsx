import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <>
      <section className="border-t border-hairline bg-surface-elevated/40 py-16">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-allow/10 border border-allow/30 mx-auto mb-4 glow-allow p-2.5 shadow-md hover:scale-105 transition-transform">
            <Image
              src="/a2a-logo.png"
              alt="A2A Firewall Logo"
              width={48}
              height={48}
              className="object-contain"
            />
          </div>
          <h2 className="text-[28px] font-bold text-ink-primary">
            Deploy Zero-Trust Perimeter for Your Agents
          </h2>
          <p className="mt-3 text-[15px] text-ink-muted max-w-xl mx-auto">
            Ready to secure inter-agent communications, prevent prompt injection escalations, and maintain auditable cryptographic compliance?
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link href="/login">
              <Button variant="primary" size="lg" className="font-mono text-[13px] gap-2 shadow-lg shadow-accent/25">
                Launch SOC Dashboard
                <ArrowRight size={14} />
              </Button>
            </Link>
            <Link href="/dashboard/demo">
              <Button variant="secondary" size="lg" className="font-mono text-[13px]">
                Explore Attack Scenarios
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-hairline py-8 text-center text-[12px] font-mono text-ink-muted">
        A2A Firewall — Zero-Trust Inter-Agent Security & Governance Mesh • Built with Ed25519, Macaroons & Groq LPU
      </footer>
    </>
  );
}
