"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  SlidersHorizontal,
  Layers,
  ShieldCheck,
  Flame,
  ArrowRight,
  Menu,
  X,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function GithubIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

export function LandingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-3 z-50 px-4 sm:px-6 max-w-6xl mx-auto w-full transition-all">
      <div className="rounded-2xl border border-hairline/90 bg-surface/90 backdrop-blur-xl shadow-xl shadow-black/[0.04] p-2.5 sm:px-4 flex items-center justify-between transition-all">
        {/* Brand & Logo */}
        <Link href="/" className="flex items-center gap-3 group shrink-0">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-allow/10 border border-allow/30 p-1 glow-allow transition-all group-hover:scale-105 group-hover:border-allow/60 shadow-sm">
            <Image
              src="/a2a-logo.png"
              alt="A2A Firewall Logo"
              width={34}
              height={34}
              className="object-contain"
              priority
            />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-extrabold tracking-tight text-ink-primary font-sans leading-none">
                A2A Firewall
              </span>
              <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 leading-none">
                v2.0
              </span>
            </div>
            <span className="text-[10px] font-mono text-ink-muted flex items-center gap-1 mt-0.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-allow" />
              Zero-Trust Agent Mesh
            </span>
          </div>
        </Link>

        {/* Center Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1 bg-surface-sunken/60 p-1 rounded-xl border border-hairline">
          <Link
            href="#sandbox"
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-ink-muted hover:text-ink-primary hover:bg-surface-elevated transition-all flex items-center gap-1.5 font-sans"
          >
            <SlidersHorizontal size={13} className="text-accent" />
            Live Sandbox
          </Link>
          <Link
            href="#architecture"
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-ink-muted hover:text-ink-primary hover:bg-surface-elevated transition-all flex items-center gap-1.5 font-sans"
          >
            <Layers size={13} className="text-indigo-400" />
            6-Gate Pipeline
          </Link>
          <Link
            href="#features"
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-ink-muted hover:text-ink-primary hover:bg-surface-elevated transition-all flex items-center gap-1.5 font-sans"
          >
            <ShieldCheck size={13} className="text-allow" />
            Capabilities
          </Link>
          <Link
            href="/dashboard/demo"
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-ink-muted hover:text-ink-primary hover:bg-surface-elevated transition-all flex items-center gap-1.5 font-sans"
          >
            <Flame size={13} className="text-rose-500" />
            Attack Scenarios
          </Link>
        </nav>

        {/* Right Actions & CTA */}
        <div className="flex items-center gap-2.5">
          <a
            href="https://github.com/mananjp/a2a-firewall"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex h-8 items-center gap-1.5 px-3 rounded-lg border border-hairline bg-surface hover:bg-surface-elevated text-ink-muted hover:text-ink-primary text-[11.5px] font-mono transition-colors shadow-sm"
          >
            <GithubIcon size={13} />
            <span>GitHub</span>
          </a>

          <Link href="/login">
            <Button
              variant="primary"
              size="sm"
              className="font-mono text-[12px] gap-2 shadow-md shadow-accent/25 hover:shadow-accent/45 transition-all font-semibold"
            >
              Access SOC
              <ArrowRight size={13} />
            </Button>
          </Link>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg border border-hairline bg-surface text-ink-muted hover:text-ink-primary transition-colors"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden mt-2 p-3 rounded-2xl border border-hairline bg-surface/95 backdrop-blur-xl shadow-2xl space-y-1.5 font-mono text-[12.5px]">
          <Link
            href="#sandbox"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-ink-primary hover:bg-surface-elevated transition-colors"
          >
            <SlidersHorizontal size={14} className="text-accent" />
            Live Inspection Sandbox
          </Link>
          <Link
            href="#architecture"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-ink-primary hover:bg-surface-elevated transition-colors"
          >
            <Layers size={14} className="text-indigo-400" />
            6-Gate Cryptographic Defense
          </Link>
          <Link
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-ink-primary hover:bg-surface-elevated transition-colors"
          >
            <ShieldCheck size={14} className="text-allow" />
            Enterprise Capabilities
          </Link>
          <Link
            href="/dashboard/demo"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-ink-primary hover:bg-surface-elevated transition-colors"
          >
            <Flame size={14} className="text-rose-500" />
            Attack Simulation Demos
          </Link>
          <div className="pt-2 border-t border-hairline flex items-center justify-between px-2">
            <a
              href="https://github.com/mananjp/a2a-firewall"
              target="_blank"
              rel="noreferrer"
              className="text-[11.5px] text-ink-muted flex items-center gap-1.5"
            >
              <GithubIcon size={13} /> GitHub Source
            </a>
            <span className="text-[10px] text-allow font-bold flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-allow" />
              All 6 Gates Operational
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
