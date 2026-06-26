import { useCallback } from "react";
import { Hero } from "../components/landing/Hero";
import { Features } from "../components/landing/Features";
import { Pipeline } from "../components/landing/Pipeline";
import { Footer } from "../components/landing/Footer";
import { AuthPanel } from "../components/auth/AuthPanel";

export default function LandingPage() {
  const scrollToAuth = useCallback(() => {
    const target = document.getElementById("auth");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      const firstInput = target.querySelector<HTMLInputElement>("input,button[role='tab']");
      firstInput?.focus({ preventScroll: true });
    }
  }, []);

  return (
    <div className="min-h-screen bg-firewall-surface text-slate-100" data-testid="landing-page">
      <Hero onSignInClick={scrollToAuth} />

      <section id="auth" className="relative mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <span className="chip">Authentication</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Choose how to enter the firewall.
            </h2>
            <p className="mt-3 text-slate-400">
              Three production-grade flows and four ready-made demo workspaces. Pick the
              path that matches your task — every option ends in the same dashboard.
            </p>

            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              <Bullet n="1" label="Sign in" body="Rotate the API key for an existing workspace email." />
              <Bullet n="2" label="Register" body="Provision a fresh workspace and receive an admin key." />
              <Bullet n="3" label="Use API key" body="Paste a ws_… key directly if you already have one." />
              <Bullet n="4" label="Test roles" body="One-click sign-in as admin, auditor, trial, or traffic." />
            </ul>

            <div className="mt-8 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-200">
              <div className="font-semibold uppercase tracking-wider">Dev-only build</div>
              <p className="mt-1 text-amber-200/80">
                This build uses localStorage and a key-rotation login endpoint. Disable
                DEBUG and replace the auth flow before any production deploy.
              </p>
            </div>
          </div>

          <div className="lg:col-span-7">
            <AuthPanel />
          </div>
        </div>
      </section>

      <Features />
      <Pipeline />
      <Footer />
    </div>
  );
}

function Bullet({ n, label, body }: { n: string; label: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 font-mono text-xs text-slate-300">
        {n}
      </span>
      <span>
        <span className="font-semibold text-white">{label}</span>{" "}
        <span className="text-slate-400">— {body}</span>
      </span>
    </li>
  );
}
