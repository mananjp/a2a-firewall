"use client";

import { LandingHeader } from "@/components/landing/landing-header";
import { HeroSection } from "@/components/landing/hero-section";
import { LiveInspectionSandbox } from "@/components/landing/live-inspection-sandbox";
import { DefenseArchitecture } from "@/components/landing/defense-architecture";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { CtaSection } from "@/components/landing/cta-section";
import { InteractiveBg } from "@/components/bg/interactive-bg";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-base text-ink-primary selection:bg-accent/30 selection:text-white">
      {/* Sticky Header */}
      <LandingHeader />

      {/* Hero & Interactive Inspection Sandbox */}
      <section className="relative mx-auto max-w-6xl px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 overflow-hidden">
        <InteractiveBg className="opacity-95" />
        <HeroSection />
        <LiveInspectionSandbox />
      </section>

      {/* Cryptographic Defense Architecture Tabs */}
      <DefenseArchitecture />

      {/* Enterprise Capabilities Grid */}
      <FeatureGrid />

      {/* Call to Action & Footer */}
      <CtaSection />
    </div>
  );
}
