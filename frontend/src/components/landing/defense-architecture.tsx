import { useState } from "react";
import { KeyRound, GitFork, Activity, CheckCircle2, Check, AlertTriangle } from "lucide-react";

export function DefenseArchitecture() {
  const [activeTab, setActiveTab] = useState<"crypto" | "delegation" | "semantic">("crypto");

  return (
    <section id="architecture" className="border-t border-hairline bg-surface/50 py-20 scroll-mt-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div>
            <div className="eyebrow mb-2">Cryptographic Defense Architecture</div>
            <h2 className="text-[26px] font-bold tracking-tight text-ink-primary">
              How A2A Firewall Guarantees Zero-Trust Safety
            </h2>
          </div>

          {/* Sub-tabs */}
          <div className="flex p-1 rounded-xl bg-surface-sunken border border-hairline">
            <button
              onClick={() => setActiveTab("crypto")}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-mono font-medium transition-all ${
                activeTab === "crypto"
                  ? "bg-surface-elevated text-ink-primary border border-hairline-strong shadow-sm font-semibold text-accent"
                  : "text-ink-muted hover:text-ink-primary"
              }`}
            >
              1. Ed25519 Keys
            </button>
            <button
              onClick={() => setActiveTab("delegation")}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-mono font-medium transition-all ${
                activeTab === "delegation"
                  ? "bg-surface-elevated text-ink-primary border border-hairline-strong shadow-sm font-semibold text-accent"
                  : "text-ink-muted hover:text-ink-primary"
              }`}
            >
              2. Macaroon Attenuation
            </button>
            <button
              onClick={() => setActiveTab("semantic")}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-mono font-medium transition-all ${
                activeTab === "semantic"
                  ? "bg-surface-elevated text-ink-primary border border-hairline-strong shadow-sm font-semibold text-accent"
                  : "text-ink-muted hover:text-ink-primary"
              }`}
            >
              3. Groq Semantic Guard
            </button>
          </div>
        </div>

        {/* Tab Content Box */}
        <div className="rounded-2xl border border-hairline-strong bg-surface-elevated p-6 md:p-8 shadow-card">
          {activeTab === "crypto" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-accent/15 text-accent text-[11px] font-mono font-semibold border border-accent/30">
                  <KeyRound size={13} /> Layer 2: Preflight Cryptographic Lineage
                </div>
                <h3 className="text-[20px] font-bold text-ink-primary">
                  Every message carries an Ed25519 signature & replay nonce
                </h3>
                <p className="text-[14px] leading-relaxed text-ink-muted">
                  Agents cannot spoof identities. The firewall validates the public key against the
                  registered Agent Identity Ledger, verifies monotonic nonces, and checks timestamp freshness.
                </p>
                <ul className="space-y-2 text-[13px] text-ink-primary font-mono">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-allow shrink-0" />
                    <span>Zero agent impersonation across trust boundaries</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-allow shrink-0" />
                    <span>Strict replay attack mitigation with 300s nonce cache</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-allow shrink-0" />
                    <span>Signed headers compatible with OpenTelemetry tracing</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-xl bg-surface-sunken p-4 border border-hairline font-mono text-[12px] space-y-2 text-ink-muted">
                <div className="text-accent font-semibold text-[11px] pb-1 border-b border-hairline">
                  // A2A Wire Protocol Header Signature
                </div>
                <div><span className="text-ink-faint">X-Agent-ID:</span> &quot;planner-agent-01&quot;</div>
                <div><span className="text-ink-faint">X-Signature:</span> &quot;ed25519:7f8a9e2b1c4d...&quot;</div>
                <div><span className="text-ink-faint">X-Nonce:</span> &quot;0x9f18a24c00ef12ab&quot;</div>
                <div><span className="text-ink-faint">X-Timestamp:</span> &quot;2026-08-18T12:57:00.000Z&quot;</div>
                <div className="pt-2 border-t border-hairline text-allow flex items-center gap-1.5 font-bold">
                  <Check size={13} /> Cryptographically Verified by Sentinel Gateway
                </div>
              </div>
            </div>
          )}

          {activeTab === "delegation" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-accent/15 text-accent text-[11px] font-mono font-semibold border border-accent/30">
                  <GitFork size={13} /> Layer 4 & 5: Macaroon Attenuation
                </div>
                <h3 className="text-[20px] font-bold text-ink-primary">
                  Non-amplification guarantee across multi-hop delegation
                </h3>
                <p className="text-[14px] leading-relaxed text-ink-muted">
                  When Agent A delegates to Agent B, B can only execute tasks within the subset of A&apos;s permissions.
                  Each delegation hop appends an HMAC caveat that cannot be stripped without invalidating the token.
                </p>
                <ul className="space-y-2 text-[13px] text-ink-primary font-mono">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-allow shrink-0" />
                    <span>Mathematically proven privilege non-amplification</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-allow shrink-0" />
                    <span>Attenuable depth limits and strict TTL caveats</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-allow shrink-0" />
                    <span>Cryptographic lineage reconstructible for SOC compliance</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-xl bg-surface-sunken p-4 border border-hairline font-mono text-[12px] space-y-2 text-ink-muted">
                <div className="text-accent font-semibold text-[11px] pb-1 border-b border-hairline">
                  // Macaroon Caveat Chain Verification
                </div>
                <div><span className="text-ink-faint">Root Issuer:</span> admin (full_access)</div>
                <div><span className="text-ink-faint">Hop 1 [Planner]:</span> caveat(&quot;scope:finance_read&quot;)</div>
                <div><span className="text-ink-faint">Hop 2 [Analyst]:</span> caveat(&quot;ttl:300s&quot;, &quot;read_only&quot;)</div>
                <div><span className="text-ink-faint">Attempted:</span> write_db() <span className="text-block font-bold">REJECTED</span></div>
                <div className="pt-2 border-t border-hairline text-allow flex items-center gap-1.5 font-bold">
                  <Check size={13} /> Attenuation Verified • Non-Amplification Holds
                </div>
              </div>
            </div>
          )}

          {activeTab === "semantic" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-accent/15 text-accent text-[11px] font-mono font-semibold border border-accent/30">
                  <Activity size={13} /> Layer 6: Groq Semantic Guard
                </div>
                <h3 className="text-[20px] font-bold text-ink-primary">
                  Real-time intent drift scoring & injection detection
                </h3>
                <p className="text-[14px] leading-relaxed text-ink-muted">
                  Running GPT-OSS 120B on Groq LPUs in under 20ms. Evaluates whether a subordinate agent&apos;s
                  message deviates from the declared root goal or attempts prompt injection/jailbreaking.
                </p>
                <ul className="space-y-2 text-[13px] text-ink-primary font-mono">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-allow shrink-0" />
                    <span>Catches indirect prompt injection in agent context</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-allow shrink-0" />
                    <span>Quantitative intent drift scoring from 0.00 to 1.00</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-allow shrink-0" />
                    <span>Human-in-the-loop review queue for ambiguous prompts</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-xl bg-surface-sunken p-4 border border-hairline font-mono text-[12px] space-y-2 text-ink-muted">
                <div className="text-accent font-semibold text-[11px] pb-1 border-b border-hairline">
                  // Groq LPU Inference Evaluation
                </div>
                <div><span className="text-ink-faint">Model:</span> &quot;openai/gpt-oss-120b&quot;</div>
                <div><span className="text-ink-faint">Inference Time:</span> 18.5ms</div>
                <div><span className="text-ink-faint">Intent Drift Score:</span> 0.94 <span className="text-block font-bold">[CRITICAL]</span></div>
                <div><span className="text-ink-faint">Injection Flag:</span> true</div>
                <div className="pt-2 border-t border-hairline text-block flex items-center gap-1.5 font-bold">
                  <AlertTriangle size={13} /> Threat Quarantined • Human Review Enqueued
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
