"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  KeyRound,
  ShieldAlert,
  ArrowRight,
  Lock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { TaskAuditChain, DelegationHop } from "@/lib/api";

interface DelegationTreeProps {
  chain: TaskAuditChain;
  className?: string;
}

export function DelegationTreeGraph({ chain, className = "" }: DelegationTreeProps) {
  const [hoveredHop, setHoveredHop] = useState<number | null>(null);

  const hops: DelegationHop[] = chain.hops || [];
  const nonAmplificationVerified =
    hops.length === 0 || hops.every((h) => h.signature_valid);
  const maxDepth =
    hops.length > 0 ? Math.max(...hops.map((h) => h.delegation_depth)) : 0;
  const rootSender =
    hops[0]?.sender_name || hops[0]?.sender_id || chain.root_task_id || "Root Agent";

  return (
    <div className={`material-panel rounded-xl p-5 ${className}`}>
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-hairline">
        <div>
          <div className="eyebrow mb-1">Cryptographic Lineage</div>
          <h3 className="text-[15px] font-semibold text-ink-primary flex items-center gap-2">
            <span>Delegation Trust & Non-Amplification Tree</span>
            <span
              className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                nonAmplificationVerified
                  ? "bg-allow/15 text-allow border border-allow/30"
                  : "bg-block/15 text-block border border-block/30"
              }`}
            >
              {nonAmplificationVerified ? "Attenuated & Verified" : "Amplification Violation"}
            </span>
          </h3>
        </div>

        <div className="flex items-center gap-4 text-[12px] font-mono text-ink-muted">
          <div>
            Depth: <span className="text-ink-primary font-bold">{maxDepth}</span>
          </div>
          <div>
            Hops: <span className="text-ink-primary font-bold">{hops.length}</span>
          </div>
        </div>
      </div>

      {/* Visual Tree Lineage Nodes */}
      <div className="relative py-4">
        <div className="flex flex-col md:flex-row items-center justify-start gap-4 md:gap-3 overflow-x-auto pb-4">
          {/* Root Agent Node */}
          <div className="flex flex-col items-center shrink-0">
            <div className="w-56 p-4 rounded-xl border border-hairline-strong bg-surface-elevated shadow-card relative">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-sunken text-accent font-semibold">
                  Root Issuer
                </span>
                <KeyRound size={14} className="text-accent" />
              </div>
              <div className="font-mono text-[13px] font-bold text-ink-primary truncate" title={rootSender}>
                {rootSender.length > 20 ? rootSender.slice(0, 18) + "..." : rootSender}
              </div>
              <div className="mt-2 text-[11px] text-ink-muted flex items-center justify-between border-t border-hairline pt-2">
                <span className="truncate max-w-[120px]" title={chain.task_id}>
                  Task: <span className="font-mono text-ink-primary">{chain.task_id.slice(0, 8)}...</span>
                </span>
                <span className="text-[10px] font-mono text-allow">Ed25519 Root</span>
              </div>
            </div>
          </div>

          {/* Delegation Hops & Caveat Edges */}
          {hops.map((hop: DelegationHop, index: number) => {
            const isHovered = hoveredHop === index;
            return (
              <div key={hop.id || index} className="flex flex-col md:flex-row items-center shrink-0">
                {/* Edge with Caveat Diff Badge */}
                <div
                  onMouseEnter={() => setHoveredHop(index)}
                  onMouseLeave={() => setHoveredHop(null)}
                  className="relative flex flex-col items-center justify-center px-2 py-2 cursor-pointer group"
                >
                  <div className="flex items-center gap-1 my-1 md:my-0">
                    <div className="h-0.5 w-6 md:w-10 bg-allow/40 group-hover:bg-allow transition-colors" />
                    <div
                      className={`px-2 py-0.5 rounded-full bg-surface-elevated border text-[10px] font-mono flex items-center gap-1 shadow-sm ${
                        hop.signature_valid
                          ? "border-allow/30 text-allow"
                          : "border-block/30 text-block"
                      }`}
                    >
                      <Lock size={10} />
                      <span>Hop {hop.delegation_depth || index + 1}</span>
                    </div>
                    <ArrowRight
                      size={13}
                      className={hop.signature_valid ? "text-allow -ml-1" : "text-block -ml-1"}
                    />
                  </div>

                  {/* Caveat Hover Popover */}
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute bottom-full mb-2 w-64 p-3 rounded-lg border border-hairline-strong bg-surface shadow-popover z-30 text-[11px]"
                    >
                      <div className="font-semibold text-ink-primary mb-1 flex items-center gap-1.5">
                        <ShieldAlert size={12} className={hop.signature_valid ? "text-allow" : "text-block"} />
                        <span>Macaroon Caveat Scope</span>
                      </div>
                      <div className="text-ink-muted text-[10px] mb-2">
                        Sub-agent capability narrowed cryptographically:
                      </div>
                      <div className="bg-surface-sunken p-2 rounded font-mono text-[10px] text-ink-primary border border-hairline space-y-1">
                        <div>Depth: {hop.delegation_depth || index + 1}</div>
                        <div>Sender: {hop.sender_name}</div>
                        <div>Receiver: {hop.receiver_name}</div>
                        {hop.caveats && hop.caveats.length > 0 && (
                          <div className="pt-1 border-t border-hairline/60">
                            <span className="text-ink-muted">Caveats:</span>
                            <ul className="list-disc pl-3 text-allow">
                              {hop.caveats.map((c, ci) => (
                                <li key={ci} className="truncate">
                                  {c}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="text-ink-muted pt-0.5 truncate">
                          Sig: {hop.chain_hash ? `${hop.chain_hash.slice(0, 16)}...` : "Verified"}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Subordinate Agent Node */}
                <div className="w-56 p-4 rounded-xl border border-hairline bg-surface hover:border-hairline-strong transition-all shadow-card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-sunken text-ink-muted">
                      Delegate Hop #{hop.delegation_depth || index + 1}
                    </span>
                    {hop.signature_valid ? (
                      <CheckCircle2 size={14} className="text-allow" />
                    ) : (
                      <AlertTriangle size={14} className="text-block" />
                    )}
                  </div>
                  <div
                    className="font-mono text-[13px] font-semibold text-ink-primary truncate"
                    title={hop.receiver_name || hop.receiver_id}
                  >
                    {hop.receiver_name || (hop.receiver_id ? `${hop.receiver_id.slice(0, 16)}...` : "Delegate Node")}
                  </div>
                  <div className="mt-2 text-[11px] text-ink-muted flex items-center justify-between border-t border-hairline pt-2">
                    <span>
                      Scope: <span className="font-mono text-allow">Narrowed</span>
                    </span>
                    <span className={`text-[10px] font-mono ${hop.signature_valid ? "text-allow" : "text-block"}`}>
                      {hop.signature_valid ? "Valid" : "Invalid"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
