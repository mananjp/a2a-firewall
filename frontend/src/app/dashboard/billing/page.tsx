"use client";

import { useState, useCallback, useEffect } from "react";
import { usePolling } from "@/hooks/use-polling";
import { billing } from "@/lib/api";
import type { BillingSubscriptionResponse, BillingConfig } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  CreditCard,
  Check,
  CheckCircle2,
  Sparkles,
  Zap,
  ShieldCheck,
  Shield,
  Clock,
  Layers,
  Bot,
  ExternalLink,
  Lock,
  ArrowRight,
  Loader2,
  Sliders,
} from "lucide-react";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);

    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function BillingPage() {
  const { toast } = useToast();
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);

  // Fetch subscription status & config
  const {
    data: subData,
    loading: subLoading,
    refresh,
  } = usePolling<BillingSubscriptionResponse>(
    useCallback((_signal) => billing.subscription(), []),
    10000
  );

  const { data: config } = usePolling<BillingConfig>(
    useCallback((_signal) => billing.config(), []),
    60000
  );

  useEffect(() => {
    loadRazorpayScript();
  }, []);

  const currentTier = (subData?.tier || "free").toLowerCase();

  async function handleUpgrade(tier: "pro" | "team") {
    setUpgrading(tier);
    setHostedUrl(null);
    try {
      const scriptReady = await loadRazorpayScript();
      const planKey = `${tier}_${cycle}`;
      const planId = config?.plans?.[planKey]?.plan_id;

      const subRes = await billing.subscribe({
        plan_id: planId,
        tier,
        interval: cycle,
      });

      if (subRes.short_url) {
        setHostedUrl(subRes.short_url);
      }

      const razorpayKey = subRes.razorpay_key_id || config?.razorpay_key_id;

      if (scriptReady && window.Razorpay && razorpayKey) {
        const rzp = new window.Razorpay({
          key: razorpayKey,
          subscription_id: subRes.subscription_id,
          name: "A2A Firewall",
          description: `${tier.toUpperCase()} Subscription (${cycle})`,
          image: "/a2a-logo.png",
          handler: async function (response: any) {
            try {
              await billing.verify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_signature: response.razorpay_signature,
                tier,
              });
              toast({
                title: "Subscription Activated!",
                description: `Successfully upgraded to the ${tier.toUpperCase()} tier.`,
                variant: "success",
              });
              refresh();
            } catch {
              toast({
                title: "Payment Received",
                description: "Syncing plan activation status...",
                variant: "info",
              });
              refresh();
            }
          },
          theme: { color: "#6366f1" },
        });

        rzp.on("payment.failed", function (response: any) {
          toast({
            title: "Payment Cancelled or Failed",
            description: response.error?.description || "Payment attempt incomplete.",
            variant: "error",
          });
        });

        rzp.open();
      } else if (subRes.short_url) {
        // If popup script is blocked or key requires hosted checkout
        window.open(subRes.short_url, "_blank");
      } else {
        // Instant simulated activation for testing if keys are not live yet
        await billing.demoUpgrade(tier);
        toast({
          title: "Demo Plan Activated",
          description: `Switched to ${tier.toUpperCase()} tier.`,
          variant: "success",
        });
        refresh();
      }
    } catch (err) {
      toast({
        title: "Checkout Error",
        description: err instanceof Error ? err.message : "Failed to launch Razorpay checkout.",
        variant: "error",
      });
    } finally {
      setUpgrading(null);
    }
  }

  async function handleFastDemoUpgrade(tier: string) {
    setUpgrading(tier);
    try {
      await billing.demoUpgrade(tier);
      toast({
        title: "Demo Mode Switched",
        description: `Active tier is now ${tier.toUpperCase()}. All corresponding gates and quotas are unlocked.`,
        variant: "success",
      });
      refresh();
    } catch (err) {
      toast({
        title: "Demo Upgrade Failed",
        description: err instanceof Error ? err.message : "Error switching tier",
        variant: "error",
      });
    } finally {
      setUpgrading(null);
    }
  }

  async function handleCancelSubscription() {
    if (!confirm("Are you sure you want to cancel your subscription at the end of the billing period?")) return;
    try {
      await billing.cancel();
      toast({
        title: "Subscription Scheduled to Cancel",
        description: "Your access continues until the end of the current billing cycle.",
        variant: "info",
      });
      refresh();
    } catch (err) {
      toast({
        title: "Cancellation Error",
        description: err instanceof Error ? err.message : "Failed to cancel subscription",
        variant: "error",
      });
    }
  }

  return (
    <div className="space-y-6 max-w-6xl pb-16">
      <PageHeader
        title="Billing & Subscription Management"
        description="Manage your enterprise tier, Razorpay subscriptions, inspection quotas, and LLM governance entitlements."
      />

      {/* Active Tier Overview Banner */}
      <Card className="material-base relative overflow-hidden border-hairline bg-gradient-to-r from-surface to-surface-elevated">
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">
                  Current Account Tier
                </span>
                <Badge
                  variant={
                    currentTier === "enterprise"
                      ? "default"
                      : currentTier === "team"
                      ? "success"
                      : currentTier === "pro"
                      ? "warning"
                      : "secondary"
                  }
                  className="font-mono text-[11px] px-2.5 py-0.5 uppercase tracking-wide font-bold"
                >
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                  {currentTier}
                </Badge>
              </div>

              <h2 className="mt-2 text-xl font-bold tracking-tight text-ink-primary">
                {currentTier === "enterprise" && "Enterprise Security Mesh"}
                {currentTier === "team" && "Team Governance Tier"}
                {currentTier === "pro" && "Pro Developer Tier"}
                {currentTier === "free" && "Community Free Tier"}
              </h2>

              <p className="mt-1 text-xs text-ink-muted leading-relaxed max-w-2xl">
                {currentTier === "enterprise" &&
                  "Unlimited inspections, all 6 security gates, Layer 4 Groq LLM detection, DLP vault, real-time alerts, and dedicated enterprise support."}
                {currentTier === "team" &&
                  "500,000 inspections/mo, Layer 4 semantic LLM inspection, DLP tokenization vault, real-time alerting, and 90-day retention."}
                {currentTier === "pro" &&
                  "100,000 inspections/mo, Layer 4 semantic LLM inspection, DLP tokenization vault, MCP proxy, and 30-day retention."}
                {currentTier === "free" &&
                  "10,000 inspections/mo, 6-gate deterministic pipeline, 1 workspace, 2 API keys, and 7-day retention. Upgrade to Pro or Team for the semantic LLM layer and DLP vault."}
              </p>
            </div>

            {subData?.subscription?.status === "active" && (
              <div className="flex flex-col sm:items-end gap-2 shrink-0">
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 size={13} />
                  Razorpay Auto-Renew Active
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelSubscription}
                  className="text-xs font-mono h-8 border-hairline text-ink-muted hover:text-red-400"
                >
                  Cancel Renewal
                </Button>
              </div>
            )}
          </div>

          {/* Entitlement Badges */}
          <div className="mt-6 pt-5 border-t border-hairline grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-hairline/60 bg-surface/50 p-3">
              <div className="text-[11px] text-ink-muted flex items-center gap-1">
                <Layers size={13} className="text-accent" />
                Monthly Quota
              </div>
              <div className="text-sm font-semibold font-mono text-ink-primary mt-1">
                {currentTier === "enterprise"
                  ? "Unlimited"
                  : currentTier === "team"
                  ? "500,000"
                  : currentTier === "pro"
                  ? "100,000"
                  : "10,000"}
              </div>
            </div>

            <div className="rounded-xl border border-hairline/60 bg-surface/50 p-3">
              <div className="text-[11px] text-ink-muted flex items-center gap-1">
                <Sparkles size={13} className="text-amber-400" />
                Layer 4 LLM Gate
              </div>
              <div className="text-sm font-semibold font-mono text-ink-primary mt-1">
                {currentTier === "free" ? (
                  <span className="text-ink-muted">Locked (Pro+)</span>
                ) : (
                  <span className="text-emerald-400">Enabled</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-hairline/60 bg-surface/50 p-3">
              <div className="text-[11px] text-ink-muted flex items-center gap-1">
                <Lock size={13} className="text-indigo-400" />
                DLP Token Vault
              </div>
              <div className="text-sm font-semibold font-mono text-ink-primary mt-1">
                {currentTier === "free" ? (
                  <span className="text-ink-muted">Locked (Pro+)</span>
                ) : (
                  <span className="text-emerald-400">Enabled</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-hairline/60 bg-surface/50 p-3">
              <div className="text-[11px] text-ink-muted flex items-center gap-1">
                <Clock size={13} className="text-sky-400" />
                Audit Retention
              </div>
              <div className="text-sm font-semibold font-mono text-ink-primary mt-1">
                {currentTier === "enterprise"
                  ? "365 Days"
                  : currentTier === "team"
                  ? "90 Days"
                  : currentTier === "pro"
                  ? "30 Days"
                  : "7 Days"}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Hosted Payment Fallback Alert if generated */}
      {hostedUrl && (
        <div className="p-4 rounded-xl border border-accent/40 bg-accent/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-xs text-ink-primary">
            <CreditCard size={16} className="text-accent" />
            <span>Razorpay payment page ready. Complete the transaction via the hosted checkout link:</span>
          </div>
          <a
            href={hostedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-mono font-semibold text-accent hover:underline"
          >
            Open Payment Link <ExternalLink size={13} />
          </a>
        </div>
      )}

      {/* Plan Selection Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink-primary">Available Subscription Plans</h3>
            <p className="text-xs text-ink-muted">
              Payments processed securely by Razorpay. Prices in INR inclusive of applicable taxes.
            </p>
          </div>

          {/* Billing Cycle Toggle */}
          <div className="inline-flex items-center gap-1 rounded-xl border border-hairline bg-surface p-1">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={`rounded-lg px-3 py-1 font-mono text-[11px] font-medium transition-all ${
                cycle === "monthly"
                  ? "bg-accent/15 text-accent border border-accent/40 font-semibold"
                  : "text-ink-muted hover:text-ink-primary"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setCycle("annual")}
              className={`rounded-lg px-3 py-1 font-mono text-[11px] font-medium transition-all ${
                cycle === "annual"
                  ? "bg-accent/15 text-accent border border-accent/40 font-semibold"
                  : "text-ink-muted hover:text-ink-primary"
              }`}
            >
              Annual <span className="text-[10px] text-emerald-400 font-bold ml-1">Save ~17%</span>
            </button>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {/* Free Tier Card */}
          <Card className={`material-base flex flex-col p-6 rounded-2xl border ${currentTier === "free" ? "border-accent/40 bg-surface-elevated/40" : "border-hairline"}`}>
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-ink-primary">Free</h4>
              {currentTier === "free" && (
                <Badge variant="secondary" className="font-mono text-[10px]">
                  Active Plan
                </Badge>
              )}
            </div>
            <p className="mt-1.5 text-xs text-ink-muted min-h-[32px]">
              Evaluate the complete deterministic inspection pipeline.
            </p>

            <div className="mt-4 border-b border-hairline pb-4">
              <div className="text-2xl font-bold font-mono text-ink-primary">₹0</div>
              <p className="text-[11px] font-mono text-ink-muted mt-0.5">No card required · Forever free</p>
            </div>

            <ul className="mt-4 space-y-2 flex-1 text-xs text-ink-muted">
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>10,000 inspections / month</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>1 workspace &middot; 2 API keys</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>7-day log retention</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>Full 6-gate inspection pipeline</span>
              </li>
              <li className="flex items-center gap-2 text-ink-muted/50">
                <span className="w-3.5 text-center text-xs">✕</span>
                <span>Layer 4 Semantic LLM Layer</span>
              </li>
            </ul>

            <Button
              variant="outline"
              disabled={currentTier === "free"}
              className="mt-6 w-full font-mono text-xs"
            >
              {currentTier === "free" ? "Current Plan" : "Included"}
            </Button>
          </Card>

          {/* Pro Tier Card */}
          <Card className={`material-base flex flex-col p-6 rounded-2xl border relative ${currentTier === "pro" ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-accent/40 shadow-card-hover"}`}>
            <span className="absolute -top-2.5 left-6 rounded-full border border-accent/40 bg-accent px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white">
              Popular
            </span>

            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-ink-primary">Pro</h4>
              {currentTier === "pro" && (
                <Badge variant="warning" className="font-mono text-[10px]">
                  Active Plan
                </Badge>
              )}
            </div>
            <p className="mt-1.5 text-xs text-ink-muted min-h-[32px]">
              Semantic LLM detection, DLP vault, and MCP proxy for active operators.
            </p>

            <div className="mt-4 border-b border-hairline pb-4">
              <div className="text-2xl font-bold font-mono text-ink-primary">
                {cycle === "annual" ? "₹14,990" : "₹1,499"}
                <span className="text-xs font-normal text-ink-muted ml-1">
                  /{cycle === "annual" ? "year" : "month"}
                </span>
              </div>
              <p className="text-[11px] font-mono text-ink-muted mt-0.5">
                {cycle === "annual" ? "Billed annually (₹1,249/mo equivalent)" : "Billed monthly"}
              </p>
            </div>

            <ul className="mt-4 space-y-2 flex-1 text-xs text-ink-muted">
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span className="text-ink-primary font-medium">100,000 inspections / month</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span className="text-ink-primary font-medium">Layer 4 Semantic Groq LLM Gate</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>DLP vault &amp; PII tokenization</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>MCP reverse proxy &amp; tool security</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>3 workspaces &middot; 10 API keys</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>30-day log retention</span>
              </li>
            </ul>

            <Button
              variant={currentTier === "pro" ? "outline" : "primary"}
              disabled={currentTier === "pro" || upgrading !== null}
              onClick={() => handleUpgrade("pro")}
              className="mt-6 w-full font-mono text-xs"
            >
              {upgrading === "pro" ? (
                <>
                  <Loader2 size={13} className="mr-1.5 animate-spin" />
                  Opening Razorpay...
                </>
              ) : currentTier === "pro" ? (
                "Current Plan"
              ) : (
                <>
                  Upgrade to Pro
                  <ArrowRight size={13} className="ml-1" />
                </>
              )}
            </Button>
          </Card>

          {/* Team Tier Card */}
          <Card className={`material-base flex flex-col p-6 rounded-2xl border ${currentTier === "team" ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-hairline"}`}>
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-ink-primary">Team</h4>
              {currentTier === "team" && (
                <Badge variant="success" className="font-mono text-[10px]">
                  Active Plan
                </Badge>
              )}
            </div>
            <p className="mt-1.5 text-xs text-ink-muted min-h-[32px]">
              Shared multi-agent governance with alerting, RBAC, and longer retention.
            </p>

            <div className="mt-4 border-b border-hairline pb-4">
              <div className="text-2xl font-bold font-mono text-ink-primary">
                {cycle === "annual" ? "₹49,990" : "₹4,999"}
                <span className="text-xs font-normal text-ink-muted ml-1">
                  /{cycle === "annual" ? "year" : "month"}
                </span>
              </div>
              <p className="text-[11px] font-mono text-ink-muted mt-0.5">
                {cycle === "annual" ? "Billed annually (₹4,166/mo equivalent)" : "Billed monthly"}
              </p>
            </div>

            <ul className="mt-4 space-y-2 flex-1 text-xs text-ink-muted">
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span className="text-ink-primary font-medium">500,000 inspections / month</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>Everything in Pro</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span className="text-ink-primary font-medium">Real-time webhook &amp; SOC alerts</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>RBAC permissions &amp; audit export</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>10 workspaces &middot; 50 API keys &middot; 25 members</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={13} className="text-emerald-400 shrink-0" />
                <span>90-day log retention</span>
              </li>
            </ul>

            <Button
              variant={currentTier === "team" ? "outline" : "primary"}
              disabled={currentTier === "team" || upgrading !== null}
              onClick={() => handleUpgrade("team")}
              className="mt-6 w-full font-mono text-xs"
            >
              {upgrading === "team" ? (
                <>
                  <Loader2 size={13} className="mr-1.5 animate-spin" />
                  Opening Razorpay...
                </>
              ) : currentTier === "team" ? (
                "Current Plan"
              ) : (
                <>
                  Upgrade to Team
                  <ArrowRight size={13} className="ml-1" />
                </>
              )}
            </Button>
          </Card>
        </div>
      </div>

      {/* Instant Demo Switcher Card */}
      <Card className="material-base p-5 border-dashed border-accent/40 bg-accent/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase font-mono tracking-wider">
              <Sliders size={14} />
              Instant Demo Tier Switcher
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Demonstrate the platform live under any tier without making test card payments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["free", "pro", "team", "enterprise"] as const).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={currentTier === t ? "primary" : "secondary"}
                disabled={upgrading !== null}
                onClick={() => handleFastDemoUpgrade(t)}
                className="font-mono text-xs h-7 uppercase px-2.5"
              >
                {t}
              </Button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
