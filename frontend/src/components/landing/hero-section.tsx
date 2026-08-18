import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { STATS } from "./data";

export function HeroSection() {
  return (
    <div className="max-w-3xl relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="eyebrow mb-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-elevated border border-hairline-strong shadow-sm"
      >
        <span className="h-2 w-2 rounded-full bg-allow" />
        <span className="text-ink-primary font-medium text-[11px]">
          Active Zero-Trust Inter-Agent Mesh
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="text-[38px] sm:text-[54px] font-extrabold tracking-tight text-ink-primary leading-[1.06]"
      >
        The Security Perimeter for{" "}
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-cyan-400 to-allow">
          Autonomous Agent Systems
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mt-6 max-w-2xl text-[16.5px] leading-relaxed text-ink-muted"
      >
        A2A Firewall intercepts every inter-agent request, executes a sequential six-layer cryptographic
        & semantic inspection pipeline in under 20ms, and emits deterministic{" "}
        <span className="text-allow font-semibold">Allow</span>,{" "}
        <span className="text-block font-semibold">Block</span>, or{" "}
        <span className="text-review font-semibold">Review</span> verdicts with cryptographic lineage.
      </motion.p>

      {/* Stats Badges */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 rounded-2xl bg-surface border border-hairline-strong shadow-card relative z-10"
      >
        {STATS.map((s) => (
          <div key={s.label} className="border-l-2 border-accent/40 pl-3">
            <div className="text-[26px] font-bold font-display tracking-tight text-ink-primary">
              {s.value}
            </div>
            <div className="text-[11.5px] text-ink-muted font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Call to Actions */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mt-8 flex flex-wrap items-center gap-3.5"
      >
        <Link href="/login">
          <Button
            variant="primary"
            size="lg"
            className="font-mono text-[13px] gap-2 shadow-lg shadow-accent/25 hover:shadow-accent/40"
          >
            Launch SOC Dashboard
            <ArrowRight size={15} />
          </Button>
        </Link>
        <Link href="/dashboard/demo">
          <Button variant="secondary" size="lg" className="font-mono text-[13px] gap-2">
            <Play size={13} className="text-accent fill-accent" />
            Live Attack Simulation
          </Button>
        </Link>
      </motion.div>
    </div>
  );
}
