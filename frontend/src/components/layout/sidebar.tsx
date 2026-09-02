"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  ShieldAlert,
  Bot,
  FileText,
  MessageSquare,
  Activity,
  KeyRound,
  GitFork,
  Settings2,
  LogOut,
  Link2,
  FlaskConical,
  Flame,
  Siren,
  Shield,
  ScrollText,
  DollarSign,
  Users,
  Network,
  Database,
  Brain,
  FileCheck,
  GitMerge,
  Lock,
  UserCheck,
} from "lucide-react";
import { useApiKey } from "@/hooks/use-api-key";

interface NavSection {
  title: string;
  items: Array<{
    href: string;
    label: string;
    icon: any;
    badge?: string;
  }>;
}

const SECTIONS: NavSection[] = [
  {
    title: "Operations",
    items: [
      { href: "/dashboard", label: "SOC Dashboard", icon: Siren },
      { href: "/dashboard/telemetry", label: "Live Inspector", icon: Activity },
      { href: "/dashboard/review", label: "Review Queue", icon: MessageSquare },
      { href: "/dashboard/violations", label: "Violations", icon: ShieldAlert },
    ],
  },
  {
    title: "Agent Security Fabric",
    items: [
      { href: "/dashboard/evidence", label: "Evidence Envelopes", icon: FileCheck, badge: "v1.2" },
      { href: "/dashboard/memory", label: "Memory / RAG Firewall", icon: Brain, badge: "v1.2" },
      { href: "/dashboard/workflows", label: "Multi-Agent Workflows", icon: GitMerge, badge: "v1.2" },
      { href: "/dashboard/dlp", label: "DLP & Tokenization", icon: Lock, badge: "v1.2" },
    ],
  },
  {
    title: "Governance & Control",
    items: [
      { href: "/dashboard/spend", label: "Spend & Budgets", icon: DollarSign },
      { href: "/dashboard/rbac", label: "Access & RBAC", icon: Users },
      { href: "/dashboard/network", label: "Network & IP Filter", icon: Network },
      { href: "/dashboard/compliance", label: "Compliance & Posture", icon: ScrollText },
      { href: "/dashboard/audit", label: "Enterprise Audit Logs", icon: GitFork },
      { href: "/dashboard/retention", label: "Data Retention", icon: Database },
      { href: "/dashboard/scim", label: "SCIM Provisioning", icon: UserCheck },
      { href: "/dashboard/ips", label: "IPS Signatures", icon: Shield },
      { href: "/dashboard/identity", label: "Identity & Keys", icon: KeyRound },
      { href: "/dashboard/agents", label: "Agent Registry", icon: Bot },
      { href: "/dashboard/policies", label: "Firewall Policies", icon: FileText },
    ],
  },
  {
    title: "Labs & Demos",
    items: [
      { href: "/dashboard/demo", label: "Live Attack Demo", icon: Flame },
      { href: "/dashboard/delegation-demo", label: "Delegation Demo", icon: Link2 },
      { href: "/dashboard/simulation", label: "Simulation", icon: FlaskConical },
      { href: "/dashboard/workspace", label: "Workspace", icon: Settings2 },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { clear } = useApiKey();
  const router = useRouter();

  function handleLogout() {
    clear();
    router.push("/login");
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[240px] flex-col material-soft border-r border-hairline bg-surface/80">
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-5 border-b border-hairline">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-allow/10 border border-allow/25 p-1 glow-allow transition-all group-hover:scale-105 shadow-sm">
            <Image
              src="/a2a-logo.png"
              alt="A2A Logo"
              width={28}
              height={28}
              className="object-contain"
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[14px] font-bold tracking-tight text-ink-primary flex items-center gap-1">
              A2A Firewall
              <span className="text-[9px] font-mono px-1 rounded bg-accent/15 text-accent border border-accent/25">
                v2.0
              </span>
            </span>
            <span className="text-[10px] font-mono text-ink-muted">Zero-Trust Agent Mesh</span>
          </div>
        </Link>
      </div>

      {/* Nav List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="eyebrow px-2 mb-1.5 text-[10px] uppercase font-mono tracking-wider text-ink-muted/80">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={clsx(
                        "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-140",
                        active
                          ? "bg-surface-elevated text-ink-primary border border-hairline-strong shadow-sm"
                          : "text-ink-muted hover:text-ink-primary hover:bg-surface-elevated/50 border border-transparent"
                      )}
                    >
                      <Icon
                        size={15}
                        strokeWidth={active ? 2.1 : 1.7}
                        className={clsx(
                          "shrink-0 transition-colors",
                          active ? "text-accent" : "text-ink-muted group-hover:text-ink-primary"
                        )}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-accent/10 text-accent border border-accent/20">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-hairline p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-ink-muted transition-colors hover:bg-surface-elevated hover:text-ink-primary border border-transparent hover:border-hairline"
        >
          <LogOut size={15} strokeWidth={1.7} />
          <span className="font-medium">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
