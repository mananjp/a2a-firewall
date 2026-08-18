"use client";

import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import type { ReactNode } from "react";
import type { Verdict } from "./store";

export function PageHead({ index, title, subtitle, action }: { index: string; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink/20 pb-6">
      <div className="min-w-0">
        <span className="label-mono text-violet">{index}</span>
        <h1 className="mt-3 font-display text-3xl font-extrabold uppercase tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl font-mono text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border border-ink/20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/20 bg-secondary px-4 py-3">
        <h2 className="font-display text-sm font-extrabold uppercase tracking-tight">{title}</h2>
        {hint && <span className="label-mono text-muted-foreground">{hint}</span>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-paper px-5 py-6">
      <div className="label-mono text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-2xl font-extrabold">{value}</div>
      {note && <div className="mt-1 font-mono text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-px border border-ink/20 bg-ink/15 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

export function VerdictChip({ verdict }: { verdict: Verdict | string }) {
  const style =
    verdict === "ALLOW"
      ? "bg-lime text-lime-foreground"
      : verdict === "BLOCK"
        ? "bg-danger text-destructive-foreground"
        : "bg-violet text-violet-foreground";
  const Icon = verdict === "ALLOW" ? ShieldCheck : verdict === "BLOCK" ? ShieldX : ShieldAlert;
  return (
    <span className={`inline-flex items-center gap-1.5 border border-ink px-2 py-1 label-mono ${style}`}>
      <Icon className="h-3 w-3" />
      {verdict}
    </span>
  );
}

export function Bar({ value, tone = "violet" }: { value: number; tone?: "violet" | "lime" | "danger" }) {
  const bg = tone === "lime" ? "bg-lime" : tone === "danger" ? "bg-danger" : "bg-violet";
  return (
    <div className="h-1.5 w-full bg-ink/10">
      <div className={`h-full ${bg}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = "outline",
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "outline" | "solid" | "lime" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles =
    variant === "solid"
      ? "border-ink bg-ink text-paper hover:bg-violet hover:border-violet"
      : variant === "lime"
        ? "border-ink bg-lime text-lime-foreground hover:bg-ink hover:text-paper"
        : variant === "danger"
          ? "border-ink bg-danger text-destructive-foreground hover:bg-ink"
          : "border-ink bg-transparent hover:bg-secondary";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 border px-3 py-2 label-mono transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label-mono text-muted-foreground">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

export const inputCls =
  "w-full border border-ink bg-paper px-3 py-2 font-mono text-xs outline-none focus:border-violet focus:ring-2 focus:ring-violet/30";

export function Terminal({ lines, title = "kernel trace" }: { lines: string[]; title?: string }) {
  return (
    <div className="border border-ink bg-ink p-4 text-paper">
      <div className="label-mono text-paper/50">a2a-kernel@mesh-soc:~ {title}</div>
      <pre className="mt-3 max-h-72 overflow-auto font-mono text-[11px] leading-relaxed">
        {lines.length ? lines.join("\n") : "// no output"}
      </pre>
    </div>
  );
}

export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "lime" | "violet" | "danger" }) {
  const cls =
    tone === "lime"
      ? "bg-lime text-lime-foreground"
      : tone === "violet"
        ? "bg-violet text-violet-foreground"
        : tone === "danger"
          ? "bg-danger text-destructive-foreground"
          : "bg-secondary text-muted-foreground";
  return <span className={`inline-block border border-ink/30 px-2 py-0.5 font-mono text-[10px] uppercase ${cls}`}>{children}</span>;
}
